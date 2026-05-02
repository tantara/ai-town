// Pure helpers extracted from WorldDO so the tick loop and WebSocket fanout
// can be unit-tested without spinning up a Cloudflare Worker / DurableObject.
//
// The DO itself is mostly glue: it owns the in-memory `Game`, the bound
// `DurableObjectState`, and the websocket list. Everything else — running a
// step, persisting it, broadcasting, dispatching agent ops, and handling a
// client message — is plain TypeScript and lives here.

import type { DB } from '../../../shared/db/supabase';
import {
  applyEngineUpdate,
} from '../../../shared/engine/abstractGame';
import * as repo from '../../../shared/db/repository';
import { STEP_INTERVAL } from '../../../shared/aiWorld/constants';
import type {
  EngineUpdate,
  GameStateDiff,
  SerializedWorld,
} from '../../../shared/aiWorld/types';

export interface TickGame {
  engine: { id: string };
  world: { serialize(): SerializedWorld };
  runStep(db: DB, now: number): Promise<{ update: EngineUpdate; diff: GameStateDiff }>;
}

export interface SocketLike {
  send(msg: string): void;
}

export type ServerMessage =
  | { type: 'snapshot'; engine: unknown; world: SerializedWorld }
  | { type: 'inputAccepted'; correlationId: string; inputId: string }
  | { type: 'inputResult'; inputId: string; result: unknown }
  | { type: 'error'; message: string };

export type ClientMessage =
  | { type: 'subscribe' }
  | { type: 'sendInput'; name: string; args: unknown; correlationId?: string };

export function snapshotMessage(game: TickGame): ServerMessage {
  return { type: 'snapshot', engine: game.engine, world: game.world.serialize() };
}

// Fanout to every connected socket. Throws are swallowed per-socket so a single
// dead socket can't break the broadcast for everyone else.
export function broadcastSnapshot(sockets: Iterable<SocketLike>, game: TickGame): void {
  const msg = JSON.stringify(snapshotMessage(game));
  for (const ws of sockets) {
    try {
      ws.send(msg);
    } catch {
      // Errored sockets get cleaned up by the runtime's hibernation API.
    }
  }
}

export interface AlarmDeps {
  db: DB;
  game: TickGame;
  worldId: string;
  now: number;
  sockets: Iterable<SocketLike>;
  setAlarm: (when: number) => Promise<void>;
  dispatchOperation: (name: string, args: unknown) => Promise<void>;
}

// Runs one DO Alarm cycle:
//   1. step the game forward to `now`
//   2. persist engine update + diff
//   3. broadcast the new snapshot to every connected client
//   4. fire-and-forget any agent operations the tick produced
//   5. reschedule the next alarm iff the world is still running
export async function runAlarmCycle(deps: AlarmDeps): Promise<void> {
  const { update, diff } = await deps.game.runStep(deps.db, deps.now);
  await applyEngineUpdate(deps.db, deps.game.engine.id, update);
  await repo.saveGameDiff(deps.db, deps.worldId, diff);
  broadcastSnapshot(deps.sockets, deps.game);
  for (const op of diff.agentOperations) {
    deps.dispatchOperation(op.name, op.args).catch((e) =>
      console.error(`Agent operation ${op.name} failed:`, e),
    );
  }
  const status = await repo.getWorldStatus(deps.db, deps.worldId);
  if (status?.status === 'running') {
    await deps.setAlarm(Date.now() + STEP_INTERVAL);
  }
}

export interface ClientMessageDeps {
  db: DB;
  game: TickGame;
  socket: SocketLike;
  ensureAlarm: () => Promise<void>;
}

// Handles one incoming WebSocket message. Returns nothing — replies are pushed
// via `socket.send` so the caller doesn't need to wire up a response type.
export async function handleClientMessage(
  deps: ClientMessageDeps,
  parsed: ClientMessage,
): Promise<void> {
  if (parsed.type === 'subscribe') {
    deps.socket.send(JSON.stringify(snapshotMessage(deps.game)));
    await deps.ensureAlarm();
    return;
  }
  if (parsed.type === 'sendInput') {
    const inputId = await repo.insertInput(deps.db, deps.game.engine.id, parsed.name, parsed.args);
    if (parsed.correlationId) {
      deps.socket.send(
        JSON.stringify({
          type: 'inputAccepted',
          correlationId: parsed.correlationId,
          inputId,
        } satisfies ServerMessage),
      );
    }
    await deps.ensureAlarm();
  }
}
