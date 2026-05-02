# AI World 🏠💻💌

> **Stack note:** AI World was originally built on Convex. This fork has been
> migrated to **Supabase Postgres + Cloudflare Workers / Durable Objects**.
> See [`MIGRATION.md`](./MIGRATION.md) for an architectural overview.
> The setup steps below describe the new stack.

[Join our community Discord: AI Stack Devs](https://discord.gg/PQUmTBTGmT)

<img width="1454" alt="Screen Shot 2023-08-14 at 10 01 00 AM" src="https://github.com/a16z-infra/ai-town/assets/3489963/a4c91f17-23ed-47ec-8c4e-9f9a8505057d">

AI World is a virtual town where AI characters live, chat and socialize.

This project is a deployable starter kit for easily building and customizing your own version of AI
town. Inspired by the research paper
[_Generative Agents: Interactive Simulacra of Human Behavior_](https://arxiv.org/pdf/2304.03442.pdf).

The primary goal of this project, beyond just being a lot of fun to work on, is to provide a
platform with a strong foundation that is meant to be extended. The back-end natively supports
shared global state, transactions, and a simulation engine and should be suitable from everything
from a simple project to play around with to a scalable, multi-player game. A secondary goal is to
make a JS/TS framework available as most simulators in this space (including the original paper
above) are written in Python.

## Overview

- 💻 [Stack](#stack)
- 🧠 [Installation](#installation)
- 💻️ [Windows Pre-requisites](#windows-installation)
- 🤖 [Configure your LLM of choice](#connect-an-llm)
- 👤 [Customize - YOUR OWN simulated world](#customize-your-own-simulation)
- 👩‍💻 [Deploying to production](#deploy-the-app-to-production)
- 🐛 [Troubleshooting](#troubleshooting)

## Stack

- Frontend: [Next.js 16](https://nextjs.org/) with [shadcn/ui](https://ui.shadcn.com/) and
  [PixiJS](https://pixijs.com/) for the rendered map.
- Auth: [NextAuth](https://authjs.dev/) (GitHub provider, plus a guest credential).
- Database, vector search, file storage, realtime: [Supabase](https://supabase.com/) (Postgres
  + pgvector + Storage + Realtime).
- Game engine + WebSocket fanout: [Cloudflare Workers](https://workers.cloudflare.com/) +
  [Durable Objects](https://developers.cloudflare.com/durable-objects/) (one DO per world; the
  DO Alarm drives the tick loop).
- LLM clients: [OpenAI](https://platform.openai.com/), [OpenRouter](https://openrouter.ai/),
  [Together.ai](https://www.together.ai/), [Ollama](https://ollama.com/), or any OpenAI-compatible
  endpoint.
- Background music (optional): [Replicate](https://replicate.com/)
  [MusicGen](https://huggingface.co/spaces/facebook/MusicGen). Tracks are uploaded into the
  `music` Supabase Storage bucket and surfaced through the in-game upload UI.

Other credits:

- Pixel Art Generation: [Replicate](https://replicate.com/),
  [Fal.ai](https://serverless.fal.ai/lora)
- All interactions, background music and rendering on the <Game/> component in the project are
  powered by [PixiJS](https://pixijs.com/).
- Tilesheet:
  - https://opengameart.org/content/16x16-game-assets by George Bailey
  - https://opengameart.org/content/16x16-rpg-tileset by hilau
- We used https://github.com/pierpo/phaser3-simple-rpg for the original POC of this project. We have
  since re-wrote the whole app, but appreciated the easy starting point
- Original assets by [ansimuz](https://opengameart.org/content/tiny-rpg-forest)
- The UI is based on original assets by
  [Mounir Tohami](https://mounirtohami.itch.io/pixel-art-gui-elements)

# Installation

The new stack has three moving pieces:

1. **Supabase** — Postgres + pgvector + Storage + Realtime.
2. **Cloudflare Worker (with a Durable Object)** — runs the game tick loop and the LLM
   operations, serves a WebSocket to the browser.
3. **Next.js frontend** — talks to Supabase over the public anon key for reads, and to the
   Worker over WebSocket / HTTP for writes.

You'll set them up in that order. See
[`MIGRATION.md`](./MIGRATION.md) for the full architecture and a hook-by-hook map of what
replaced each `convex/` module.

If you're on Windows, jump to [Windows Installation](#windows-installation) first.

## 1. Supabase

Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and start a local stack:

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

To deploy against a hosted Supabase project instead, run `supabase link --project-ref <ref>` and
then `supabase db push`.

## 2. Cloudflare Worker + Durable Object

```sh
cd workers
npm install

# Talking to Supabase from the Worker:
npx wrangler secret put SUPABASE_URL              # paste from `supabase status`
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY # paste from `supabase status`

# Pick exactly one LLM provider:
npx wrangler secret put OLLAMA_HOST               # http://host.docker.internal:11434
# or:
npx wrangler secret put OPENAI_API_KEY            # sk-…
# or OPENROUTER_API_KEY / TOGETHER_API_KEY / LLM_API_URL+LLM_API_KEY for a custom endpoint.

# Required so the DO can call back into the Worker for LLM ops:
echo 'OPERATIONS_URL = "http://127.0.0.1:8787/agentOperations"' >> wrangler.toml

npm run dev                                       # http://127.0.0.1:8787
```

For production, run `npm run deploy` from the same directory. Wrangler will print the public
worker URL (e.g. `https://ai-world.<account>.workers.dev`) — that's what `NEXT_PUBLIC_WORKER_URL`
should point at.

## 3. Seed the world

In a third terminal, with Supabase + Worker still running:

```sh
SUPABASE_URL=…  SUPABASE_SERVICE_ROLE_KEY=…  WORKER_URL=http://127.0.0.1:8787  npm run seed
```

This creates the engine row, the world row, the `world_status` row, the map, and queues a
`createAgent` input for every entry in `data/characters.ts → Descriptions`. The DO picks the
inputs up on its next tick and creates the agents.

## 4. Frontend

```sh
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_WORKER_URL,
# AUTH_SECRET, and (optional) GitHub OAuth credentials.
npm install
npm run dev          # http://localhost:3000
```

Open http://localhost:3000. You should see the safari, the agents wandering after a few ticks,
and chat history when you click on any animal.

## Connect an LLM

The Worker reads the LLM provider from its bound env vars (set with `wrangler secret put`).
You can force a specific provider with `LLM_PROVIDER`; otherwise the first provider whose API
key is set wins. See `shared/util/llm.ts` for the resolution order.

### Ollama (default for local dev)

By default the Worker will try Ollama at `http://127.0.0.1:11434`.

1. Download and install [Ollama](https://ollama.com/).
2. Open the app, or run `ollama serve` in a terminal.
3. `ollama pull llama3` (chat) and `ollama pull mxbai-embed-large` (embeddings — 1024-dim).
4. Test it: `ollama run llama3`.

If you change the embedding model, update `EMBEDDING_DIMENSION` in `shared/util/llm.ts` **and**
the `vector(1024)` columns in `supabase/migrations/00000000000001_init.sql`. Then re-run
`supabase db reset` to drop the old embeddings table.

### OpenAI

```sh
cd workers
npx wrangler secret put OPENAI_API_KEY        # sk-…
# Optional overrides:
npx wrangler secret put OPENAI_CHAT_MODEL     # default: gpt-4o-mini
npx wrangler secret put OPENAI_EMBEDDING_MODEL # default: text-embedding-ada-002
```

OpenAI's default embedding is 1536-dim. Edit `EMBEDDING_DIMENSION` in `shared/util/llm.ts` to
match, and update the `vector(...)` columns in the migration accordingly.

### OpenRouter

```sh
cd workers
npx wrangler secret put OPENROUTER_API_KEY    # sk-or-…
npx wrangler secret put LLM_PROVIDER          # openrouter
# Optional:
npx wrangler secret put OPENROUTER_CHAT_MODEL # default: deepseek/deepseek-v4-flash
```

OpenRouter does not host embeddings. Either set `OPENROUTER_EMBEDDING_MODEL` to an
OpenAI-compatible model the gateway will proxy, or run Ollama for embeddings only.

### Together.ai

```sh
cd workers
npx wrangler secret put TOGETHER_API_KEY      # paste from together.ai/settings/api-keys
# Optional:
npx wrangler secret put TOGETHER_CHAT_MODEL
npx wrangler secret put TOGETHER_EMBEDDING_MODEL
```

The Together default embedding is 768-dim — adjust `EMBEDDING_DIMENSION` and the migration to
match.

### Other OpenAI-compatible API

```sh
cd workers
npx wrangler secret put LLM_API_URL           # e.g. https://api.groq.com/openai
npx wrangler secret put LLM_API_KEY           # leave unset if your endpoint doesn't require one
npx wrangler secret put LLM_MODEL             # chat model name
npx wrangler secret put LLM_EMBEDDING_MODEL   # embedding model name
```

### Note on changing the LLM provider or embedding model

If you change the embedding provider/model, you must wipe the existing embeddings (the dimension
must match across the LLM, the `EMBEDDING_DIMENSION` constant, and the Postgres `vector(N)`
columns). The simplest reset:

```sh
supabase db reset                # drops + reapplies migrations (clears all data)
npm run seed                     # re-creates default world + agents
```

## Customize your own simulation

> Whenever you change character data, re-seed (`supabase db reset` then `npm run seed`) so the
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

     - `<mapDataPath>`: path to the Tiled JSON file
     - `<assetPath>`: path to the tileset image
     - `<tilesetpxw>`: tileset width in pixels
     - `<tilesetpxh>`: tileset height in pixels

     This generates `converted-map.js`, which you can drop in next to `gentle.js` and import
     from `scripts/seed.ts`.

4. **Background music (optional).** AI World ships with an in-game upload UI: log in, click the
   small `+` next to the **Music** button, and pick an audio file. The browser uploads it into
   the `music` Supabase Storage bucket (created above) and inserts a row into `public.music`.
   The frontend always plays the most recent `kind = 'background'` track.

   To plug in [Replicate MusicGen](https://replicate.com/) for periodic generation, hit
   Replicate from a small cron worker (or a GitHub Action) and POST the resulting public URL
   into `public.music` with `kind = 'background'` — the frontend will pick it up
   automatically. The legacy Convex cron + webhook integration was removed in this fork.

## Commands to run / test / debug

The Convex `npx convex run testing:*` helpers were replaced by Worker HTTP routes. Set
`WORKER_URL=http://127.0.0.1:8787` (or your deployed URL) and run `curl` against them. Replace
`<world-id>` with the value `npm run seed` printed (or query
`select world_id from world_status where is_default;` from `supabase db psql`).

**Pause the simulation** (`testing:stop`):

```sh
curl -X POST $WORKER_URL/world/<world-id>/freeze
```

The DO stops scheduling alarms; the row in `world_status` flips to `stoppedByDeveloper`.

**Resume it** (`testing:resume`):

```sh
curl -X POST $WORKER_URL/world/<world-id>/resume
```

Flips the row back to `running` and kicks the DO so it resumes its tick loop.

**Kick the engine** (`testing:kick`):

```sh
curl -X POST $WORKER_URL/world/<world-id>/start
```

Loads the world into the DO if it had hibernated and arms the alarm.

**Wipe the world and start fresh** (`testing:wipeAllTables` + `init`):

```sh
supabase db reset      # drops + reapplies the schema
npm run seed           # re-creates the default world and agents
```

**Inspect data.** Browse Postgres via `supabase db psql`, the local Studio at
http://127.0.0.1:54323, or the dashboard for hosted projects.

**Run the unit test suite.**

```sh
npm test
```

The repository covers the engine, the data classes, the LLM client, the DB repository, the
DO tick loop, and the WebSocket fanout. The end-to-end Supabase + DO integration is exercised
by running the full stack locally — see the gap notes at the bottom of `MIGRATION.md`.

## Windows Installation

### Prerequisites

1. **Windows 10/11 with WSL2 installed**
2. **Internet connection**

Steps:

1. Install WSL2

   First, you need to install WSL2. Follow
   [this guide](https://docs.microsoft.com/en-us/windows/wsl/install) to set up WSL2 on your Windows
   machine. We recommend using Ubuntu as your Linux distribution.

2. Update Packages

   Open your WSL terminal (Ubuntu) and update your packages:

   ```sh
   sudo apt update
   ```

3. Install NVM and Node.js

   NVM (Node Version Manager) helps manage multiple versions of Node.js. Install NVM and Node.js
   20 (the version `wrangler` and `next@16` are tested against):

   ```sh
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.2/install.sh | bash
   export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
   [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
   source ~/.bashrc
   nvm install 20
   nvm use 20
   ```

4. Install Python and Pip

   Python is needed by some transitive dependencies:

   ```sh
   sudo apt-get install python3 python3-pip
   sudo ln -s /usr/bin/python3 /usr/bin/python
   ```

At this point, follow the steps under [Installation](#installation).

## Deploy the app to production

### 1. Hosted Supabase

Create a project at https://supabase.com/dashboard, then:

```sh
supabase link --project-ref <ref>
supabase db push
supabase storage create music --public      # for the music upload UI
```

Grab the **anon key** and **service_role key** from the project Settings → API.

### 2. Cloudflare Worker

Log in once with `npx wrangler login`, then:

```sh
cd workers
# Set production secrets (uses your default wrangler env):
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# …plus your chosen LLM provider's keys, as in the local dev section.

# Set OPERATIONS_URL to the deployed worker URL once you have it (or skip and
# disable agent ops by leaving it unset). It must point back at this same Worker.
# Example: ai-world.<your-account>.workers.dev/agentOperations.

npm run deploy
```

Wrangler prints the public URL — use it as `NEXT_PUBLIC_WORKER_URL` for the frontend.

### 3. Seed the production world

From any machine with the service-role key:

```sh
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=… \
WORKER_URL=https://ai-world.<account>.workers.dev \
  npm run seed
```

### Adding GitHub auth

NextAuth's GitHub provider is preconfigured in [`auth.ts`](./auth.ts). Create an OAuth app at
https://github.com/settings/developers (callback URL: `https://<your-app>/api/auth/callback/github`)
and set in your deployment environment:

```bash
AUTH_SECRET=<random 32+ chars>
GITHUB_ID=<oauth client id>
GITHUB_SECRET=<oauth client secret>
```

Without these, only the guest credential provider is available.

### Deploy the frontend to Vercel

- Register an account on Vercel and then [install the Vercel CLI](https://vercel.com/docs/cli).
- **If you are using GitHub Codespaces:** install the Vercel CLI in your codespace and
  authenticate with `vercel login`.
- Deploy with `vercel --prod`. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_WORKER_URL`, `AUTH_SECRET`, `GITHUB_ID`, and `GITHUB_SECRET` in the Vercel
  project settings (Environment Variables).

## Using local inference from a deployed Worker

You can keep using [Ollama](https://github.com/jmorganca/ollama) for conversations and proxy
the traffic from the deployed Cloudflare Worker to your local machine via Tunnelmole or Ngrok.

Steps:

1. Set up either Tunnelmole or Ngrok (instructions below).
2. Point the Worker at the tunnelled URL:
   ```sh
   cd workers
   npx wrangler secret put OLLAMA_HOST       # paste your tunnelmole/ngrok URL
   ```
3. Add the tunnel domain to Ollama's allowlist (`OLLAMA_ORIGINS`). See
   [ollama.ai](https://ollama.ai) for details.

### Using Tunnelmole

[Tunnelmole](https://github.com/robbie-cahill/tunnelmole-client) is an open source tunneling tool.
Install it:

- NPM: `npm install -g tunnelmole`
- Linux: `curl -s https://tunnelmole.com/sh/install-linux.sh | sudo bash`
- Mac:
  `curl -s https://tunnelmole.com/sh/install-mac.sh --output install-mac.sh && sudo bash install-mac.sh`
- Windows: install via NPM, or grab the
  [`tmole.exe`](https://tunnelmole.com/downloads/tmole.exe).

Then run:

```
tmole 11434
```

Tunnelmole prints a unique URL. Use it as `OLLAMA_HOST`.

### Using Ngrok

Ngrok is a popular closed-source tunneling tool.

- [Install Ngrok](https://ngrok.com/docs/getting-started/).

Once Ngrok is installed and authenticated, run:

```
ngrok http http://localhost:11434
```

Use the printed URL as `OLLAMA_HOST`.

## Troubleshooting

### Wiping the database and starting over

```sh
supabase db reset      # drops + reapplies migrations
npm run seed
```

### Frontend can't reach the Worker

- Confirm `NEXT_PUBLIC_WORKER_URL` is set in `.env.local` and matches what
  `wrangler dev` printed.
- Hit `curl $NEXT_PUBLIC_WORKER_URL/health` — it should return `{"ok":true}`.
- WebSocket failures usually mean CORS or a mismatched URL — the Worker's CORS allows `*`
  by default; check your browser's network tab for the upgrade request.

### Worker can't reach Supabase

- Run `npx wrangler tail` from `workers/` to see live logs.
- Make sure you used the **service_role** key (not the anon key) for the Worker secret — RLS
  blocks most writes for anon users.

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

- Make sure the Storage bucket is named exactly `music` and is **public** (otherwise the anon
  client can't read it).
- The anon role must be allowed to insert into `public.music`. The migration ships with a
  permissive read policy; if you want browser-side uploads to insert metadata too, add an
  insert policy or move the upload through a small Worker route.

### Updating the browser list

```bash
npx update-browserslist-db@latest
```
