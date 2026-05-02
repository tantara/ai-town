import { freezeWorld, resumeWorld } from './lifecycle';
import type { DB } from '../../shared/db/supabase';

type Call = { method: string; args: unknown[] };

function mockDb() {
  const calls: Call[] = [];
  let lastTable = '';
  const chain = {
    update(values: unknown) {
      calls.push({ method: 'update', args: [lastTable, values] });
      return chain;
    },
    eq(col: string, val: unknown) {
      calls.push({ method: 'eq', args: [col, val] });
      return Promise.resolve({ error: null });
    },
  };
  const db = {
    from(table: string) {
      lastTable = table;
      return chain;
    },
  };
  return { db: db as unknown as DB, calls };
}

describe('freezeWorld', () => {
  it("sets world_status to 'stoppedByDeveloper'", async () => {
    const { db, calls } = mockDb();
    const result = await freezeWorld(db, 'world-1');
    expect(result).toEqual({ status: 'stoppedByDeveloper' });
    expect(calls).toEqual([
      { method: 'update', args: ['world_status', { status: 'stoppedByDeveloper' }] },
      { method: 'eq', args: ['world_id', 'world-1'] },
    ]);
  });
});

describe('resumeWorld', () => {
  it("sets status to 'running' and kicks the DO via /start", async () => {
    const { db, calls } = mockDb();
    const stubCalls: { url: string; init: RequestInit | undefined }[] = [];
    const stub = {
      async fetch(url: string, init?: RequestInit) {
        stubCalls.push({ url, init });
        return new Response('{"ok":true}', { status: 200 });
      },
    };

    const result = await resumeWorld(db, stub, 'world-1');

    expect(result).toEqual({ status: 'running' });
    expect(calls).toEqual([
      { method: 'update', args: ['world_status', { status: 'running' }] },
      { method: 'eq', args: ['world_id', 'world-1'] },
    ]);
    expect(stubCalls).toHaveLength(1);
    expect(stubCalls[0].url).toBe('https://world/start?worldId=world-1');
    expect(stubCalls[0].init?.method).toBe('POST');
  });

  it("only kicks the DO after the status update succeeds", async () => {
    // If setWorldStatus throws, the DO must not be poked — otherwise we'd
    // restart a world the DB still considers frozen.
    let stubCalled = false;
    const failingDb = {
      from() {
        return {
          update() {
            return this;
          },
          eq() {
            return Promise.resolve({ error: new Error('rls denied') });
          },
        };
      },
    } as unknown as DB;
    const stub = {
      async fetch() {
        stubCalled = true;
        return new Response('{}');
      },
    };

    await expect(resumeWorld(failingDb, stub, 'w')).rejects.toThrow('rls denied');
    expect(stubCalled).toBe(false);
  });
});
