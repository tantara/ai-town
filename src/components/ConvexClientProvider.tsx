'use client';

import { ReactNode, useMemo } from 'react';
import { ConvexReactClient, ConvexProvider } from 'convex/react';

function convexUrl(): string {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error("Couldn't find the Convex deployment URL (NEXT_PUBLIC_CONVEX_URL).");
  }
  return url;
}

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  const convex = useMemo(
    () => new ConvexReactClient(convexUrl(), { unsavedChangesWarning: false }),
    [],
  );

  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
