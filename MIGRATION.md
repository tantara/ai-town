# Convex → Supabase + Cloudflare Migration

This document describes the architecture that replaces Convex with Supabase
Postgres + Cloudflare Workers / Durable Objects, and how to run it locally.

The migration is now complete: there is no `convex/` directory and no `convex`
npm dependency. All shared TypeScript code lives under `shared/` and is
imported by both the Next.js frontend and the Cloudflare Worker.

## Architecture

```
┌──────────────────┐    WebSocket     ┌──────────────────────────┐
│  Next.js front   │ ◀──────────────▶ │  Cloudflare Worker       │
│  (src/)          │                  │   ├─ /world/:id/ws       │
│  - Supabase JS   │     HTTPS        │   ├─ /world/:id/inputs   │
│  - GameClient    │ ◀──────────────▶ │   ├─ /agentOperations    │
└──────────────────┘                  │   └─ Durable Object:     │
        │                             │       WorldDO            │
        │   Realtime + REST           │       (game loop, Alarm) │
        ▼                             └─────────┬────────────────┘
┌──────────────────┐                            │
│  Supabase        │ ◀──────────────────────────┘
│   - Postgres     │     Service-role admin client
│   - pgvector     │
│   - Realtime     │
│   - Storage      │
└──────────────────┘
```

### Why this shape

- **Convex's reactive query model** ≈ DO + WebSocket Hibernation. The DO holds
  the world state in memory, ticks via Alarms, and pushes snapshots to all
  connected clients on every step. No DB round-trip per tick.
- **Convex transactional mutations** ≈ Postgres + DO single-threaded actor.
  Inputs are appended to `public.inputs` (Postgres) and consumed by the DO's
  tick loop. The DO is the only writer for the world doc, so there's no
  contention on `worlds.state`.
- **Convex actions (LLM calls)** ≈ Worker routes. The DO emits agent operations
  during a tick; the Worker forwards each to `/agentOperations`, which calls
  the LLM, writes results to Supabase, and submits a follow-up input back to
  the DO.
- **Convex crons / scheduler** ≈ DO Alarms.
- **Vector search** ≈ pgvector + the `match_memories` SQL function.

## Layout

```
ai-world/
├── supabase/migrations/00000000000001_init.sql   # Postgres schema + RLS + RPC
├── shared/                                       # Shared TS used by both
│   ├── aiWorld/              ← Player/Conversation/World/Map/etc data classes
│   ├── engine/               ← AbstractGame, historicalObject
│   ├── db/                   ← Supabase repository + admin client
│   └── util/                 ← geometry, compression, types, llm client
├── workers/                                      # Cloudflare Worker + DO
│   ├── wrangler.toml
│   └── src/
│       ├── index.ts          ← HTTP routes (incl. /freeze, /resume)
│       ├── lifecycle.ts      ← freezeWorld / resumeWorld helpers
│       ├── do/world.ts       ← Durable Object (game loop)
│       ├── do/tick.ts        ← pure tick + WS fanout + message helpers
│       ├── agent/            ← LLM operations + memory + prompts
│       └── env.ts            ← Worker bindings
├── scripts/seed.ts           ← creates default world + queues agents
└── src/                      ← Next.js frontend (Supabase + WS)
    ├── lib/{supabase,game-client}.ts
    ├── app/api/music/upload/ ← server-side music upload (NextAuth-gated)
    └── hooks/                ← Convex hook replacements
```

The `shared/` directory holds every TypeScript module imported by both the
frontend (via `../../shared/...`) and the Worker (via `../../shared/...` from
`workers/src/agent` or `do`, and `../../../shared/...` from deeper paths).
These modules are pure TypeScript with no `convex/values` dependency — input
validation now happens at the system boundary (Worker HTTP routes) instead of
inside data classes.

## Running locally

### 1. Supabase

Requires the Supabase CLI.

```sh
supabase start
supabase db reset                  # applies supabase/migrations/00000000000001_init.sql
```

Note the `service_role` key and project URL printed by `supabase status`.

### 2. Install + secrets

The repo is a **pnpm workspace monorepo** — install everything from the root:

```sh
pnpm install
```

For local dev, `wrangler dev` reads worker secrets from `workers/.dev.vars`:

```sh
cat > workers/.dev.vars <<EOF
SUPABASE_URL=http://host.docker.internal:54321
SUPABASE_SERVICE_ROLE_KEY=ey...
OPERATIONS_URL=http://127.0.0.1:8787/agentOperations
OLLAMA_HOST=http://host.docker.internal:11434
EOF
```

