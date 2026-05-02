# Convex → Supabase + Cloudflare Hybrid Migration

This document describes the architecture introduced on the
`claude/replace-convex-supabase-uaYU5` branch and how to run it.

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
ai-town/
├── supabase/migrations/00000000000001_init.sql   # Postgres schema + RLS + RPC
├── workers/                                      # Cloudflare Worker + DO
│   ├── wrangler.toml
│   └── src/
│       ├── index.ts          ← HTTP routes
│       ├── do/world.ts       ← Durable Object (game loop)
│       ├── engine/           ← ported convex/engine
│       ├── aiTown/           ← ported convex/aiTown game classes
│       ├── agent/            ← LLM operations + memory + prompts
│       ├── db/               ← Supabase repository
│       └── util/             ← geometry, compression, llm client
├── scripts/seed.ts           ← creates default world + queues agents
├── src/                      ← Next.js frontend (now uses Supabase + WS)
│   ├── lib/{supabase,game-client}.ts
│   └── hooks/                ← drop-in replacements for useQuery/useMutation
└── convex/                   ← KEPT during transition (typed models still imported)
```

The `convex/` folder is intentionally kept. Most of its files are pure TS data
classes (`Player`, `Conversation`, `World`, `WorldMap`, …) that the frontend
still imports for type information. They no longer run on Convex — the same
classes are duplicated under `workers/src/aiTown/` for runtime use inside the
DO. Once you remove every `convex/values` import you can delete the directory
and drop the `convex` npm dep.

## Running locally

### 1. Supabase

Requires the Supabase CLI.

```sh
supabase start
supabase db reset                  # applies supabase/migrations/00000000000001_init.sql
```

Note the `service_role` key and project URL printed by `supabase status`.

### 2. Cloudflare Worker

```sh
cd workers
npm install
npx wrangler secret put SUPABASE_URL              # paste from `supabase status`
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY # paste from `supabase status`
# Pick an LLM provider:
npx wrangler secret put OLLAMA_HOST               # http://host.docker.internal:11434
# or:
npx wrangler secret put OPENAI_API_KEY            # sk-…
# Required so the DO can call back into the Worker for LLM ops:
echo 'OPERATIONS_URL = "http://127.0.0.1:8787/agentOperations"' >> wrangler.toml
npm run dev                                       # http://127.0.0.1:8787
```

### 3. Seed the world

In a third terminal:

```sh
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… WORKER_URL=http://127.0.0.1:8787 npm run seed
```

This creates the engine, world, world_status, map, and queues a `createAgent`
input for each entry in `data/characters.ts → Descriptions`. The DO picks them
up on the next tick.

### 4. Frontend

```sh
cp .env.example .env.local
npm install
npm run dev
```

Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
`NEXT_PUBLIC_WORKER_URL` in `.env.local`.

## Frontend hook map (Convex → new)

| Old | New |
|---|---|
| `useQuery(api.world.defaultWorldStatus)` | `useDefaultWorldStatus()` |
| `useQuery(api.world.worldState, ...)` | `useWorldState(worldId)` (WebSocket) |
| `useQuery(api.world.gameDescriptions, ...)` | `useGameDescriptions(worldId)` |
| `useQuery(api.messages.listMessages, ...)` | `useMessages(worldId, conversationId)` |
| `useQuery(api.world.previousConversation, ...)` | `usePreviousConversation(...)` |
| `useQuery(api.music.getBackgroundMusic)` | `useBackgroundMusic()` |
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

## Known TODOs

- `/freeze` and `/resume` Worker routes (used by `<FreezeButton>`) are not
  implemented yet; the SQL + DO already support pausing via
  `world_status.status = 'stoppedByDeveloper'`.
- `convex/` directory is still present for shared TS types. Removing it
  requires migrating each `convex/values`-backed type to the equivalents in
  `workers/src/aiTown/types.ts`.
- `useHistoricalValue` was not changed — it doesn't depend on Convex.
- Music storage was kept as a Supabase Storage URL column; no upload UI yet.
