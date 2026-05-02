import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';

export type DB = SupabaseClient;

// Service-role client. Only used inside the Worker / DO (never shipped to the
// browser). Bypasses RLS so we can manage all the engine bookkeeping.
export function adminDb(env: Env): DB {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
  });
}
