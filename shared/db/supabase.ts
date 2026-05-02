import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type DB = SupabaseClient;

export interface SupabaseEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

// Service-role client. Only used inside the Worker / DO (never shipped to the
// browser). Bypasses RLS so we can manage all the engine bookkeeping.
export function adminDb(env: SupabaseEnv): DB {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
  });
}
