# Architecture

This documents dives into the high-level architecture of AI World and its different layers. We'll
first start with a brief overview and then go in-depth on each component. The overview should
be sufficient for forking AI World and changing game or agent behavior. Read on to the deep dives
if you're interested or running up against the engine's limitations.

The runtime now lives on Cloudflare Workers + Durable Objects with Supabase
Postgres as the source of truth (replacing the original Convex backend). See
`MIGRATION.md` for how the old Convex primitives map onto the new ones.

## Overview

AI World is split into a few layers:

- The server-side game logic in `shared/aiWorld`: This layer defines what state AI World maintains,
  how it evolves over time, and how it reacts to user input. Both humans and agents submit inputs
  that the game engine processes.
- The client-side game UI in `src/`: AI World uses `pixi-react` to render the game state to the
  browser for human consumption.
- The game engine in `shared/engine`: To make it easy to hack on the game rules, we've separated
  out the game engine from the AI World-specific game rules. The game engine is responsible for
  saving and loading game state from Postgres, coordinating feeding inputs into the engine,
  and actually running the game loop. The engine runs inside the per-world Cloudflare Durable
  Object (one DO instance per `worldId`); the DO Alarm drives the tick cadence.
- The agent in `workers/src/agent`: Agents run as part of the game loop, and can kick off
  asynchronous LLM operations in the surrounding Worker. Those operations can save state in
  separate tables, or submit inputs back to the game engine to modify game state. Internally,
  our agents use a combination of simple rule-based systems and talking to an LLM.

So, if you'd like to tweak agent behavior but keep the same game mechanics, check out `workers/src/agent`
for the async work, and `shared/aiWorld/agent.ts` for the game loop logic.
If you would like to add new gameplay elements (that both humans and agents can interact with), add
the feature to `shared/aiWorld`, render it in the UI in `src/`, and respond to it in `shared/aiWorld/agent.ts`.

If you have parts of your game that are more latency sensitive, you can move them out of the
engine into plain Postgres tables (read directly from the browser via `@supabase/supabase-js`,
or pushed via Supabase Realtime), only logging key bits into game state. See "Message data
model" below for an example.

## AI World game logic (`shared/aiWorld`)

### Data model

AI World's data model has a few concepts:

- Worlds (`shared/aiWorld/world.ts`) represent a map with many players interacting together.
- Players (`shared/aiWorld/player.ts`) are the core characters in the game. Players have human readable names and
  descriptions, and they may be associated with a human user. At any point in time, a player may be pathfinding
  towards some destination and has a current location.
- Conversations (`shared/aiWorld/conversations.ts`) are created by a player and end at some point in time.
- Conversation memberships (`shared/aiWorld/conversationMembership.ts`) indicate that a player is a member
  of a conversation. Players may only be in one conversation at any point in time, and conversations
  currently have exactly two members. Memberships may be in one of three states:
  - `invited`: The player has been invited to the conversation but hasn't accepted yet.
  - `walkingOver`: The player has accepted the invite to the conversation but is too far away to talk. The
    player will automatically join the conversation when they get close enough.
  - `participating`: The player is actively participating in the conversation.

### Schema

All tables are defined in `supabase/migrations/00000000000001_init.sql` and fall into three
categories:

1. **Engine tables** (`engines`, `inputs`, `worlds`, `world_status`) for engine-internal state
   and the single-document game snapshot. The hot-path world doc is one JSONB column on
   `public.worlds` — the DO replaces it each step.
2. **Game tables** (`maps`, `player_descriptions`, `agent_descriptions`, `archived_*`,
   `participated_together`, `messages`) for the human-readable parts of game state that don't
   need to fit in the world doc.
3. **Agent tables** (`memories`, `memory_embeddings`, `embeddings_cache`) for agent state.
   Agents read and write these from operations that run inside the Worker (not the DO).

### Inputs (`shared/aiWorld/inputs.ts`)

AI World modifies its data model by processing inputs. Inputs are submitted by players and agents
and processed by the game engine. We specify inputs in the `inputs` object in
`shared/aiWorld/inputs.ts`. Use the `inputHandler` function to construct an input handler. Input
arguments are validated at the Worker boundary by Zod schemas in `workers/src/index.ts` so the
in-engine handlers can rely on already-typed payloads.

