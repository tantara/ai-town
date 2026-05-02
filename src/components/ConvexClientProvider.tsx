'use client';

// Kept as a no-op wrapper so existing imports (`<ConvexClientProvider>`) don't
// break. The new architecture talks directly to Supabase and the Worker, so
// no provider context is needed at the React tree level.

import { ReactNode } from 'react';

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
