import {
  setWorldStatus,
  heartbeatWorld,
  insertInput,
  completeInput,
  getInputResult,
  getDefaultWorldStatus,
  getWorldStatus,
  insertMessage,
  loadGameState,
  saveGameDiff,
} from './repository';
import type { DB } from './supabase';
import type {
  GameStateDiff,
  SerializedAgent,
  SerializedConversation,
  SerializedPlayer,
  SerializedWorld,
} from '../aiZoo/types';

type Call = { table: string; method: string; args: unknown[] };

// A tiny chainable mock that records the SupabaseClient calls the repository
// makes. Each terminal method (single, maybeSingle, the awaited update/insert)
// resolves with whatever the test pre-loaded.
function mockDb(table: Record<string, { data?: unknown; error?: unknown } | undefined>) {
  const calls: Call[] = [];

  function build(currentTable: string) {
    const chain = {
      select(..._args: unknown[]) {
        calls.push({ table: currentTable, method: 'select', args: _args });
        return chain;
      },
      eq(..._args: unknown[]) {
        calls.push({ table: currentTable, method: 'eq', args: _args });
        return chain;
      },
      gt(..._args: unknown[]) {
        calls.push({ table: currentTable, method: 'gt', args: _args });
        return chain;
      },
      order(..._args: unknown[]) {
        calls.push({ table: currentTable, method: 'order', args: _args });
        return chain;
      },
      limit(..._args: unknown[]) {
        calls.push({ table: currentTable, method: 'limit', args: _args });
        return chain;
      },
      insert(values: unknown) {
        calls.push({ table: currentTable, method: 'insert', args: [values] });
        return chain;
      },
      update(values: unknown) {
        calls.push({ table: currentTable, method: 'update', args: [values] });
        return chain;
      },
      single() {
        return Promise.resolve(table[currentTable] ?? { data: null, error: null });
      },
      maybeSingle() {
        return Promise.resolve(table[currentTable] ?? { data: null, error: null });
      },
      // For await on the chain (no terminal method called).
      then(resolve: (v: unknown) => void) {
        resolve(table[currentTable] ?? { data: null, error: null });
      },
    };
    return chain;
  }

  const db = {
    from(t: string) {
      return build(t);
    },
  };

  return { db: db as unknown as DB, calls };
}

describe('setWorldStatus', () => {
  it("updates world_status with the requested status filtered by world_id", async () => {
    const { db, calls } = mockDb({ world_status: { error: null } });
    await setWorldStatus(db, 'world-42', 'stoppedByDeveloper');
    expect(calls).toEqual([
      { table: 'world_status', method: 'update', args: [{ status: 'stoppedByDeveloper' }] },
      { table: 'world_status', method: 'eq', args: ['world_id', 'world-42'] },
    ]);
  });

  it('throws when Supabase returns an error', async () => {
    const { db } = mockDb({ world_status: { error: new Error('rls denied') } });
    await expect(setWorldStatus(db, 'w', 'running')).rejects.toThrow('rls denied');
  });

  it('accepts all three world_status_kind enum values', async () => {
    for (const status of ['running', 'stoppedByDeveloper', 'inactive'] as const) {
      const { db, calls } = mockDb({ world_status: { error: null } });
      await setWorldStatus(db, 'w', status);
      expect(calls[0]).toEqual({ table: 'world_status', method: 'update', args: [{ status }] });
    }
  });
});

describe('heartbeatWorld', () => {
  it('updates last_viewed for the matching world', async () => {
    const before = Date.now();
    const { db, calls } = mockDb({ world_status: { error: null } });
    await heartbeatWorld(db, 'w');
    const after = Date.now();
    const updateCall = calls.find((c) => c.method === 'update')!;
    expect(updateCall.table).toBe('world_status');
    const payload = updateCall.args[0] as { last_viewed: number };
    expect(payload.last_viewed).toBeGreaterThanOrEqual(before);
    expect(payload.last_viewed).toBeLessThanOrEqual(after);
  });
});

