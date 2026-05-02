'use client';

import { ReactNode } from 'react';
import { SessionProvider } from 'next-auth/react';
import ConvexClientProvider from './ConvexClientProvider';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ConvexClientProvider>{children}</ConvexClientProvider>
    </SessionProvider>
  );
}
