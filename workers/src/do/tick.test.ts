import {
  broadcastSnapshot,
  handleClientMessage,
  runAlarmCycle,
  snapshotMessage,
  type SocketLike,
  type TickGame,
} from './tick';
import type { DB } from '../../../shared/db/supabase';
import type { EngineUpdate, GameStateDiff, SerializedWorld } from '../../../shared/aiWorld/types';

// ---------- helpers ---------------------------------------------------------

function fakeWorldState(): SerializedWorld {
  return { nextId: 0, players: [], conversations: [], agents: [] };
}

interface FakeGame extends TickGame {
  runStepCalls: Array<[DB, number]>;
  runStepImpl: (
    db: DB,
    now: number,
  ) => Promise<{ update: EngineUpdate; diff: GameStateDiff }>;
}

function defaultStepResult(): { update: EngineUpdate; diff: GameStateDiff } {
  return {
    update: {
      engine: {
        currentTime: 1,
        generationNumber: 1,
        processedInputNumber: 0,
        running: true,
      },
      expectedGenerationNumber: 0,
      completedInputs: [],
    },
    diff: { world: fakeWorldState(), agentOperations: [] },
  };
}

function makeGame(): FakeGame {
  const world: SerializedWorld = fakeWorldState();
  const game: FakeGame = {
    engine: { id: 'engine-1' },
    world: { serialize: () => world },
    runStepCalls: [],
    runStepImpl: async () => defaultStepResult(),
    runStep(db, now) {
      this.runStepCalls.push([db, now]);
      return this.runStepImpl(db, now);
    },
  };
  return game;
}

interface RecordingSocket extends SocketLike {
  sent: string[];
}

function recordingSocket(): RecordingSocket {
  const sent: string[] = [];
  return {
    sent,
    send(msg: string) {
      sent.push(msg);
    },
  };
}

interface Recorder<Args extends unknown[] = unknown[]> {
  (...args: Args): Promise<void>;
  calls: Args[];
}

function recorder<Args extends unknown[] = unknown[]>(
  impl: (...args: Args) => Promise<void> = async () => {},
): Recorder<Args> {
  const calls: Args[] = [];
  const fn = (async (...args: Args) => {
    calls.push(args);
    return impl(...args);
  }) as Recorder<Args>;
  fn.calls = calls;
  return fn;
}

// Chainable Supabase mock. Each table has a queue of pre-canned responses for
// the terminal methods (.single / .maybeSingle / awaited update/insert).
type Resp = { data?: unknown; error?: unknown };
type TableScript = { single?: Resp[]; maybeSingle?: Resp[]; thenable?: Resp[] };

function mockDb(scripts: Record<string, TableScript> = {}) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];

  function shift(table: string, key: keyof TableScript): Resp {
    const arr = scripts[table]?.[key];
    if (arr && arr.length) return arr.shift()!;
    return { data: null, error: null };
  }

  function build(table: string) {
    const chain = {
      select(...a: unknown[]) {
        calls.push({ table, method: 'select', args: a });
        return chain;
      },
      eq(...a: unknown[]) {
        calls.push({ table, method: 'eq', args: a });
        return chain;
      },
      gt(...a: unknown[]) {
        calls.push({ table, method: 'gt', args: a });
        return chain;
      },
      order(...a: unknown[]) {
        calls.push({ table, method: 'order', args: a });
        return chain;
      },
      limit(...a: unknown[]) {
        calls.push({ table, method: 'limit', args: a });
        return chain;
      },
      insert(values: unknown) {
        calls.push({ table, method: 'insert', args: [values] });
        return chain;
      },
      update(values: unknown) {
        calls.push({ table, method: 'update', args: [values] });
        return chain;
      },
      upsert(values: unknown, opts?: unknown) {
        calls.push({ table, method: 'upsert', args: [values, opts] });
        return chain;
      },
      single() {
        return Promise.resolve(shift(table, 'single'));
      },
      maybeSingle() {
        return Promise.resolve(shift(table, 'maybeSingle'));
      },
      then(resolve: (v: Resp) => void) {
        resolve(shift(table, 'thenable'));
      },
    };
    return chain;
  }

  const db = { from: (t: string) => build(t) } as unknown as DB;
  return { db, calls };
}

// ---------- snapshotMessage / broadcastSnapshot -----------------------------

describe('snapshotMessage', () => {
  it('serializes the engine doc and the world state into a snapshot frame', () => {
    const game = makeGame();
    expect(snapshotMessage(game)).toEqual({
      type: 'snapshot',
      engine: { id: 'engine-1' },
      world: fakeWorldState(),
    });
  });
});

