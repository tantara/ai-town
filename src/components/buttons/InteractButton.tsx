'use client';

import Button from './Button';
import { toast } from 'react-toastify';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useSession, signIn } from 'next-auth/react';
import { ConvexError } from 'convex/values';
import { Id } from '../../../convex/_generated/dataModel';
import { useCallback } from 'react';
import { waitForInput } from '../../hooks/sendInput';
import { useServerGame } from '../../hooks/serverGame';

export default function InteractButton() {
  const { status: authStatus, data: session } = useSession();
  const isAuthenticated = authStatus === 'authenticated';
  const tokenIdentifier =
    (session?.user as { id?: string } | undefined)?.id ??
    session?.user?.email ??
    session?.user?.name ??
    undefined;
  const displayName = session?.user?.name ?? undefined;

  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const game = useServerGame(worldId);
  const humanTokenIdentifier = useQuery(
    api.world.userStatus,
    worldId ? { worldId, tokenIdentifier } : 'skip',
  );
  const userPlayerId =
    game && [...game.world.players.values()].find((p) => p.human === humanTokenIdentifier)?.id;
  const join = useMutation(api.world.joinWorld);
  const leave = useMutation(api.world.leaveWorld);
  const isPlaying = !!userPlayerId;

  const convex = useConvex();
  const joinInput = useCallback(
    async (worldId: Id<'worlds'>) => {
      let inputId;
      try {
        inputId = await join({ worldId, tokenIdentifier, displayName });
      } catch (e: any) {
        if (e instanceof ConvexError) {
          toast.error(e.data);
          return;
        }
        throw e;
      }
      try {
        await waitForInput(convex, inputId);
      } catch (e: any) {
        toast.error(e.message);
      }
    },
    [convex],
  );

  const joinOrLeaveGame = () => {
    if (!worldId || game === undefined) {
      return;
    }
    if (!isAuthenticated) {
      void signIn(undefined, { callbackUrl: '/' });
      return;
    }
    if (isPlaying) {
      console.log(`Leaving game for player ${userPlayerId}`);
      void leave({ worldId, tokenIdentifier });
    } else {
      console.log(`Joining game`);
      void joinInput(worldId);
    }
  };
  return (
    <Button imgUrl="/assets/interact.svg" onClick={joinOrLeaveGame}>
      {!isAuthenticated ? 'Log in' : isPlaying ? 'Leave' : 'Interact'}
    </Button>
  );
}