- Joining (`join`) and leaving (`leave`) the game.
- Moving a player to a particular location (`moveTo`): Movement in AI World is similar to RTS games, where
  the players specify where they want to go, and the engine figures out how to get there.
- Starting a conversation (`startConversation`), accepting an invite (`acceptInvite`), rejecting an invite
  (`rejectInvite`), and leaving a conversation (`leaveConversation`). To track typing indicators,
  you use `startTyping` and `finishSendingMessage`. These are imported from `game/conversations.ts`.
- Agent inputs are imported from `aiWorld/agentInputs.ts` for things like remembering conversations,
  deciding what to do, etc.

Each of these inputs' implementation method checks invariants and updates game state as desired.
For example, the `moveTo` input checks that the player isn't participating in a conversation,
throwing an error telling them to leave the conversation first if so, and then updates their
pathfinding state with the desired destination.

### Simulation

Other than when processing player inputs, the game state can change over time in the background as the
simulation runs time forward. For example, if a player has decided to move along a path, their position
will gradually update as time moves forward. Similarly, if two players collide into each other, they'll
notice and replan their paths, trying to avoid obstacles.

### Message data model

We manage the tables for tracking chat messages in separate tables not affiliated
with the game engine. This is for a few reasons:

- The core simulation doesn't need to know about messages, so keeping them
  out keeps game state small.
- Messages are updated very frequently (when streamed out from OpenAI) and
  benefit from lower input latency, so they're not a great fit for the engine.
  See "Design goals and limitations" below.

Messages (defined in `supabase/migrations/00000000000001_init.sql`) are in a conversation and indicate an author and message text.
Each conversation has a typing state in the conversations table that indicates that a player
is currently typing. Players can still send messages while another player is typing, but
having the indicator helps agents (and humans) not talk over each other.

The browser reads `public.messages` directly via `@supabase/supabase-js` and subscribes to
inserts via Supabase Realtime, so chat updates do not need to go through the WebSocket fanout
that the world doc uses.

## Game engine (`shared/engine`)

Given the description of AI World's game behavior in the previous section,
the `AbstractGame` class in `shared/engine/abstractGame.ts` implements actually running the simulation.
The game engine has a few responsibilities:

- Coordinating incoming player inputs, feeding them into the simulation, and sending their
  return values (or errors) to the client.
- Running the simulation forward in time.
- Saving and loading game state from Postgres (via the repository in `shared/db/repository.ts`).
- Executing the game behavior efficiently inside the per-world Durable Object, minimizing input
  latency.

AI World's game behavior is implemented in the `Game` subclass.

### Input handling

Users submit inputs by sending a WebSocket `sendInput` frame to the per-world Durable Object
(`workers/src/do/world.ts`). The DO inserts a row into `public.inputs`, assigning a monotonically
increasing input number and stamping the input with the receive time, then processes them as part
of the next tick and writes the return value (or error) back onto the same row. Clients receive
the result either over the WebSocket (`inputResult` frame) or by polling
`GET /world/:id/inputs/:inputId`.

`Game` provides an abstract method `handleInput` that `AiWorld` implements with its specific behavior.

### Running the simulation

The `Game` class specifies how it simulates time forward with the `tick` method:

- `tick(now)` runs the simulation forward until the given timestamp
- Ticks are run at a high frequency, configurable with `tickDuration` (milliseconds). Since AI town has smooth motion
  for player movement, it runs at 60 ticks per second.
- It's generally a good idea to break up game logic into separate systems that can be ticked forward independently.
  For example, AI World's `tick` method advances pathfinding with `Player.tickPathfinding`, player positions with
  `Player.tickPosition`, conversations with `Conversation.tick`, and `Agent.tick` for agent logic.

To avoid hitting Postgres 60 times per second (which would be expensive and slow), the engine
batches many ticks into a _step_. AI World runs steps at 1 per second. Here's how a step works:

1. Load the game state into memory (only on cold start; the DO keeps the parsed `Game` instance
   alive across steps).
2. Decide how long to run.
3. Execute many ticks for our time interval, alternating between feeding in inputs with
   `handleInput` and advancing the simulation with `tick`.
