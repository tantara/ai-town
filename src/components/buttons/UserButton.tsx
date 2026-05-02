'use client';

import { signOut, useSession } from 'next-auth/react';

export default function UserButton() {
  const { data } = useSession();
  const name = data?.user?.name ?? 'You';
  return (
    <button
      className="button text-white shadow-solid"
      onClick={() => signOut({ callbackUrl: '/' })}
      title={`Signed in as ${name}`}
    >
      <div className="inline-block bg-clay-700 px-2">
        <span>{name} · Sign out</span>
      </div>
    </button>
  );
}
