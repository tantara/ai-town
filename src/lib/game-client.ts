'use client';

// WebSocket client to the per-world Durable Object. Replaces Convex's reactive
// `useQuery(api.world.worldState, ...)` — instead the DO pushes the entire
// world snapshot on every tick and we expose a tiny subscriber registry.

import { WORKER_URL } from './supabase';

export type WorldSnapshot = {
  engine: {
    id: string;
    currentTime?: number;
    lastStepTs?: number;
    generationNumber: number;
    running: boolean;
    processedInputNumber?: number;
    // Re-mapped to legacy Convex shape (some UI code reads `_id`/`_creationTime`).
    _id: string;
    _creationTime: number;
  };
  world: any;
};

type Listener = (snapshot: WorldSnapshot) => void;
type InputResolver = { resolve: (v: any) => void; reject: (e: any) => void };

const clients = new Map<string, GameClient>();

export class GameClient {
  worldId: string;
  ws: WebSocket | null = null;
  listeners = new Set<Listener>();
  pending = new Map<string, InputResolver>();
  inputResultListeners = new Map<string, (r: any) => void>();
  lastSnapshot?: WorldSnapshot;
  reconnectTimer?: ReturnType<typeof setTimeout>;

  constructor(worldId: string) {
    this.worldId = worldId;
    this.connect();
  }

  private connect() {
    if (!WORKER_URL) {
      console.warn('NEXT_PUBLIC_WORKER_URL not set; live game stream disabled');
      return;
    }
    const url = WORKER_URL.replace(/^http/, 'ws') + `/world/${this.worldId}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'subscribe' })));
    ws.addEventListener('message', (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
      } catch {
        return;
      }
      if (msg.type === 'snapshot') {
        const snap: WorldSnapshot = {
          engine: {
            ...msg.engine,
            _id: msg.engine.id,
            _creationTime: msg.engine.currentTime ?? Date.now(),
          },
          world: msg.world,
        };
        this.lastSnapshot = snap;
        for (const l of this.listeners) l(snap);
      } else if (msg.type === 'inputAccepted') {
        const r = this.pending.get(msg.correlationId);
        if (r) {
          this.pending.delete(msg.correlationId);
          r.resolve(msg.inputId);
        }
      } else if (msg.type === 'inputResult') {
        const cb = this.inputResultListeners.get(msg.inputId);
        if (cb) {
          this.inputResultListeners.delete(msg.inputId);
          cb(msg.result);
        }
      }
    });
    ws.addEventListener('close', () => {
      this.ws = null;
      this.reconnectTimer = setTimeout(() => this.connect(), 1000);
    });
    ws.addEventListener('error', () => ws.close());
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (this.lastSnapshot) listener(this.lastSnapshot);
    return () => this.listeners.delete(listener);
  }

  /** Submit an input to the world's DO. Returns the inputId (Postgres UUID). */
  async sendInput(name: string, args: any): Promise<string> {
    // Always use HTTP for inputs — it's idempotent and survives reconnects.
    if (!WORKER_URL) throw new Error('NEXT_PUBLIC_WORKER_URL not set');
    const resp = await fetch(`${WORKER_URL}/world/${this.worldId}/inputs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, args }),
    });
    if (!resp.ok) throw new Error(`sendInput failed: ${resp.status}`);
    const { inputId } = await resp.json();
    return inputId;
  }

  /** Poll for input completion. Replacement for Convex's reactive watch. */
  async waitForInput(inputId: string, timeoutMs = 30_000): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const resp = await fetch(`${WORKER_URL}/world/${this.worldId}/inputs/${inputId}`);
      if (resp.ok) {
        const { result } = await resp.json();
        if (result) {
          if (result.kind === 'error') throw new Error(result.message);
          return result.value;
        }
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`Input ${inputId} timed out`);
  }
}

export function getGameClient(worldId: string): GameClient {
  let c = clients.get(worldId);
  if (!c) {
    c = new GameClient(worldId);
    clients.set(worldId, c);
  }
  return c;
}
