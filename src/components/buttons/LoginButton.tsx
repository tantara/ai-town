'use client';

import { signIn } from 'next-auth/react';

export default function LoginButton() {
  return (
    <button
      className="button text-white shadow-solid"
      onClick={() => signIn(undefined, { callbackUrl: '/' })}
    >
      <div className="inline-block bg-clay-700">
        <span>Log in</span>
      </div>
    </button>
  );
}
