'use client';

import { signIn } from 'next-auth/react';

import { Button } from '@/components/ui/button';

export default function LoginButton() {
  return (
    <Button
      variant="game"
      size="game"
      onClick={() => signIn(undefined, { callbackUrl: '/' })}
    >
      <span className="inline-block bg-clay-700">
        <span>Log in</span>
      </span>
    </Button>
  );
}
