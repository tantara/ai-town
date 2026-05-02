// Worker entrypoint. Routes:
//
//   GET  /health
//   GET  /world/:worldId/ws            -> upgrades to a WebSocket against the DO
//   POST /world/:worldId/inputs        -> { name, args } -> { inputId }
//   GET  /world/:worldId/inputs/:id    -> input result (poll fallback for non-WS)
//   POST /world/:worldId/heartbeat
//   POST /world/:worldId/start
//   POST /agentOperations              -> internal callback used by the DO
//
// All durable game state lives in the per-world Durable Object; persistent
// data lives in Supabase Postgres.

import type { Env } from './env';
import { WorldDO } from './do/world';
import { adminDb } from './db/supabase';
import * as repo from './db/repository';
import { operations } from './agent/operations';

export { WorldDO };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === '/health') return json({ ok: true });

      if (path === '/agentOperations' && request.method === 'POST') {
        const body = (await request.json()) as { worldId: string; name: string; args: any };
        const op = operations[body.name];
        if (!op) return json({ error: `Unknown operation ${body.name}` }, 400);
        const db = adminDb(env);
        op(env, db, body.args).catch((e) => console.error(`Op ${body.name} failed:`, e));
        return json({ ok: true });
      }

      const m = path.match(/^\/world\/([^/]+)\/(.+)$/);
      if (m) {
        const [, worldId, rest] = m;
        const stub = env.WORLD.get(env.WORLD.idFromName(worldId));

        if (rest === 'ws') {
          // Forward the upgrade. The DO accepts the WS via Hibernation API.
          return stub.fetch(`https://world/ws?worldId=${worldId}`, request);
        }
        if (rest === 'inputs' && request.method === 'POST') {
          const body = await request.json();
          return forward(stub, `https://world/sendInput?worldId=${worldId}`, body);
        }
        const inputResult = rest.match(/^inputs\/([^/]+)$/);
        if (inputResult) {
          const result = await repo.getInputResult(adminDb(env), inputResult[1]);
          return json({ result });
        }
        if (rest === 'heartbeat' && request.method === 'POST') {
          await repo.heartbeatWorld(adminDb(env), worldId);
          return json({ ok: true });
        }
        if (rest === 'start' && request.method === 'POST') {
          return forward(stub, `https://world/start?worldId=${worldId}`, {});
        }
        if (rest === 'snapshot') {
          return stub.fetch(`https://world/snapshot?worldId=${worldId}`, request);
        }
      }

      return json({ error: 'Not found' }, 404);
    } catch (e: any) {
      console.error(e);
      return json({ error: e.message ?? String(e) }, 500);
    }
  },
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

async function forward(stub: DurableObjectStub, url: string, body: unknown) {
  const resp = await stub.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  return new Response(text, {
    status: resp.status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}
