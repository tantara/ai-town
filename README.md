# AI World 🏠💻💌

> **AI World** is a fork of [a16z's AI Town](https://github.com/a16z-infra/ai-town).
> The original was built on Convex; this fork is rebuilt as a **pnpm monorepo** on
> **Next.js 16 + Supabase Postgres + Cloudflare Workers / Durable Objects**, with
> NextAuth for sign-in and a 12-zodiac-animal cast of agents. See
> [`MIGRATION.md`](./MIGRATION.md) and [`ARCHITECTURE.md`](./ARCHITECTURE.md) for
> the full architectural map of what changed.

[Join the original community Discord: AI Stack Devs](https://discord.gg/PQUmTBTGmT)

<img width="1454" alt="AI World screenshot" src="https://github.com/a16z-infra/ai-town/assets/3489963/a4c91f17-23ed-47ec-8c4e-9f9a8505057d">

AI World is a virtual world where AI characters live, chat, and socialize.

This project is a deployable starter kit for easily building and customizing your own version of AI
Town. Inspired by the research paper
[_Generative Agents: Interactive Simulacra of Human Behavior_](https://arxiv.org/pdf/2304.03442.pdf).

The primary goal of this project, beyond just being a lot of fun to work on, is to provide a
platform with a strong foundation that is meant to be extended. The back-end natively supports
shared global state, transactions, and a simulation engine and should be suitable from everything
from a simple project to play around with to a scalable, multi-player game.

## Overview

- 🆚 [AI Town vs AI World](#ai-town-vs-ai-world)
- 💻 [Stack](#stack)
- 🧠 [Installation](#installation)
- ▶️ [Run the stack](#run-the-stack)
- 💻️ [Windows pre-requisites](#windows-installation)
- 🤖 [Configure your LLM of choice](#connect-an-llm)
- 👤 [Customize - YOUR OWN simulated world](#customize-your-own-simulation)
- 👩‍💻 [Deploying to production](#deploy-the-app-to-production)
- 🐛 [Troubleshooting](#troubleshooting)

## AI Town vs AI World

AI World is the same simulation idea as the upstream AI Town, but every infrastructure
decision and the cast of characters has been swapped out. The table below summarises what
changed.

| Layer                     | Original **AI Town**                                  | **AI World** (this fork)                                                                              |
| ------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Frontend framework        | Vite + React 18                                       | **Next.js 16 (App Router) + React 19**                                                                |
| UI components             | Hand-rolled CSS, no design system                     | **shadcn/ui + Radix + Tailwind CSS**                                                                  |
| Auth                      | Clerk                                                 | **NextAuth v5** (GitHub provider + guest credential)                                                  |
| Backend platform          | Convex (functions + scheduler + reactive queries)     | **Supabase (Postgres + Realtime + Storage) + Cloudflare Workers + Durable Objects**                   |
| Game-loop runtime         | Convex action scheduled on a cron                     | **Per-world Durable Object** (`WorldDO`), tick driven by **DO Alarms**                                |
| Reactive client cache     | `useQuery` over Convex websocket                      | **DO WebSocket** for the world doc + **Supabase Realtime** for messages/status                        |
| Vector search             | Convex's vector index                                 | **pgvector** + a `match_memories` SQL RPC                                                             |
| File storage              | Convex Storage                                        | **Supabase Storage** (`music` bucket) + a NextAuth-gated `POST /api/music/upload` route               |
| LLM providers             | OpenAI / Together / Ollama                            | **OpenAI / OpenRouter / Together / Ollama / any OpenAI-compatible** (provider auto-selected)         |
| Default character cast    | 7 generic NPCs                                        | **12 zodiac animals** (`data/characters.ts`)                                                          |
| Package manager           | npm                                                   | **pnpm workspace monorepo** (root = Next.js app, `workers/` = Worker package)                         |
| Local "all-in-one" dev    | `npm run dev` started the Convex dev server + frontend | **`pnpm dev`** runs Next.js and `wrangler dev` concurrently                                           |
| Hosted deploy targets     | Convex cloud + Vercel                                 | **Supabase + Cloudflare + Vercel** (or any Next.js host)                                              |
| Test harness              | Limited                                               | **Jest** suite (143 tests) covering engine, repository, LLM client, DO tick loop, lifecycle, agents   |

## Stack

- Frontend: [Next.js 16](https://nextjs.org/) + [shadcn/ui](https://ui.shadcn.com/) +
  [PixiJS](https://pixijs.com/) for the rendered map.
- Auth: [NextAuth v5](https://authjs.dev/) (GitHub provider + a guest credential).
- Database, vector search, file storage, realtime: [Supabase](https://supabase.com/)
  (Postgres + pgvector + Storage + Realtime).
- Game engine + WebSocket fanout: [Cloudflare Workers](https://workers.cloudflare.com/) +
  [Durable Objects](https://developers.cloudflare.com/durable-objects/) — one DO per world; a
  DO Alarm drives the tick loop.
- LLM clients: [OpenAI](https://platform.openai.com/), [OpenRouter](https://openrouter.ai/),
  [Together.ai](https://www.together.ai/), [Ollama](https://ollama.com/), or any
  OpenAI-compatible endpoint.
- Background music (optional): [Replicate](https://replicate.com/)
  [MusicGen](https://huggingface.co/spaces/facebook/MusicGen). Tracks are uploaded into the
  `music` Supabase Storage bucket and surfaced through the in-game upload UI.

Other credits:

- Pixel Art Generation: [Replicate](https://replicate.com/),
  [Fal.ai](https://serverless.fal.ai/lora)
- All interactions, background music and rendering on the `<Game/>` component in the project are
  powered by [PixiJS](https://pixijs.com/).
- Tilesheet:
  - https://opengameart.org/content/16x16-game-assets by George Bailey
  - https://opengameart.org/content/16x16-rpg-tileset by hilau
- We used https://github.com/pierpo/phaser3-simple-rpg for the original POC of this project.
- Original assets by [ansimuz](https://opengameart.org/content/tiny-rpg-forest)
- The UI is based on original assets by
  [Mounir Tohami](https://mounirtohami.itch.io/pixel-art-gui-elements)

## Repository layout

```
ai-world/
├── package.json                 ← root: Next.js app + workspace scripts
├── pnpm-workspace.yaml          ← lists `workers/` as a workspace package
├── workers/                     ← Cloudflare Worker + Durable Object package
│   ├── package.json             ← name: ai-world-worker
│   ├── wrangler.toml
│   └── src/
│       ├── index.ts             ← HTTP routes (incl. /freeze, /resume, /agentOperations)
│       ├── do/world.ts          ← Durable Object (game loop)
│       ├── do/tick.ts           ← pure tick + WebSocket fanout
│       ├── lifecycle.ts         ← freezeWorld / resumeWorld helpers
│       └── agent/               ← LLM operations + memory + prompts
├── shared/                      ← TypeScript shared between web and worker
│   ├── aiWorld/                 ← Player/Conversation/World/Map/etc.
│   ├── engine/                  ← AbstractGame, historicalObject
│   ├── db/                      ← Supabase repository + admin client
│   └── util/                    ← geometry, compression, types, llm client
├── src/                         ← Next.js frontend
│   ├── app/api/auth/            ← NextAuth route
│   ├── app/api/music/upload/    ← server-side music upload (NextAuth-gated)
│   ├── lib/{supabase,game-client}.ts
│   └── components/, hooks/, …
├── supabase/migrations/         ← Postgres schema + RLS + RPCs
└── scripts/seed.ts              ← creates default world + queues agents
```

## Installation

### Pre-requisites

| Tool                           | Version       | Notes                                                  |
| ------------------------------ | ------------- | ------------------------------------------------------ |
| **Node**                       | ≥ 20          | wrangler + Next 16 are tested against 20+              |
| **pnpm**                       | ≥ 10          | run `corepack enable && corepack prepare pnpm@10 --activate` |
| **Supabase CLI**               | latest        | `brew install supabase/tap/supabase`                   |
| **Cloudflare Wrangler**        | bundled       | installed by `pnpm install` as a worker dep            |
| (optional) Ollama / OpenAI key | —             | needed only when you want agents to actually talk      |

If you're on Windows, jump to [Windows installation](#windows-installation) first.

### 1. Clone + install

```sh
git clone https://github.com/tantara/ai-town
cd ai-town
pnpm install
```

This installs the root Next.js dependencies **and** the worker dependencies (it's a pnpm
workspace — see `pnpm-workspace.yaml`).

### 2. Supabase

```sh
supabase start
supabase db reset    # applies supabase/migrations/00000000000001_init.sql
```

`supabase status` prints the local API URL, the **anon key** (public, browser-safe), and the
**service_role key** (server-only — never ship to the browser). Note all three.

For the music upload UI to work, create a public Storage bucket called `music`:

```sh
supabase storage create music --public
```

(Or do it from the Studio UI at http://127.0.0.1:54323 → Storage → New bucket.)

To deploy against a hosted Supabase project instead, run `supabase link --project-ref <ref>`
and then `supabase db push`.

### 3. Cloudflare Worker secrets (local)

In dev, `wrangler dev` reads secrets from `workers/.dev.vars` (same KEY=value format as
`.env`). Create it:

```sh
cat > workers/.dev.vars <<EOF
SUPABASE_URL=http://host.docker.internal:54321        # or your hosted URL
SUPABASE_SERVICE_ROLE_KEY=ey...                       # paste from supabase status
OPERATIONS_URL=http://127.0.0.1:8787/agentOperations  # so the DO can call back into the Worker
# Pick exactly one LLM provider:
OLLAMA_HOST=http://host.docker.internal:11434
# or:
# OPENAI_API_KEY=sk-...
# or OPENROUTER_API_KEY=sk-or-...
# or TOGETHER_API_KEY=...
# or LLM_API_URL=https://api.groq.com/openai (+ LLM_API_KEY, LLM_MODEL, LLM_EMBEDDING_MODEL)
EOF
```

For **production** secrets, use `pnpm --filter ai-world-worker exec wrangler secret put …`.

### 4. Frontend env

```sh
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# NEXT_PUBLIC_WORKER_URL, AUTH_SECRET, and (optional) GitHub OAuth credentials.
# Also set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY here so the music upload
# route and `pnpm seed` can reach Supabase.
```

## Run the stack

The root `pnpm dev` script starts **Next.js _and_ the Worker** concurrently:

```sh
pnpm dev
# [web]    ▲ Next.js 16 listening on http://localhost:3000
# [worker] ⛅️ wrangler dev http://127.0.0.1:8787
```

(They run via `concurrently`; each line is prefixed with `[web]` or `[worker]`.)

If you want to start them separately:

```sh
pnpm dev:web        # next dev only
pnpm dev:worker     # wrangler dev only (alias for `pnpm --filter ai-world-worker dev`)
```

### Seed the world

In a third terminal, with Supabase + the Worker still running:

```sh
SUPABASE_URL=…  SUPABASE_SERVICE_ROLE_KEY=…  WORKER_URL=http://127.0.0.1:8787  pnpm seed
```

This creates the engine row, the world row, the `world_status` row, the map, and queues a
`createAgent` input for every entry in `data/characters.ts → Descriptions`. The DO picks the
inputs up on its next tick and creates the agents.

Open http://localhost:3000. You should see the map, the agents wandering after a few ticks,
and chat history when you click on any animal.

## Connect an LLM

The Worker reads the LLM provider from its bound env vars. You can force a specific provider
with `LLM_PROVIDER`; otherwise the first provider whose API key is set wins. See
`shared/util/llm.ts` for the resolution order.

### Ollama (default for local dev)

By default the Worker tries Ollama at `http://127.0.0.1:11434`.

1. Download and install [Ollama](https://ollama.com/).
2. Open the app, or run `ollama serve` in a terminal.
3. `ollama pull llama3` (chat) and `ollama pull mxbai-embed-large` (embeddings — 1024-dim).
4. Test it: `ollama run llama3`.

If you change the embedding model, update `EMBEDDING_DIMENSION` in `shared/util/llm.ts` **and**
the `vector(1024)` columns in `supabase/migrations/00000000000001_init.sql`. Then re-run
`supabase db reset` to drop the old embeddings table.

### OpenAI

```sh
# Local dev (workers/.dev.vars):
OPENAI_API_KEY=sk-...
OPENAI_CHAT_MODEL=gpt-4o-mini              # optional
OPENAI_EMBEDDING_MODEL=text-embedding-ada-002  # optional

# Production:
pnpm --filter ai-world-worker exec wrangler secret put OPENAI_API_KEY
```

OpenAI's default embedding is 1536-dim. Edit `EMBEDDING_DIMENSION` in `shared/util/llm.ts` to
match, and update the `vector(...)` columns in the migration accordingly.

### OpenRouter

```sh
# Local dev:
OPENROUTER_API_KEY=sk-or-...
LLM_PROVIDER=openrouter
OPENROUTER_CHAT_MODEL=deepseek/deepseek-v4-flash   # optional default
```

OpenRouter does not host embeddings. Either set `OPENROUTER_EMBEDDING_MODEL` to an
OpenAI-compatible model the gateway will proxy, or run Ollama for embeddings only.

### Together.ai

```sh
# Local dev:
TOGETHER_API_KEY=...
TOGETHER_CHAT_MODEL=...           # optional
TOGETHER_EMBEDDING_MODEL=...      # optional
```

The Together default embedding is 768-dim — adjust `EMBEDDING_DIMENSION` and the migration to
match.

### Other OpenAI-compatible API

```sh
# Local dev:
LLM_API_URL=https://api.groq.com/openai
LLM_API_KEY=...                   # leave unset if your endpoint doesn't require one
LLM_MODEL=...                     # chat model name
LLM_EMBEDDING_MODEL=...           # embedding model name
```

### Note on changing the LLM provider or embedding model

If you change the embedding provider/model, you must wipe the existing embeddings (the
dimension must match across the LLM, the `EMBEDDING_DIMENSION` constant, and the Postgres
`vector(N)` columns). The simplest reset:

```sh
supabase db reset                # drops + reapplies migrations (clears all data)
pnpm seed                        # re-creates default world + agents
```

## Customize your own simulation

> Whenever you change character data, re-seed (`supabase db reset` then `pnpm seed`) so the
> Postgres `agent_descriptions` rows reflect the new identities/plans.

1. **Characters and stories.** All characters and stories — plus their spritesheet references —
   live in [`data/characters.ts`](./data/characters.ts). The default list is the 12 zodiac
   animals; replace them with whatever you want.

2. **Spritesheets.** In `data/characters.ts`:

   ```ts
   export const characters = [
     {
       name: 'f1',
       textureUrl: '/assets/32x32folk.png',
       spritesheetData: f1SpritesheetData,
       speed: 0.1,
     },
     ...
   ];
   ```

   Find a sprite sheet for your character and define its motion / animations in the
   corresponding `*SpritesheetData` constant.

3. **Background map.** The map is loaded from `data/gentle.js` and inserted into the `maps`
   table by `scripts/seed.ts`. To replace it:

   - Use [Tiled](https://www.mapeditor.org/) to export your tilemap as JSON with two layers
     named `bgtiles` and `objmap`.
   - Convert it with `data/convertMap.js`:

     ```sh
     node data/convertMap.js <mapDataPath> <assetPath> <tilesetpxw> <tilesetpxh>
     ```

   This generates `converted-map.js`, which you can drop in next to `gentle.js` and import
   from `scripts/seed.ts`.

4. **Background music (optional).** AI World ships with an in-game upload UI: log in, click
   the small `+` next to the **Music** button, and pick an audio file. The browser uploads it
   into the `music` Supabase Storage bucket (created above) and inserts a row into
   `public.music`. The frontend always plays the most recent `kind = 'background'` track.

   To plug in [Replicate MusicGen](https://replicate.com/) for periodic generation, hit
   Replicate from a small cron worker (or a GitHub Action) and POST the resulting public URL
   into `public.music` with `kind = 'background'` — the frontend will pick it up
   automatically.

## Commands to run / test / debug

The Worker exposes HTTP routes (no more `npx convex run testing:*`). Set
`WORKER_URL=http://127.0.0.1:8787` (or your deployed URL) and `curl` against them. Replace
`<world-id>` with the value `pnpm seed` printed (or query
`select world_id from world_status where is_default;` from `supabase db psql`).

| Action                                          | Command                                                       |
| ----------------------------------------------- | ------------------------------------------------------------- |
| Pause the simulation (`stoppedByDeveloper`)     | `curl -X POST $WORKER_URL/world/<world-id>/freeze`            |
| Resume it                                       | `curl -X POST $WORKER_URL/world/<world-id>/resume`            |
| Kick the engine (cold-start the DO)             | `curl -X POST $WORKER_URL/world/<world-id>/start`             |
| Wipe the world and start fresh                  | `supabase db reset && pnpm seed`                              |
| Inspect data                                    | `supabase db psql`, http://127.0.0.1:54323, or hosted Studio  |
| Run the unit test suite                         | `pnpm test`                                                   |
| Typecheck both packages                         | `pnpm typecheck`                                              |

The repository covers the engine, the data classes, the LLM client, the DB repository, the
DO tick loop, and the WebSocket fanout. The end-to-end Supabase + DO integration is exercised
by running the full stack locally — see the gap notes at the bottom of `MIGRATION.md`.

## Windows installation

### Pre-requisites

1. **Windows 10/11 with WSL2 installed**
2. **Internet connection**

Steps:

1. Install WSL2 — follow
   [this guide](https://docs.microsoft.com/en-us/windows/wsl/install). We recommend Ubuntu.

2. Update packages:

   ```sh
   sudo apt update
   ```

3. Install NVM and Node 20:

   ```sh
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.2/install.sh | bash
   export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
   [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
   source ~/.bashrc
   nvm install 20 && nvm use 20
   ```

4. Enable pnpm via Corepack:

   ```sh
   corepack enable
   corepack prepare pnpm@10 --activate
   ```

5. Install Python (some transitive deps need it):

   ```sh
   sudo apt-get install python3 python3-pip
   sudo ln -s /usr/bin/python3 /usr/bin/python
   ```

Then follow the steps under [Installation](#installation).

## Deploy the app to production

### 1. Hosted Supabase

Create a project at https://supabase.com/dashboard, then:

```sh
supabase link --project-ref <ref>
supabase db push
supabase storage create music --public      # for the music upload UI
```

Grab the **anon key** and **service_role key** from Settings → API.

### 2. Cloudflare Worker

Log in once with `pnpm --filter ai-world-worker exec wrangler login`, then:

```sh
# Set production secrets:
pnpm --filter ai-world-worker exec wrangler secret put SUPABASE_URL
pnpm --filter ai-world-worker exec wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# …plus your chosen LLM provider's keys.

# Set OPERATIONS_URL to the deployed worker URL once you have it. It must
# point back at this same Worker.
# Example: ai-world.<your-account>.workers.dev/agentOperations.

pnpm deploy:worker
```

Wrangler prints the public URL — use it as `NEXT_PUBLIC_WORKER_URL` for the frontend.

### 3. Seed the production world

From any machine with the service-role key:

```sh
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=… \
WORKER_URL=https://ai-world.<account>.workers.dev \
  pnpm seed
```

### Adding GitHub auth

NextAuth's GitHub provider is preconfigured in [`auth.ts`](./auth.ts). Create an OAuth app at
https://github.com/settings/developers (callback URL:
`https://<your-app>/api/auth/callback/github`) and set in your deployment environment:

```bash
AUTH_SECRET=<random 32+ chars>
GITHUB_ID=<oauth client id>
GITHUB_SECRET=<oauth client secret>
```

Without these, only the guest credential provider is available.

### Deploy the frontend to Vercel

- Register a Vercel account and [install the Vercel CLI](https://vercel.com/docs/cli).
- **If you are using GitHub Codespaces:** install the Vercel CLI in your codespace and
  authenticate with `vercel login`.
- Deploy with `vercel --prod`. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_WORKER_URL`, `AUTH_SECRET`, `GITHUB_ID`, and `GITHUB_SECRET` in the Vercel
  project settings.
- Vercel detects `pnpm` automatically from `pnpm-lock.yaml`. The default build command
  (`pnpm build`) is correct.

## Using local inference from a deployed Worker

You can keep using [Ollama](https://github.com/jmorganca/ollama) for conversations and proxy
the traffic from the deployed Cloudflare Worker to your local machine via Tunnelmole or Ngrok.

Steps:

1. Set up either Tunnelmole or Ngrok (instructions below).
2. Point the Worker at the tunnelled URL:
   ```sh
   pnpm --filter ai-world-worker exec wrangler secret put OLLAMA_HOST
   # paste your tunnelmole/ngrok URL
   ```
3. Add the tunnel domain to Ollama's allowlist (`OLLAMA_ORIGINS`). See
   [ollama.ai](https://ollama.ai) for details.

### Using Tunnelmole

[Tunnelmole](https://github.com/robbie-cahill/tunnelmole-client) is an open source tunneling
tool. Install it:

- NPM: `npm install -g tunnelmole`
- Linux: `curl -s https://tunnelmole.com/sh/install-linux.sh | sudo bash`
- Mac:
  `curl -s https://tunnelmole.com/sh/install-mac.sh --output install-mac.sh && sudo bash install-mac.sh`
- Windows: install via NPM, or grab the
  [`tmole.exe`](https://tunnelmole.com/downloads/tmole.exe).

Then run `tmole 11434`. Tunnelmole prints a unique URL — use it as `OLLAMA_HOST`.

### Using Ngrok

Ngrok is a popular closed-source tunneling tool.

- [Install Ngrok](https://ngrok.com/docs/getting-started/).

Then `ngrok http http://localhost:11434` and use the printed URL as `OLLAMA_HOST`.

## Troubleshooting

### Wiping the database and starting over

```sh
supabase db reset      # drops + reapplies migrations
pnpm seed
```

### Frontend can't reach the Worker

- Confirm `NEXT_PUBLIC_WORKER_URL` is set in `.env.local` and matches what
  `wrangler dev` printed.
- Hit `curl $NEXT_PUBLIC_WORKER_URL/health` — it should return `{"ok":true}`.
- WebSocket failures usually mean CORS or a mismatched URL — the Worker's CORS allows `*`
  by default; check your browser's network tab for the upgrade request.

### Worker can't reach Supabase

- Run `pnpm --filter ai-world-worker exec wrangler tail` to see live logs.
- Make sure you used the **service_role** key (not the anon key) for the Worker secret —
  RLS blocks most writes for anon users.

### Reaching Ollama

- **Direct (Worker → host):** the Worker is sandboxed and **cannot** reach `localhost`. Use
  Tunnelmole/Ngrok as in the previous section, or run Ollama on a publicly-reachable host.
- **Direct (Next.js dev server → host):** the Next.js side never talks to Ollama; everything
  routes through the Worker.

If you're running everything inside Docker / WSL, the same `socat`-based bridge from
upstream still works:

```sh
sudo apt install unzip socat
socat TCP-LISTEN:11434,fork TCP:$(cat /etc/resolv.conf | grep nameserver | awk '{print $2}'):11434 &
curl http://127.0.0.1:11434      # should respond "Ollama is running"
```

### Music upload fails

- Make sure the Storage bucket is named exactly `music` and is **public** (otherwise the
  anon client can't read it).
- The browser never inserts into `public.music` directly — the `POST /api/music/upload`
  Next.js route does that with the service-role key. Confirm `SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY` are set in `.env.local`.

### Updating the browser list

```bash
pnpm dlx update-browserslist-db@latest
```
