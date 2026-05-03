// Frontend env validation. The Game UI is useless without these — surface
// missing values explicitly instead of letting the page render and then fail
// with a blank canvas / cryptic WebSocket error.

const REQUIRED_PUBLIC_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_WORKER_URL',
] as const;

export type PublicEnvKey = (typeof REQUIRED_PUBLIC_ENV)[number];

export function missingPublicEnv(): PublicEnvKey[] {
  return REQUIRED_PUBLIC_ENV.filter((k) => !process.env[k]);
}

export function publicEnv(key: PublicEnvKey): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} must be set in the deployment environment.`);
  return v;
}