4. Write the updated game state back to Postgres in one batched diff (see `saveGameDiff` in
   `shared/db/repository.ts`).
5. Broadcast the new world doc to every connected WebSocket via `broadcastSnapshot`.

One core invariant is that the game engine is fully "single-threaded" per world, so there are never two runs of
an engine's step overlapping in time. Not having to think about race conditions or concurrency makes writing game
engine code a lot easier.

However, preserving this invariant is a little tricky. If the engine is idle for a minute and an
input comes in, we want to run the engine immediately but then cancel its run after the minute's
up. If we're not careful, a race condition may cause us to run multiple copies of the engine if an
input comes in just as an idle timeout is expiring!

Our approach is to store a generation number with the engine that monotonically increases over time.
All scheduled runs of the engine contain their expected generation number as an argument. Then, if
we'd like to cancel a future run of the engine, we can bump the generation number by one, and then
we're guaranteed that the subsequent run will fail immediately as it'll notice that the engine's
generation number does not match its expected one.

### Engine state management

The `World`, `Player`, `Conversation`, and `Agent` classes coordinate loading data into memory from the database,
modifying it according to the game rules, and serializing it to write back out to the database. Here's the flow:

1. The Durable Object Alarm fires (see `WorldDO` in `workers/src/do/world.ts`) and calls
   `runAlarmCycle` (`workers/src/do/tick.ts`).
2. On the first tick after a cold start, `Game.load` reads the world doc and engine row via
   `loadGameState` in `shared/db/repository.ts` and parses the serialized rows into `Game`,
   `Player`, `Conversation`, `Agent`, etc. instances.
3. The engine runs the simulation, modifying the in-memory game objects.
4. At the end of a step, `Game.saveStep` computes a diff of the game state and `saveGameDiff`
   applies it: replacing the world doc, archiving removed players/conversations/agents, updating
   the `participated_together` graph, and upserting descriptions.
5. The DO emits any agent operations to `/agentOperations` so the LLM work happens off the tick
   loop in the surrounding Worker.
6. Because one DO instance owns the world, it continues to run subsequent steps without
   re-loading from Postgres. The DO is also the only writer for the world doc, so there is no
   contention.

Just as we assume that the game engine is "single threaded", we also assume that the game engine _exclusively_
owns the tables that store game engine state. Only the game engine should programmatically modify these tables,
so components outside the engine can only mutate them by sending inputs.

### Historical tables

If we're only writing updates out to the database at the end of the step, and steps are only running at once per
second, continuous quantities like position will only update every second. This, then, defeats the whole purpose
of having high-frequency ticks: Player positions will jump around and look choppy.

To solve this, we track the historical values of quantities like position _within_ a step, storing the value
at the end of each tick. Then, the client receives both the current value _and_ the past step's worth of
history, and it can "replay" the history to make the motion smooth.

The game tracks these quantities at the end of each tick by feeding them to a `HistoricalObject`. This object
efficiently tracks its changes over time and serializes them into a buffer that clients can use for replaying
its history. There are a few limitations on `HistoricalObject`:

- Historical objects can only have numeric (floating point) values and can't have nested objects or optional fields.
- Historical objects must declare which fields they'd like to track.

We store each player's "location" (i.e. its position, orientation, and speed) in a `HistoricalObject` and
write it to the `worlds` document at the end of a step when computing a diff.

## Client-side game UI (`src/`)

The browser holds two connections to the backend:

- A **Supabase JS client** (`src/lib/supabase.ts`) that queries `world_status`, `messages`,
  `player_descriptions`, etc. directly with the anon key, and subscribes to inserts via
  Supabase Realtime. RLS policies in the migration restrict the anon role to read-only access
  on the tables the UI needs.
- A **WebSocket client** (`src/lib/game-client.ts`) that talks to the per-world Durable Object.
  This is the source of truth for the live world doc and for input results — `getGameClient` is
  the React-friendly wrapper, and the existing `useWorldState`/`useSendInput`/etc. hooks live in
  `src/hooks/`. See `MIGRATION.md` for the full Convex-hook → new-hook map.

