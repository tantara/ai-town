'use client';

import { PublicEnvKey } from '@/lib/env';

export default function MissingEnvScreen({ missing }: { missing: PublicEnvKey[] }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-brown-900 p-6 text-brown-100">
      <div className="max-w-xl rounded-lg border border-brown-700 bg-brown-800 p-8 shadow-2xl">
        <h1 className="mb-4 font-display text-4xl">AI Zoo is misconfigured</h1>
        <p className="mb-4">
          The frontend is missing required environment variables. Set them in your deployment
          (Vercel project settings, or <code>.env.local</code> for local development) and reload.
        </p>
        <ul className="mb-4 list-disc space-y-1 pl-6 font-mono text-sm">
          {missing.map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ul>
        <p className="text-sm text-brown-300">
          See <code>.env.example</code> in the repo for the full list.
        </p>
      </div>
    </main>
  );
}