For production, use `pnpm --filter ai-world-worker exec wrangler secret put …` instead.

### 3. Run the stack

```sh
cp .env.example .env.local      # NEXT_PUBLIC_SUPABASE_URL, anon key, NEXT_PUBLIC_WORKER_URL, …
pnpm dev                        # runs Next.js + wrangler concurrently
```

### 4. Seed the world

In a third terminal:

```sh
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… WORKER_URL=http://127.0.0.1:8787 pnpm seed
```

This creates the engine, world, world_status, map, and queues a `createAgent`
input for each entry in `data/characters.ts → Descriptions`. The DO picks them
up on the next tick.

## Frontend hook map (Convex → new)

| Old | New |
|---|---|
| `useQuery(api.world.defaultWorldStatus)` | `useDefaultWorldStatus()` |
| `useQuery(api.world.worldState, ...)` | `useWorldState(worldId)` (WebSocket) |
| `useQuery(api.world.gameDescriptions, ...)` | `useGameDescriptions(worldId)` |
| `useQuery(api.messages.listMessages, ...)` | `useMessages(worldId, conversationId)` |
| `useQuery(api.world.previousConversation, ...)` | `usePreviousConversation(...)` |
| `useQuery(api.music.getBackgroundMusic)` | `useBackgroundMusic()` (auto-refreshes on `ai-zoo:music-changed`) |
| Replicate webhook → `api.music.storeMusic` | `POST /api/music/upload` (multipart, NextAuth-gated; uploads to the `music` Supabase Storage bucket and inserts into `public.music`) |
| `useQuery(api.world.userStatus, ...)` | `useUserStatus(token)` |
| `useMutation(api.world.heartbeatWorld)` | `useWorldHeartbeat()` (auto) |
| `useMutation(api.messages.writeMessage)` | `useWriteMessage()` |
| `useSendInput(engineId, name)` | `useSendInput(worldId, name)` |
| `useMutation(api.world.joinWorld/leaveWorld)` | `getGameClient(worldId).sendInput('join'/'leave', ...)` |

## Concurrency / performance notes

- One DO instance per `worldId`. All ticks run single-threaded inside the DO,
  so there's no OCC contention like Convex sometimes hit.
- Per tick we do one read (when the DO cold-starts) and N writes (engine
  replace, archived rows for removed players/conversations, description
  upserts). On a warm DO every tick is just writes.
- LLM operations run in the Worker, not the DO, so a slow LLM call doesn't
  stall the simulation.
- pgvector with `ivfflat (lists=100)` — rebuild with more lists once you have
  more than ~10k embeddings.

## Tests

Unit tests live next to the code under test (`*.test.ts`). Run them with:

```sh
pnpm test
```

Coverage today:

- `shared/util/` — geometry, compression, asyncMap, minheap, types, object
- `shared/aiWorld/` — ids, location
- `shared/engine/` — historicalObject
- `shared/db/repository.test.ts` — engine inputs, world status, world
  heartbeat, message inserts, the four-query `loadGameState` aggregation, and
  `saveGameDiff` (world replace, removed-player/conversation/agent archival,
  participated-together edges, description upserts)
- `shared/util/llm.test.ts` — provider selection (OpenAI / OpenRouter /
  Together / custom / Ollama fallback) and the `LLM_PROVIDER` override
- `workers/src/lifecycle.test.ts` — `freezeWorld` / `resumeWorld` against a
  mocked DB and DO stub, including the "DB write fails → DO is not kicked"
  invariant
- `workers/src/do/tick.test.ts` — the DO tick loop and WebSocket fanout. The
  testable logic was extracted from `WorldDO` into `workers/src/do/tick.ts`
  (`runAlarmCycle`, `handleClientMessage`, `broadcastSnapshot`,
  `snapshotMessage`) so the alarm path, the subscribe / sendInput message
  handling, and the per-socket fanout can all be exercised with plain DB
  and socket mocks instead of standing up miniflare.
- `workers/src/agent/operations.test.ts` — registry shape

End-to-end Supabase/Postgres + DO behaviour (real WebSocket framing,
Hibernation, Postgres transactions) is still only exercised by running the
full stack locally — see [README → Commands to run / test / debug](./README.md#commands-to-run--test--debug).

## Known TODOs

- `useHistoricalValue` was not changed — it doesn't depend on Convex.
