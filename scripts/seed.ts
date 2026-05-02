// Seeds Supabase with the default world, map, and agent descriptions.
// Run with: `npm run seed` (after `next build`-style env loading).
//
// Mirrors what convex/init.ts used to do: create the engine, world,
// world_status, map, and queue createAgent inputs.

import { createClient } from '@supabase/supabase-js';
import * as map from '../data/gentle.js';
import { Descriptions } from '../data/characters';

async function main() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.');
  }
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Skip if a default world already exists.
  const { data: existing } = await db
    .from('world_status')
    .select('world_id')
    .eq('is_default', true)
    .maybeSingle();
  if (existing) {
    console.log(`Default world already exists: ${existing.world_id}`);
    return;
  }

  // Engine + world + status.
  const { data: engine } = await db
    .from('engines')
    .insert({ current_time_ms: Date.now(), generation_number: 0, running: true })
    .select()
    .single();
  const { data: world } = await db
    .from('worlds')
    .insert({ state: { nextId: 0, players: [], conversations: [], agents: [] } })
    .select()
    .single();
  await db.from('world_status').insert({
    world_id: world!.id,
    engine_id: engine!.id,
    is_default: true,
    last_viewed: Date.now(),
    status: 'running',
  });

  // Map.
  await db.from('maps').insert({
    world_id: world!.id,
    width: (map as any).mapwidth,
    height: (map as any).mapheight,
    tile_set_url: (map as any).tilesetpath,
    tile_set_dim_x: (map as any).tilesetpxw,
    tile_set_dim_y: (map as any).tilesetpxh,
    tile_dim: (map as any).tiledim,
    bg_tiles: (map as any).bgtiles,
    object_tiles: (map as any).objmap,
    animated_sprites: (map as any).animatedsprites,
  });

  // Queue createAgent inputs. The DO's tick loop will pick these up and create
  // the agents, just like Convex's `insertInput(..., 'createAgent', ...)`.
  const rows = Descriptions.map((d, i) => ({
    engine_id: engine!.id,
    number: i,
    name: 'createAgent',
    args: { name: d.name, character: d.character, identity: d.identity, plan: d.plan },
    received: Date.now(),
  }));
  if (rows.length) await db.from('inputs').insert(rows);

  console.log(`Seeded world ${world!.id} with ${rows.length} agents queued.`);

  // Kick the DO so it starts ticking immediately (otherwise the first tick
  // waits until a client connects).
  if (process.env.WORKER_URL) {
    const resp = await fetch(`${process.env.WORKER_URL}/world/${world!.id}/start`, {
      method: 'POST',
    });
    console.log(`Worker /start → ${resp.status}`);
  } else {
    console.log('Set WORKER_URL to auto-start the DO. Otherwise it starts on first connection.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