describe('broadcastSnapshot', () => {
  it('sends the same JSON snapshot to every connected socket', () => {
    const a = recordingSocket();
    const b = recordingSocket();
    const c = recordingSocket();
    broadcastSnapshot([a, b, c], makeGame());
    const expected = JSON.stringify(snapshotMessage(makeGame()));
    expect(a.sent).toEqual([expected]);
    expect(b.sent).toEqual([expected]);
    expect(c.sent).toEqual([expected]);
  });

  it('does not let one dead socket break the broadcast', () => {
    const good = recordingSocket();
    const bad: SocketLike = {
      send() {
        throw new Error('socket closed');
      },
    };
    expect(() => broadcastSnapshot([bad, good], makeGame())).not.toThrow();
    expect(good.sent).toHaveLength(1);
  });
});

// ---------- handleClientMessage --------------------------------------------

describe('handleClientMessage: subscribe', () => {
  it('replies with a snapshot frame and arms the alarm', async () => {
    const { db } = mockDb();
    const game = makeGame();
    const socket = recordingSocket();
    const ensureAlarm = recorder();

    await handleClientMessage({ db, game, socket, ensureAlarm }, { type: 'subscribe' });

    expect(socket.sent).toEqual([JSON.stringify(snapshotMessage(game))]);
    expect(ensureAlarm.calls).toHaveLength(1);
  });
});

describe('handleClientMessage: sendInput', () => {
  // insertInput does: SELECT max(number) → INSERT new row.
  function inputsDb() {
    const calls: { table: string; method: string; args: unknown[] }[] = [];
    let phase: 'select' | 'insert' = 'select';
    const chain = {
      select(...a: unknown[]) {
        calls.push({ table: 'inputs', method: 'select', args: a });
        return chain;
      },
      eq(...a: unknown[]) {
        calls.push({ table: 'inputs', method: 'eq', args: a });
        return chain;
      },
      order(...a: unknown[]) {
        calls.push({ table: 'inputs', method: 'order', args: a });
        return chain;
      },
      limit(...a: unknown[]) {
        calls.push({ table: 'inputs', method: 'limit', args: a });
        return chain;
      },
      insert(values: unknown) {
        phase = 'insert';
        calls.push({ table: 'inputs', method: 'insert', args: [values] });
        return chain;
      },
      maybeSingle() {
        return Promise.resolve({ data: null, error: null });
      },
      single() {
        return Promise.resolve(
          phase === 'insert'
            ? { data: { id: 'input-99' }, error: null }
            : { data: null, error: null },
        );
      },
    };
    return { db: { from: () => chain } as unknown as DB, calls };
  }

  it('inserts an input row keyed by the engine id', async () => {
    const { db, calls } = inputsDb();
    const socket = recordingSocket();
    const ensureAlarm = recorder();

    await handleClientMessage(
      { db, game: makeGame(), socket, ensureAlarm },
      { type: 'sendInput', name: 'join', args: { name: 'alice' } },
    );

    const insertCall = calls.find((c) => c.method === 'insert')!;
    const row = insertCall.args[0] as { engine_id: string; name: string; args: unknown };
    expect(row.engine_id).toBe('engine-1');
    expect(row.name).toBe('join');
    expect(row.args).toEqual({ name: 'alice' });
    // No correlationId → no inputAccepted ack.
    expect(socket.sent).toEqual([]);
    expect(ensureAlarm.calls).toHaveLength(1);
  });

  it('only sends inputAccepted when the client supplies a correlationId', async () => {
    const { db } = inputsDb();
    const socket = recordingSocket();
    await handleClientMessage(
      { db, game: makeGame(), socket, ensureAlarm: recorder() },
      { type: 'sendInput', name: 'join', args: {}, correlationId: 'abc' },
    );
    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'inputAccepted',
      correlationId: 'abc',
      inputId: 'input-99',
    });
  });
});

// ---------- runAlarmCycle ---------------------------------------------------

