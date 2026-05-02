-- AI World schema for Supabase (Postgres).
-- Maps the Convex schema (convex/schema.ts, convex/aiWorld/schema.ts,
-- convex/agent/schema.ts, convex/engine/schema.ts) to relational tables.
--
-- Hot-path game state lives in JSONB columns because the original engine
-- replaces the entire world doc each tick — we keep that single-document
-- replace semantic, mediated by the Durable Object that owns the world.

create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ---------------------------------------------------------------------------
-- engines: tracks tick metadata. One per world.
-- ---------------------------------------------------------------------------
create table public.engines (
  id                       uuid primary key default gen_random_uuid(),
  current_time_ms          bigint,
  last_step_ts_ms          bigint,
  processed_input_number   bigint,
  running                  boolean not null default true,
  generation_number        bigint not null default 0,
  created_at               timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- worlds: single-document game state (mirrors convex aiWorld/world.ts).
-- The `state` JSONB matches `serializedWorld`:
--   { nextId, players[], conversations[], agents[], historicalLocations? }
-- ---------------------------------------------------------------------------
create table public.worlds (
  id          uuid primary key default gen_random_uuid(),
  state       jsonb not null,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- world_status: per-world lifecycle (default world, last viewed, status).
-- ---------------------------------------------------------------------------
create type world_status_kind as enum ('running', 'stoppedByDeveloper', 'inactive');

create table public.world_status (
  id            uuid primary key default gen_random_uuid(),
  world_id      uuid not null unique references public.worlds(id) on delete cascade,
  engine_id     uuid not null references public.engines(id) on delete cascade,
  is_default    boolean not null default false,
  last_viewed   bigint not null default extract(epoch from now()) * 1000,
  status        world_status_kind not null default 'running',
  created_at    timestamptz not null default now()
);

create unique index world_status_default_idx
  on public.world_status (is_default)
  where is_default = true;

-- ---------------------------------------------------------------------------
-- maps: tilemap definition (rarely changes).
-- ---------------------------------------------------------------------------
create table public.maps (
  id              uuid primary key default gen_random_uuid(),
  world_id        uuid not null unique references public.worlds(id) on delete cascade,
  width           int  not null,
  height          int  not null,
  tile_set_url    text not null,
  tile_set_dim_x  int  not null,
  tile_set_dim_y  int  not null,
  tile_dim        int  not null,
  bg_tiles        jsonb not null,
  object_tiles    jsonb not null,
  animated_sprites jsonb not null
);

-- ---------------------------------------------------------------------------
-- player_descriptions / agent_descriptions: human-readable metadata.
-- ---------------------------------------------------------------------------
create table public.player_descriptions (
  id          uuid primary key default gen_random_uuid(),
  world_id    uuid not null references public.worlds(id) on delete cascade,
  player_id   text not null,
  name        text not null,
  description text not null,
  character   text not null,
  unique (world_id, player_id)
);
create index on public.player_descriptions (world_id);

create table public.agent_descriptions (
  id          uuid primary key default gen_random_uuid(),
  world_id    uuid not null references public.worlds(id) on delete cascade,
  agent_id    text not null,
  identity    text not null,
  plan        text not null,
  unique (world_id, agent_id)
);
create index on public.agent_descriptions (world_id);

-- ---------------------------------------------------------------------------
-- archived_*: snapshots of players/conversations/agents removed from the live
-- world doc, kept for the UI/agent retrospection.
-- ---------------------------------------------------------------------------
create table public.archived_players (
  pk         uuid primary key default gen_random_uuid(),
  world_id   uuid not null references public.worlds(id) on delete cascade,
  player_id  text not null,
  data       jsonb not null,
  created_at timestamptz not null default now()
);
create index on public.archived_players (world_id, player_id);

create table public.archived_conversations (
  pk              uuid primary key default gen_random_uuid(),
  world_id        uuid not null references public.worlds(id) on delete cascade,
  conversation_id text not null,
  creator         text not null,
  created         bigint not null,
  ended           bigint not null,
  last_message    jsonb,
  num_messages    int not null,
  participants    jsonb not null,
  created_at      timestamptz not null default now()
);
create index on public.archived_conversations (world_id, conversation_id);

create table public.archived_agents (
  pk         uuid primary key default gen_random_uuid(),
  world_id   uuid not null references public.worlds(id) on delete cascade,
  agent_id   text not null,
  data       jsonb not null,
  created_at timestamptz not null default now()
);
create index on public.archived_agents (world_id, agent_id);

-- ---------------------------------------------------------------------------
-- participated_together: edges between players who shared a conversation.
-- Used by agent prompt-building and "previousConversation" queries.
-- ---------------------------------------------------------------------------
create table public.participated_together (
  pk              uuid primary key default gen_random_uuid(),
  world_id        uuid not null references public.worlds(id) on delete cascade,
  conversation_id text not null,
  player1         text not null,
  player2         text not null,
  ended           bigint not null
);
create index participated_together_edge_idx
  on public.participated_together (world_id, player1, player2, ended desc);
create index participated_together_history_idx
  on public.participated_together (world_id, player1, ended desc);
create index participated_together_conv_idx
  on public.participated_together (world_id, player1, conversation_id);

-- ---------------------------------------------------------------------------
-- inputs: durable input queue for the engine.
-- ---------------------------------------------------------------------------
create type input_return_kind as enum ('ok', 'error');

create table public.inputs (
  id                 uuid primary key default gen_random_uuid(),
  engine_id          uuid not null references public.engines(id) on delete cascade,
  number             bigint not null,
  name               text not null,
  args               jsonb not null,
  return_kind        input_return_kind,
  return_value       jsonb,
  return_error       text,
  received           bigint not null,
  unique (engine_id, number)
);
create index on public.inputs (engine_id, number);

-- ---------------------------------------------------------------------------
-- messages: chat log between players (read by UI in real time).
-- ---------------------------------------------------------------------------
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  world_id        uuid not null references public.worlds(id) on delete cascade,
  conversation_id text not null,
  message_uuid    text not null,
  author          text not null,
  text            text not null,
  created_at      timestamptz not null default now(),
  unique (conversation_id, message_uuid)
);
create index on public.messages (world_id, conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- music: storage references for background/player music.
-- ---------------------------------------------------------------------------
create type music_kind as enum ('background', 'player');

create table public.music (
  id          uuid primary key default gen_random_uuid(),
  storage_url text not null,            -- Supabase Storage public URL
  kind        music_kind not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- memories + memory_embeddings: agent long-term memory with pgvector.
-- The Convex schema stored memories and embeddings in two separate tables;
-- we keep that split so we can vacuum embeddings independently.
-- The default Ollama embedding dimension is 1024 (mxbai-embed-large).
-- Adjust the dimension to match EMBEDDING_DIMENSION in workers/src/util/llm.ts.
-- ---------------------------------------------------------------------------
create table public.memory_embeddings (
  id         uuid primary key default gen_random_uuid(),
  player_id  text not null,
  embedding  vector(1024) not null,
  created_at timestamptz not null default now()
);
create index memory_embeddings_player_idx on public.memory_embeddings (player_id);
-- Cosine-distance vector search; rebuild list size depending on data size.
create index memory_embeddings_vec_idx
  on public.memory_embeddings using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create type memory_kind as enum ('relationship', 'conversation', 'reflection');

create table public.memories (
  id            uuid primary key default gen_random_uuid(),
  player_id     text not null,
  description   text not null,
  embedding_id  uuid not null references public.memory_embeddings(id) on delete cascade,
  importance    double precision not null,
  last_access   bigint not null,
  kind          memory_kind not null,
  data          jsonb not null,
  created_at    timestamptz not null default now()
);
create index on public.memories (player_id);
create index on public.memories (player_id, kind);
create index on public.memories (embedding_id);

-- ---------------------------------------------------------------------------
-- embeddings_cache: text-hash → embedding cache (saves LLM cost).
-- ---------------------------------------------------------------------------
create table public.embeddings_cache (
  text_hash  bytea primary key,
  embedding  vector(1024) not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- match_memories: vector search RPC. The Worker calls this from the agent
-- operations to retrieve memories ranked by cosine similarity.
-- ---------------------------------------------------------------------------
create or replace function public.match_memories(
  p_player_id   text,
  p_embedding   vector(1024),
  p_limit       int
)
returns table (
  embedding_id uuid,
  score        double precision
)
language sql stable as $$
  select
    e.id  as embedding_id,
    1 - (e.embedding <=> p_embedding) as score
  from public.memory_embeddings e
  where e.player_id = p_player_id
  order by e.embedding <=> p_embedding asc
  limit p_limit;
$$;

-- ---------------------------------------------------------------------------
-- Realtime publication: the frontend subscribes to messages and world_status
-- via Supabase Realtime. Worlds themselves are streamed via the DO WebSocket.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.world_status;
alter publication supabase_realtime add table public.player_descriptions;
alter publication supabase_realtime add table public.agent_descriptions;

-- ---------------------------------------------------------------------------
-- Row-level security. We keep things simple: server-side code uses the
-- service-role key (bypasses RLS), the browser uses the anon key + read-only
-- policies on the tables it needs to subscribe to.
-- ---------------------------------------------------------------------------
alter table public.worlds                  enable row level security;
alter table public.world_status            enable row level security;
alter table public.maps                    enable row level security;
alter table public.player_descriptions     enable row level security;
alter table public.agent_descriptions      enable row level security;
alter table public.archived_players        enable row level security;
alter table public.archived_conversations  enable row level security;
alter table public.archived_agents         enable row level security;
alter table public.participated_together   enable row level security;
alter table public.inputs                  enable row level security;
alter table public.messages                enable row level security;
alter table public.music                   enable row level security;
alter table public.memories                enable row level security;
alter table public.memory_embeddings       enable row level security;
alter table public.embeddings_cache        enable row level security;
alter table public.engines                 enable row level security;

-- Public read for the things the browser needs.
create policy "anon read worlds"           on public.worlds                  for select using (true);
create policy "anon read world_status"     on public.world_status            for select using (true);
create policy "anon read maps"             on public.maps                    for select using (true);
create policy "anon read player_desc"      on public.player_descriptions     for select using (true);
create policy "anon read agent_desc"       on public.agent_descriptions      for select using (true);
create policy "anon read archived_conv"    on public.archived_conversations  for select using (true);
create policy "anon read participated"     on public.participated_together   for select using (true);
create policy "anon read messages"         on public.messages                for select using (true);
create policy "anon read music"            on public.music                   for select using (true);
