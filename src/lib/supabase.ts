'use client';

import { createClient } from '@supabase/supabase-js';
import { publicEnv } from './env';

// Browser Supabase client. Uses the public anon key, so RLS policies in
// supabase/migrations/00000000000001_init.sql control what the browser can
// read. The browser never writes to Postgres directly — all writes go through
// the Worker / Durable Object.
let _client: ReturnType<typeof createClient> | undefined;
export function supabase() {
  if (_client) return _client;
  _client = createClient(
    publicEnv('NEXT_PUBLIC_SUPABASE_URL'),
    publicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { auth: { persistSession: false } },
  );
  return _client;
}

export const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL ?? '';
