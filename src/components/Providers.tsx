'use client';

import { ReactNode } from 'react';
import { SessionProvider } from 'next-auth/react';

// We no longer wrap children in a Convex provider; data fetching is now done
// per-hook against Supabase + the Worker WebSocket.
export default function Providers({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
