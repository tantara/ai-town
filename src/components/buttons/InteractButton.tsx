'use client';

import { useCallback } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { toast } from 'sonner';

import Button from './Button';
import { useServerGame } from '../../hooks/serverGame';
import { useDefaultWorldStatus } from '../../hooks/useWorldStatus';
import { useUserStatus } from '../../hooks/useUserStatus';
import { getGameClient } from '@/lib/game-client';
import { characters } from '../../../data/characters';

export default function InteractButton() {
  const { status: authStatus, data: session } = useSession();
  const isAuthenticated = authStatus === 'authenticated';
  const tokenIdentifier =
    (session?.user as { id?: string } | undefined)?.id ??
    session?.user?.email ??
    session?.user?.name ??
    undefined;
  const displayName = session?.user?.name ?? undefined;

  const worldStatus = useDefaultWorldStatus();
  const worldId = worldStatus?.world_id;
  const game = useServerGame(worldId);
  const humanTokenIdentifier = useUserStatus(tokenIdentifier);
  const userPlayerId =
    game && [...game.world.players.values()].find((p) => p.human === humanTokenIdentifier)?.id;
  const isPlaying = !!userPlayerId;

  const join = useCallback(
    async (worldId: string) => {
      const name = displayName ?? humanTokenIdentifier;
      const character = characters[Math.floor(Math.random() * characters.length)].name;
      try {
        const client = getGameClient(worldId);
        const inputId = await client.sendInput('join', {
          name,
          character,
          description: `${name} is a human visitor exploring the AI Zoo.`,
          tokenIdentifier: humanTokenIdentifier,
        });
        await client.waitForInput(inputId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    },
    [displayName, humanTokenIdentifier],
  );

  const leave = useCallback(
    async (worldId: string) => {
      if (!userPlayerId) return;
      const client = getGameClient(worldId);
      await client.sendInput('leave', { playerId: userPlayerId });
    },
    [userPlayerId],
  );

  const joinOrLeaveGame = () => {
    if (!worldId || game === undefined) return;
    if (!isAuthenticated) {
      void signIn(undefined, { callbackUrl: '/' });
      return;
    }
    if (isPlaying) void leave(worldId);
    else void join(worldId);
  };

  return (
    <Button imgUrl="/assets/interact.svg" onClick={joinOrLeaveGame}>
      {!isAuthenticated ? 'Log in' : isPlaying ? 'Leave' : 'Interact'}
    </Button>
  );
}
