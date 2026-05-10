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
ai-zoo/
├── supabase/migrations/00000000000001_init.sql   # Postgres schema + RLS + RPC
├── shared/                                       # Shared TS used by both
│   ├── aiZoo/              ← Player/Conversation/World/Map/etc data classes
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

For production, use `pnpm --filter ai-zoo-worker exec wrangler secret put …` instead.

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
- `shared/aiZoo/` — ids, location
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

## Deploy to production

Targets: **hosted Supabase** (Postgres + Storage) + **Cloudflare Workers** + **Vercel** (Next.js).

### 1. Supabase

1. Create a new project at [supabase.com](https://supabase.com).
2. Apply the schema. Either paste
   `supabase/migrations/00000000000001_init.sql` into the SQL editor, or use the CLI:
   ```sh
   supabase db push --db-url "postgres://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
   ```
3. From **Project Settings → API** copy:
   - `Project URL` → note as `SUPABASE_URL`
   - `anon public` key → note as `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → note as `SUPABASE_SERVICE_ROLE_KEY`

> **Embedding dimension**: the schema declares `vector(1024)`, tuned for Ollama
> `mxbai-embed-large`.  If you switch to OpenAI `text-embedding-ada-002` (1536-d)
> or Together `m2-bert-80M-8k-retrieval` (768-d) you must update every
> `vector(1024)` occurrence in the migration SQL **before** applying it, and
> set `EMBEDDING_DIMENSION` in `shared/util/llm.ts` to match, then redeploy
> the worker.

### 2. Cloudflare Worker

Deploy the worker first so you have its public hostname for `OPERATIONS_URL`:

```sh
pnpm --filter ai-zoo-worker exec wrangler deploy
# → Deployed to https://ai-zoo.<your-account>.workers.dev
```

Then set secrets (one `wrangler secret put` per line):

| Secret | Value |
|---|---|
| `SUPABASE_URL` | Project URL from step 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key from step 1 |
| `OPERATIONS_URL` | `https://<worker-hostname>/agentOperations` |
| `LLM_PROVIDER` | `openai` \| `openrouter` \| `together` \| `custom` |
| `OPENAI_API_KEY` | If `LLM_PROVIDER=openai` |
| `OPENROUTER_API_KEY` | If `LLM_PROVIDER=openrouter` |
| `TOGETHER_API_KEY` | If `LLM_PROVIDER=together` |
| `LLM_API_URL` + `LLM_API_KEY` + `LLM_MODEL` + `LLM_EMBEDDING_MODEL` | If `LLM_PROVIDER=custom` |

Optional model overrides: `OPENAI_CHAT_MODEL`, `OPENAI_EMBEDDING_MODEL`,
`OPENROUTER_CHAT_MODEL`, `OPENROUTER_EMBEDDING_MODEL`, `TOGETHER_CHAT_MODEL`,
`TOGETHER_EMBEDDING_MODEL`.

```sh
# Example — OpenAI
pnpm --filter ai-zoo-worker exec wrangler secret put SUPABASE_URL
pnpm --filter ai-zoo-worker exec wrangler secret put SUPABASE_SERVICE_ROLE_KEY
pnpm --filter ai-zoo-worker exec wrangler secret put OPERATIONS_URL
pnpm --filter ai-zoo-worker exec wrangler secret put LLM_PROVIDER   # type: openai
pnpm --filter ai-zoo-worker exec wrangler secret put OPENAI_API_KEY
```

Redeploy after setting secrets so the next warm-up picks them up:

```sh
pnpm --filter ai-zoo-worker exec wrangler deploy
```

### 3. Vercel (Next.js)

In **Project Settings → Environment Variables** (all environments, or Production only):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `NEXT_PUBLIC_WORKER_URL` | Worker URL from step 2 (no trailing slash) |
| `SUPABASE_URL` | Supabase project URL (server-side music upload) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server-side music upload) |
| `AUTH_SECRET` | Random 32-byte string — `openssl rand -hex 32` |
| `GITHUB_ID` | GitHub OAuth App client ID |
| `GITHUB_SECRET` | GitHub OAuth App client secret |

Then trigger a production deploy (or push to main if Vercel is connected to the repo).

### 4. Seed the world

Run once after the schema and worker are live:

```sh
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
WORKER_URL=https://<worker-hostname> \
pnpm seed
```

This creates the default engine, world, map, and queues a `createAgent` input
for each character in `data/characters.ts`.  The DO picks them up on the next tick.

### 5. Smoke test

1. `POST https://<worker-hostname>/world/<worldId>/start` — returns `{"ok":true}`.
2. Open the Vercel URL — the canvas renders and agents start moving.
3. `POST .../world/<worldId>/freeze` — frontend shows world paused.
4. `POST .../world/<worldId>/resume` — agents resume.
5. In browser DevTools → Network → WS, confirm `worldStatus` and `snapshot` frames arrive on the `/world/<worldId>/ws` connection.

## Known TODOs

- `useHistoricalValue` was not changed — it doesn't depend on Convex.