describe('runAlarmCycle', () => {
  // saveGameDiff first reads `worlds.state` (existing world doc) so it can
  // diff archived rows. We arrange the mock to return the same empty world
  // for both the read and the (no-op) update.
  function persistenceDb(status: string | null) {
    return mockDb({
      engines: { thenable: [{ data: null, error: null }] },
      worlds: {
        single: [{ data: { state: fakeWorldState() }, error: null }],
        thenable: [{ data: null, error: null }],
      },
      world_status:
        status === null
          ? { single: [{ data: null, error: null }] }
          : { single: [{ data: { status }, error: null }] },
    });
  }

  it('runs a step, persists, broadcasts, and reschedules when running', async () => {
    const { db, calls } = persistenceDb('running');
    const game = makeGame();
    const socket = recordingSocket();
    const setAlarm = recorder<[number]>();
    const dispatch = recorder<[string, unknown]>();

    await runAlarmCycle({
      db,
      game,
      worldId: 'world-1',
      now: 1000,
      sockets: [socket],
      setAlarm,
      dispatchOperation: dispatch,
    });

    expect(game.runStepCalls).toEqual([[db, 1000]]);
    // Broadcast hits the connected socket.
    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(socket.sent[0]).type).toBe('snapshot');
    // Engine update hits the engines table.
    const engineUpdate = calls.find(
      (c) => c.table === 'engines' && c.method === 'update',
    );
    expect(engineUpdate).toBeDefined();
    // World status was checked.
    expect(
      calls.some((c) => c.table === 'world_status' && c.method === 'select'),
    ).toBe(true);
    // The next alarm was scheduled (because status === 'running').
    expect(setAlarm.calls).toHaveLength(1);
    expect(dispatch.calls).toEqual([]);
  });

  it('does NOT reschedule when the world is stopped by developer', async () => {
    const { db } = persistenceDb('stoppedByDeveloper');
    const setAlarm = recorder<[number]>();
    await runAlarmCycle({
      db,
      game: makeGame(),
      worldId: 'world-1',
      now: 1000,
      sockets: [],
      setAlarm,
      dispatchOperation: recorder<[string, unknown]>(),
    });
    expect(setAlarm.calls).toEqual([]);
  });

  it('does NOT reschedule when world_status row is missing (treat as stopped)', async () => {
    const { db } = persistenceDb(null);
    const setAlarm = recorder<[number]>();
    await runAlarmCycle({
      db,
      game: makeGame(),
      worldId: 'world-1',
      now: 1000,
      sockets: [],
      setAlarm,
      dispatchOperation: recorder<[string, unknown]>(),
    });
    expect(setAlarm.calls).toEqual([]);
  });

  it('dispatches every queued agent operation produced by the step', async () => {
    const { db } = persistenceDb('running');
    const game = makeGame();
    game.runStepImpl = async () => ({
      update: {
        engine: {
          currentTime: 1,
          generationNumber: 1,
          processedInputNumber: 0,
          running: true,
        },
        expectedGenerationNumber: 0,
        completedInputs: [],
      },
      diff: {
        world: fakeWorldState(),
        agentOperations: [
          { name: 'agentDoSomething', args: { agentId: 'a:1' } },
          { name: 'agentGenerateMessage', args: { type: 'start' } },
        ],
      },
    });

    const dispatch = recorder<[string, unknown]>();
    await runAlarmCycle({
      db,
      game,
      worldId: 'world-1',
      now: 1000,
      sockets: [],
      setAlarm: recorder<[number]>(),
      dispatchOperation: dispatch,
    });

    expect(dispatch.calls).toEqual([
      ['agentDoSomething', { agentId: 'a:1' }],
      ['agentGenerateMessage', { type: 'start' }],
    ]);
  });

  it('broadcasts the snapshot to every connected socket', async () => {
    const { db } = persistenceDb('running');
    const sockets = [recordingSocket(), recordingSocket(), recordingSocket()];
    await runAlarmCycle({
      db,
      game: makeGame(),
      worldId: 'world-1',
      now: 1000,
      sockets,
      setAlarm: recorder<[number]>(),
      dispatchOperation: recorder<[string, unknown]>(),
    });
    for (const s of sockets) {
      expect(s.sent).toHaveLength(1);
      expect(JSON.parse(s.sent[0]).type).toBe('snapshot');
    }
  });

  it('propagates a runStep error so the DO can retry on the next alarm', async () => {
    const { db } = persistenceDb('running');
    const game = makeGame();
    game.runStepImpl = async () => {
      throw new Error('boom');
    };
    const setAlarm = recorder<[number]>();
    await expect(
      runAlarmCycle({
        db,
        game,
        worldId: 'w',
        now: 1,
        sockets: [],
        setAlarm,
        dispatchOperation: recorder<[string, unknown]>(),
      }),
    ).rejects.toThrow('boom');
    // Persist + reschedule must NOT happen if the step failed.
    expect(setAlarm.calls).toEqual([]);
  });
});