The one exception is for historical fields, which feed the latest state into a
`useHistoricalValue` hook that parses the history buffer and replays time forward for smooth
motion. To keep replayed time synchronized across multiple historical buffers, the
`useHistoricalTime` hook at the top of the tree tracks current time and is passed down into
components.

## Agent architecture (`workers/src/agent`)

### The agent loop (`shared/aiWorld/agent.ts`)

Agents execute any game state changes inline in the tick, and schedule operations to do anything
that requires a long-lived request (LLM calls, vector search) or accessing non-game tables. The
flow is:

1. Logic in `Agent.tick` reads and modifies game state as time progresses — for example, waiting
   until the agent is near another player to start talking.
2. When there is something that needs to talk to an LLM or read/write external data,
   `Agent.tick` calls `startOperation` with the operation name (e.g. `agentGenerateMessage`).
3. The DO emits the operation to the surrounding Worker via `OPERATIONS_URL`. The Worker looks
   up the operation in `workers/src/agent/operations.ts` and runs it off the tick loop.
4. The operation can read agent tables directly via the service-role Supabase client and write
   results back into agent tables (memories, embeddings).
5. Game state must not be written from operations — instead, the operation submits a follow-up
   input back to the DO with `sendInput`. Inputs are referenced by their name as a string, like
   `moveTo` or `finishRememberConversation`.
6. Inputs are defined with `inputHandler` and are given an instance of the AiWorld game to
   modify, similar to the game loop. In fact, these are called as part of the next tick before
   `tickAgent`.
7. When an operation completes, the follow-up input clears the agent's `inProgressOperation`.
   This ensures an agent only does one thing at a time.
8. `Agent.tick` then observes the new game state and continues to make decisions.

### Conversations (`workers/src/agent/conversations.ts`)

The agent code calls into the conversation layer which implements the prompt engineering for
injecting personality and memories into the LLM responses. It has functions for starting a
conversation (`startConversationMessage`), continuing after the first message
(`continueConversationMessage`), and politely leaving a conversation (`leaveConversationMessage`).
Each function loads structured data from Postgres, queries the memory layer for the agent's
opinion about the player they're talking with, and then calls the configured LLM client
(`shared/util/llm.ts`).

### Memories (`workers/src/agent/memory.ts`)

After each conversation the LLM summarizes the message history, and we compute an embedding of
the summary text and write it into the `memory_embeddings` pgvector table. Then, when starting
a new conversation with, say, Danny, we embed "What do you think about Danny?", call the
`match_memories` SQL RPC to find the three most similar memories by cosine similarity, and fetch
their summary texts to inject into the conversation prompt.

### Embeddings cache (`workers/src/agent/embeddingsCache.ts`)

To avoid computing the same embedding over and over again, we cache embeddings by a hash of
their text in the Postgres `embeddings_cache` table.

## Design goals and limitations

AI World's game engine has a few design goals:

- Stay close to "regular Postgres + WebSocket" usage. Game state lives in normal tables that
  are visible from the Supabase Studio, the dashboard, or `psql`.
- Be as similar to existing engines as possible, so it's easy to change the behavior. We chose
  a `tick()` based model for simulation since it's commonly used elsewhere and intuitive.
- Decouple agent behavior from the game engine. Human players and AI agents do the same things
  in the game.

These design goals imply some inherent limitations:

- All data is loaded into memory each step. The active game state loaded by the game should be small
  enough to fit into memory and load and save frequently. Try to keep game state to less than a few dozen
  kilobytes: Games that require tens of thousands of objects interacting together may not be a good
  fit.
- All inputs are fed through the database in the `inputs` table, so applications that require very
  large or frequent inputs may not be a good fit.
- Input latency will be around one RTT (time for the input to make it to the server and the
  response to come back) plus half the step size (for expected server input delay when the
  input's waiting for the next step). Historical values add another half step size of input
  latency since their values are viewed slightly in the past. As configured, this will roughly
  be around 1.5s of input latency, which won't be a good fit for competitive games. You can
  configure the step size to be smaller (e.g. 250ms) which will decrease input latency at the
  cost of more Postgres writes per second and more WebSocket fanout traffic.
- The game engine is designed to be single threaded. JavaScript operating over plain objects
  in-memory can be surprisingly fast, but if your simulation is very computationally expensive, it
  may not be a good fit on AI World's engine today.
