// Per-world Durable Object. Replaces Convex's "engine action" loop:
//   - Holds the Game in memory between ticks (no DB roundtrip per tick).
//   - DO Alarm = tick scheduler (replacement for ctx.scheduler.runAfter).
//   - WebSocket Hibernation = reactive client state stream.
//   - Postgres (via Repository) is the durable store of record.
//
// Each world is addressed by a DO id derived from `worldId` (UUID), so all
// requests for the same world land on the same single-threaded actor.
//
// The non-trivial logic (one alarm cycle, one client message, snapshot
// fanout) lives in `./tick.ts` so it can be unit-tested without standing up
// a real DurableObjectState.

import type { Env } from '../env';
import { adminDb, DB } from '../../../shared/db/supabase';
import * as repo from '../../../shared/db/repository';
import { Game } from '../../../shared/aiZoo/game';
import { ClientMessage, handleClientMessage, runAlarmCycle } from './tick';

export class WorldDO implements DurableObject {
  private worldId: string | null = null;
  private game: Game | null = null;
  private db: DB;
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.db = adminDb(env);
  }

  // ------------------------------------------------------------------ HTTP --
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // First request after wake binds this DO to a worldId. We pass it via
    // `?worldId=...` from the Worker entrypoint.
    const worldId = url.searchParams.get('worldId');
    if (worldId) this.worldId = worldId;
    if (!this.worldId) return new Response('worldId required', { status: 400 });

    // WebSocket upgrade — used by the browser for live game-state streaming.
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      this.state.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname.endsWith('/sendInput') && request.method === 'POST') {
      const body = (await request.json()) as { name: string; args: any };
      await this.ensureGame();
      const inputId = await repo.insertInput(this.db, this.game!.engine.id, body.name, body.args);
      // Schedule a tick soon if one isn't already pending.
      await this.ensureAlarm();
      return Response.json({ inputId });
    }

    if (url.pathname.endsWith('/start') && request.method === 'POST') {
      await this.ensureGame();
      await this.ensureAlarm();
      return Response.json({ ok: true });
    }

    if (url.pathname.endsWith('/snapshot') && request.method === 'GET') {
      await this.ensureGame();
      return Response.json({
        engine: this.game!.engine,
        world: this.game!.world.serialize(),
      });
    }

    return new Response('Not found', { status: 404 });
  }

  // -------------------------------------------------------- WebSocket events
  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    let parsed: ClientMessage;
    try {
      parsed = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
    } catch {
      return;
    }
    try {
      await this.ensureGame();
      await handleClientMessage(
        {
          db: this.db,
          game: this.game!,
          socket: ws,
          ensureAlarm: () => this.ensureAlarm(),
        },
        parsed,
      );
    } catch (e: any) {
      ws.send(JSON.stringify({ type: 'error', message: e.message }));
    }
  }

  webSocketClose(_ws: WebSocket, _code: number, _reason: string, _wasClean: boolean) {
    // Hibernation API tracks sockets for us.
  }

  // --------------------------------------------------------------- Alarm ----
  // The DO Alarm fires our tick loop. Each fire runs one engine step and
  // schedules the next alarm at `now + STEP_INTERVAL`. The Game's in-memory
  // state survives between alarms because the DO instance stays alive.
  async alarm() {
    try {
      await this.ensureGame();
      await runAlarmCycle({
        db: this.db,
        game: this.game!,
        worldId: this.worldId!,
        now: Date.now(),
        sockets: this.state.getWebSockets(),
        setAlarm: (when) => this.state.storage.setAlarm(when),
        dispatchOperation: (name, args) => this.dispatchAgentOperation(name, args),
      });
    } catch (e) {
      console.error('Alarm failed:', e);
      // Retry shortly so a transient error doesn't stall the world.
      await this.state.storage.setAlarm(Date.now() + 5_000);
    }
  }

  // ---------------------------------------------------------------- helpers
  private async ensureGame() {
    if (!this.worldId) throw new Error('DO bound without worldId');
    if (!this.game) this.game = await Game.load(this.db, this.worldId);
  }

  private async ensureAlarm() {
    const existing = await this.state.storage.getAlarm();
    if (!existing) await this.state.storage.setAlarm(Date.now() + 50);
  }

  // Dispatches an agent operation by calling the Worker's internal operation
  // endpoint. The Worker has more time/CPU than a single Alarm tick and can
  // safely talk to slow LLMs.
  private async dispatchAgentOperation(name: string, args: unknown) {
    if (!this.env.OPERATIONS_URL) {
      throw new Error(
        'OPERATIONS_URL is not set. Configure it via wrangler secret/vars so the DO can call back into the Worker.',
      );
    }
    await fetch(this.env.OPERATIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worldId: this.worldId, name, args }),
    });
  }

}
