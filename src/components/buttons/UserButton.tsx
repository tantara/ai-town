'use client';

import { signOut, useSession } from 'next-auth/react';

import { Button } from '@/components/ui/button';

export default function UserButton() {
  const { data } = useSession();
  const name = data?.user?.name ?? 'You';
  return (
    <Button
      variant="game"
      size="game"
      onClick={() => signOut({ callbackUrl: '/' })}
      title={`Signed in as ${name}`}
    >
      <span className="inline-block bg-clay-700 px-2">
        <span>{name} · Sign out</span>
      </span>
    </Button>
  );
}