describe('insertInput', () => {
  // insertInput does two things: a SELECT to find the highest existing
  // `number` for this engine, then an INSERT with `number = max + 1`. The
  // mock has to return different values for the two reads.
  function inputsMock(prevNumber: number | null) {
    const calls: Call[] = [];
    let phase: 'select' | 'insert' = 'select';
    const chain = {
      select(..._args: unknown[]) {
        calls.push({ table: 'inputs', method: 'select', args: _args });
        return chain;
      },
      eq(..._args: unknown[]) {
        calls.push({ table: 'inputs', method: 'eq', args: _args });
        return chain;
      },
      order(..._args: unknown[]) {
        calls.push({ table: 'inputs', method: 'order', args: _args });
        return chain;
      },
      limit(..._args: unknown[]) {
        calls.push({ table: 'inputs', method: 'limit', args: _args });
        return chain;
      },
      insert(values: unknown) {
        phase = 'insert';
        calls.push({ table: 'inputs', method: 'insert', args: [values] });
        return chain;
      },
      maybeSingle() {
        return Promise.resolve(
          prevNumber === null
            ? { data: null, error: null }
            : { data: { number: prevNumber }, error: null },
        );
      },
      single() {
        if (phase === 'insert') {
          return Promise.resolve({ data: { id: 'i-new' }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
    };
    const db = { from: () => chain } as unknown as DB;
    return { db, calls };
  }

  it('assigns number=0 when no prior inputs exist for the engine', async () => {
    const { db, calls } = inputsMock(null);
    const id = await insertInput(db, 'engine-1', 'sendMessage', { text: 'hi' });
    expect(id).toBe('i-new');
    const insertCall = calls.find((c) => c.method === 'insert')!;
    const row = insertCall.args[0] as {
      engine_id: string;
      number: number;
      name: string;
      args: unknown;
    };
    expect(row.engine_id).toBe('engine-1');
    expect(row.number).toBe(0);
    expect(row.name).toBe('sendMessage');
    expect(row.args).toEqual({ text: 'hi' });
  });

  it('uses (max + 1) when prior inputs exist', async () => {
    const { db, calls } = inputsMock(7);
    await insertInput(db, 'engine-1', 'doX', null);
    const insertCall = calls.find((c) => c.method === 'insert')!;
    const row = insertCall.args[0] as { number: number };
    expect(row.number).toBe(8);
  });
});

describe('getInputResult', () => {
  it('returns null when the input has not been processed yet', async () => {
    const { db } = mockDb({
      inputs: { data: { return_kind: null, return_value: null, return_error: null }, error: null },
    });
    expect(await getInputResult(db, 'i1')).toBeNull();
  });

  it('shapes a successful result', async () => {
    const { db } = mockDb({
      inputs: { data: { return_kind: 'ok', return_value: { x: 1 }, return_error: null }, error: null },
    });
    expect(await getInputResult(db, 'i1')).toEqual({ kind: 'ok', value: { x: 1 } });
  });

  it('shapes an error result', async () => {
    const { db } = mockDb({
      inputs: { data: { return_kind: 'error', return_value: null, return_error: 'boom' }, error: null },
    });
    expect(await getInputResult(db, 'i1')).toEqual({ kind: 'error', message: 'boom' });
  });
});

describe('completeInput', () => {
  it('writes return_kind=ok with a value', async () => {
    const { db, calls } = mockDb({ inputs: { error: null } });
    await completeInput(db, 'i1', { kind: 'ok', value: { result: 42 } });
    const updateCall = calls.find((c) => c.method === 'update')!;
    expect(updateCall.args[0]).toEqual({
      return_kind: 'ok',
      return_value: { result: 42 },
      return_error: null,
    });
  });

  it('writes return_kind=error with a message', async () => {
    const { db, calls } = mockDb({ inputs: { error: null } });
    await completeInput(db, 'i1', { kind: 'error', message: 'nope' });
    const updateCall = calls.find((c) => c.method === 'update')!;
    expect(updateCall.args[0]).toEqual({
      return_kind: 'error',
      return_value: null,
      return_error: 'nope',
    });
  });
});

describe('getDefaultWorldStatus', () => {
  it('returns the default world row', async () => {
    const row = { world_id: 'w1', is_default: true, status: 'running' };
    const { db } = mockDb({ world_status: { data: row, error: null } });
    expect(await getDefaultWorldStatus(db)).toEqual(row);
  });
});

describe('getWorldStatus', () => {
  it('looks up world_status by world_id', async () => {
    const row = { world_id: 'w1', engine_id: 'e1', status: 'running', is_default: true };
    const { db, calls } = mockDb({ world_status: { data: row, error: null } });
    expect(await getWorldStatus(db, 'w1')).toEqual(row);
    expect(calls).toContainEqual({
      table: 'world_status',
      method: 'eq',
      args: ['world_id', 'w1'],
    });
  });

  it('throws when Supabase returns an error', async () => {
    const { db } = mockDb({ world_status: { error: new Error('not found') } });
    await expect(getWorldStatus(db, 'w1')).rejects.toThrow('not found');
  });
});

describe('insertMessage', () => {
  it('writes a row to messages with all required columns', async () => {
    const { db, calls } = mockDb({ messages: { error: null } });
    await insertMessage(db, 'w1', 'c1', 'msg-uuid', 'p:1', 'hello');
    const insertCall = calls.find((c) => c.method === 'insert')!;
    expect(insertCall.table).toBe('messages');
    expect(insertCall.args[0]).toEqual({
      world_id: 'w1',
      conversation_id: 'c1',
      message_uuid: 'msg-uuid',
      author: 'p:1',
      text: 'hello',
    });
  });

  it('throws when Supabase rejects the insert (e.g. unique violation)', async () => {
    const { db } = mockDb({
      messages: { error: { code: '23505', message: 'duplicate key' } },
    });
    await expect(insertMessage(db, 'w', 'c', 'm', 'p', 'x')).rejects.toMatchObject({
      message: 'duplicate key',
    });
  });
});

// ----------------------------------------------------------------------------
// loadGameState — verifies the four parallel Supabase reads are stitched into
// a single GameStateSnapshot with the right field naming (snake_case in
// Postgres, camelCase in the engine).
// ----------------------------------------------------------------------------

// loadGameState fans out four queries in parallel:
//   worlds (single)        → { state: SerializedWorld }
//   maps (single)          → row to convert via rowToMap
//   player_descriptions    → array (no terminal — awaited via thenable)
//   agent_descriptions     → array (no terminal — awaited via thenable)
//
// Our mockDb above doesn't tell `select(...)` apart from a thenable result
// when called WITHOUT a terminal. For loadGameState, two of the chains end
// in `.eq(...)` and are awaited directly, so the chain itself has to be
// thenable. We model that with a custom mock.
function loadStateMock(
  worldRow: { state: SerializedWorld },
  mapRow: Record<string, unknown>,
  pds: Array<Record<string, unknown>>,
  ads: Array<Record<string, unknown>>,
) {
  const calls: Call[] = [];
  function build(table: string) {
    const chain: any = {
      select(...a: unknown[]) {
        calls.push({ table, method: 'select', args: a });
        return chain;
      },
      eq(...a: unknown[]) {
        calls.push({ table, method: 'eq', args: a });
        // For the two array-returning tables, awaiting the eq chain itself
        // resolves to the row list.
        if (table === 'player_descriptions') {
          chain.then = (resolve: (v: unknown) => void) =>
            resolve({ data: pds, error: null });
        } else if (table === 'agent_descriptions') {
          chain.then = (resolve: (v: unknown) => void) =>
            resolve({ data: ads, error: null });
        }
        return chain;
      },
      single() {
        if (table === 'worlds') return Promise.resolve({ data: worldRow, error: null });
        if (table === 'maps') return Promise.resolve({ data: mapRow, error: null });
        return Promise.resolve({ data: null, error: null });
      },
    };
    return chain;
  }
  const db = { from: (t: string) => build(t) } as unknown as DB;
  return { db, calls };
}

describe('loadGameState', () => {
  const baseMap = {
    width: 32,
    height: 32,
    tile_set_url: '/assets/tiles.png',
    tile_set_dim_x: 256,
    tile_set_dim_y: 256,
    tile_dim: 16,
    bg_tiles: [],
    object_tiles: [],
    animated_sprites: [],
  };
  const baseWorld: SerializedWorld = {
    nextId: 5,
    players: [],
    conversations: [],
    agents: [],
  };

  it('aggregates the four reads into a GameStateSnapshot with camelCased fields', async () => {
    const { db, calls } = loadStateMock(
      { state: baseWorld },
      baseMap,
      [
        { player_id: 'p:1', name: 'Alice', description: 'curious', character: 'f1' },
      ],
      [{ agent_id: 'a:1', identity: 'I am Alice.', plan: 'Explore the zoo.' }],
    );

    const snapshot = await loadGameState(db, 'world-7');

    expect(snapshot.world).toEqual(baseWorld);
    expect(snapshot.worldMap).toEqual({
      width: 32,
      height: 32,
      tileSetUrl: '/assets/tiles.png',
      tileSetDimX: 256,
      tileSetDimY: 256,
      tileDim: 16,
      bgTiles: [],
      objectTiles: [],
      animatedSprites: [],
    });
    expect(snapshot.playerDescriptions).toEqual([
      { playerId: 'p:1', name: 'Alice', description: 'curious', character: 'f1' },
    ]);
    expect(snapshot.agentDescriptions).toEqual([
      { agentId: 'a:1', identity: 'I am Alice.', plan: 'Explore the zoo.' },
    ]);

    // Each table was filtered by the right id column.
    expect(calls).toContainEqual({ table: 'worlds', method: 'eq', args: ['id', 'world-7'] });
    expect(calls).toContainEqual({ table: 'maps', method: 'eq', args: ['world_id', 'world-7'] });
    expect(calls).toContainEqual({
      table: 'player_descriptions',
      method: 'eq',
      args: ['world_id', 'world-7'],
    });
    expect(calls).toContainEqual({
      table: 'agent_descriptions',
      method: 'eq',
      args: ['world_id', 'world-7'],
    });
  });

  it('treats null description arrays as empty so a fresh world loads cleanly', async () => {
    const { db } = loadStateMock(
      { state: baseWorld },
      baseMap,
      [], // pds
      [], // ads
    );
    const snapshot = await loadGameState(db, 'w');
    expect(snapshot.playerDescriptions).toEqual([]);
    expect(snapshot.agentDescriptions).toEqual([]);
  });
});

// ----------------------------------------------------------------------------
// saveGameDiff — verifies that removed players/conversations/agents are
// archived, that the world doc is replaced, and that descriptions get upserted.
// ----------------------------------------------------------------------------

function diffMock(existing: {
  players: SerializedPlayer[];
  conversations: SerializedConversation[];
  agents: SerializedAgent[];
}) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  function build(table: string) {
    const chain: any = {
      select(...a: unknown[]) {
        calls.push({ table, method: 'select', args: a });
        return chain;
      },
      eq(...a: unknown[]) {
        calls.push({ table, method: 'eq', args: a });
        // worlds.update().eq(...) is awaited, so chain must be thenable.
        chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
        return chain;
      },
      insert(values: unknown) {
        calls.push({ table, method: 'insert', args: [values] });
        // insert is awaited (no terminal), so make the chain thenable.
        chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
        return chain;
      },
      update(values: unknown) {
        calls.push({ table, method: 'update', args: [values] });
        return chain;
      },
      upsert(values: unknown, opts?: unknown) {
        calls.push({ table, method: 'upsert', args: [values, opts] });
        chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
        return chain;
      },
      single() {
        // Only `worlds` reads .single() in saveGameDiff (initial state read).
        if (table === 'worlds') {
          return Promise.resolve({ data: { state: existing }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
    };
    return chain;
  }
  const db = { from: (t: string) => build(t) } as unknown as DB;
  return { db, calls };
}

describe('saveGameDiff', () => {
  const playerA: SerializedPlayer = {
    id: 'p:1',
    lastInput: 0,
    position: { x: 0, y: 0 },
    facing: { dx: 1, dy: 0 },
    speed: 0,
  };
  const playerB: SerializedPlayer = {
    id: 'p:2',
    lastInput: 0,
    position: { x: 1, y: 1 },
    facing: { dx: 1, dy: 0 },
    speed: 0,
  };
  const convo: SerializedConversation = {
    id: 'c:1',
    creator: 'p:1',
    created: 100,
    numMessages: 3,
    lastMessage: { author: 'p:1', timestamp: 200 },
    participants: [
      { playerId: 'p:1', invited: 100, status: { kind: 'participating', started: 110 } },
      { playerId: 'p:2', invited: 100, status: { kind: 'participating', started: 110 } },
    ],
  };
  const agentA: SerializedAgent = { id: 'a:1', playerId: 'p:1' };

  function emptyDiff(world: SerializedWorld): GameStateDiff {
    return { world, agentOperations: [] };
  }

  it('replaces the worlds row with the new state', async () => {
    const { db, calls } = diffMock({ players: [], conversations: [], agents: [] });
    const newWorld: SerializedWorld = {
      nextId: 1,
      players: [playerA],
      conversations: [],
      agents: [],
    };
    await saveGameDiff(db, 'w', emptyDiff(newWorld));
    const updateCall = calls.find((c) => c.table === 'worlds' && c.method === 'update')!;
    expect((updateCall.args[0] as { state: unknown }).state).toEqual(newWorld);
  });

  it('archives players that disappeared between the existing and new world', async () => {
    const { db, calls } = diffMock({
      players: [playerA, playerB],
      conversations: [],
      agents: [],
    });
    const newWorld: SerializedWorld = {
      nextId: 2,
      players: [playerA], // playerB is gone
      conversations: [],
      agents: [],
    };
    await saveGameDiff(db, 'w', emptyDiff(newWorld));
    const archive = calls.find(
      (c) => c.table === 'archived_players' && c.method === 'insert',
    );
    expect(archive).toBeDefined();
    const rows = archive!.args[0] as Array<{ player_id: string; world_id: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].player_id).toBe('p:2');
    expect(rows[0].world_id).toBe('w');
  });

  it('archives conversations and writes a participated_together edge per pair', async () => {
    const { db, calls } = diffMock({
      players: [playerA, playerB],
      conversations: [convo],
      agents: [],
    });
    const newWorld: SerializedWorld = {
      nextId: 3,
      players: [playerA, playerB],
      conversations: [], // convo ended
      agents: [],
    };
    await saveGameDiff(db, 'w', emptyDiff(newWorld));

    const archive = calls.find(
      (c) => c.table === 'archived_conversations' && c.method === 'insert',
    )!;
    const archivedRows = archive.args[0] as Array<Record<string, unknown>>;
    expect(archivedRows).toHaveLength(1);
    expect(archivedRows[0].conversation_id).toBe('c:1');
    expect(archivedRows[0].participants).toEqual(['p:1', 'p:2']);

    const edges = calls.find(
      (c) => c.table === 'participated_together' && c.method === 'insert',
    )!;
    // 2 participants → 2 directed edges (i,j) and (j,i).
    const edgeRows = edges.args[0] as Array<{ player1: string; player2: string }>;
    expect(edgeRows).toHaveLength(2);
    expect(edgeRows.map((r) => `${r.player1}->${r.player2}`).sort()).toEqual([
      'p:1->p:2',
      'p:2->p:1',
    ]);
  });

  it('archives agents that disappeared from the world', async () => {
    const { db, calls } = diffMock({
      players: [],
      conversations: [],
      agents: [agentA],
    });
    await saveGameDiff(
      db,
      'w',
      emptyDiff({ nextId: 0, players: [], conversations: [], agents: [] }),
    );
    const archive = calls.find(
      (c) => c.table === 'archived_agents' && c.method === 'insert',
    );
    expect(archive).toBeDefined();
    expect((archive!.args[0] as Array<{ agent_id: string }>)[0].agent_id).toBe('a:1');
  });

  it('does NOT touch archive tables when nothing was removed', async () => {
    const { db, calls } = diffMock({ players: [playerA], conversations: [], agents: [] });
    await saveGameDiff(
      db,
      'w',
      emptyDiff({ nextId: 1, players: [playerA], conversations: [], agents: [] }),
    );
    expect(
      calls.some((c) =>
        ['archived_players', 'archived_conversations', 'archived_agents', 'participated_together']
          .includes(c.table),
      ),
    ).toBe(false);
  });

  it('upserts player and agent descriptions when included in the diff', async () => {
    const { db, calls } = diffMock({ players: [], conversations: [], agents: [] });
    const diff: GameStateDiff = {
      world: { nextId: 0, players: [], conversations: [], agents: [] },
      agentOperations: [],
      playerDescriptions: [
        { playerId: 'p:1', name: 'Alice', description: 'A curious tiger', character: 'f1' },
      ],
      agentDescriptions: [{ agentId: 'a:1', identity: 'I am Alice.', plan: 'Wander.' }],
    };
    await saveGameDiff(db, 'w', diff);

    const playerUpsert = calls.find(
      (c) => c.table === 'player_descriptions' && c.method === 'upsert',
    )!;
    expect(playerUpsert.args[1]).toEqual({ onConflict: 'world_id,player_id' });
    expect(playerUpsert.args[0]).toEqual([
      {
        world_id: 'w',
        player_id: 'p:1',
        name: 'Alice',
        description: 'A curious tiger',
        character: 'f1',
      },
    ]);

    const agentUpsert = calls.find(
      (c) => c.table === 'agent_descriptions' && c.method === 'upsert',
    )!;
    expect(agentUpsert.args[1]).toEqual({ onConflict: 'world_id,agent_id' });
  });

  it('throws when the initial worlds read returns an error', async () => {
    const failingDb = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          single() {
            return Promise.resolve({ data: null, error: new Error('no row') });
          },
        };
      },
    } as unknown as DB;
    await expect(
      saveGameDiff(failingDb, 'w', {
        world: { nextId: 0, players: [], conversations: [], agents: [] },
        agentOperations: [],
      }),
    ).rejects.toThrow('no row');
  });
});
