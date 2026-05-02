import {
  setWorldStatus,
  heartbeatWorld,
  insertInput,
  completeInput,
  getInputResult,
  getDefaultWorldStatus,
} from './repository';
import type { DB } from './supabase';

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
