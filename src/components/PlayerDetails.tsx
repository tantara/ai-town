'use client';

import { useQuery } from 'convex/react';
import { useSession } from 'next-auth/react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { SelectElement } from './Player';
import { Messages } from './Messages';
import { toastOnError } from '../toasts';
import { useSendInput } from '../hooks/sendInput';
import { GameId } from '../../convex/aiTown/ids';
import { ServerGame } from '../hooks/serverGame';

type ConversationActionProps = {
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
};

function ConversationAction({ onClick, disabled, children }: ConversationActionProps) {
  return (
    <Button
      variant="game"
      size="game"
      className={cn('mt-6 text-xl cursor-pointer', disabled && 'opacity-50')}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="block w-full bg-clay-700 text-center">
        <span>{children}</span>
      </span>
    </Button>
  );
}

type PlayerDetailsProps = {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  game: ServerGame;
  playerId?: GameId<'players'>;
  setSelectedElement: SelectElement;
  scrollViewRef: React.RefObject<HTMLDivElement>;
};

export default function PlayerDetails({
  worldId,
  engineId,
  game,
  playerId,
  setSelectedElement,
  scrollViewRef,
}: PlayerDetailsProps) {
  const { data: session } = useSession();
  const tokenIdentifier =
    (session?.user as { id?: string } | undefined)?.id ??
    session?.user?.email ??
    session?.user?.name ??
    undefined;
  const humanTokenIdentifier = useQuery(api.world.userStatus, { worldId, tokenIdentifier });

  const players = [...game.world.players.values()];
  const humanPlayer = players.find((p) => p.human === humanTokenIdentifier);
  const humanConversation = humanPlayer ? game.world.playerConversation(humanPlayer) : undefined;
  // Always select the other player if we're in a conversation with them.
  if (humanPlayer && humanConversation) {
    const otherPlayerIds = [...humanConversation.participants.keys()].filter(
      (p) => p !== humanPlayer.id,
    );
    playerId = otherPlayerIds[0];
  }

  const player = playerId && game.world.players.get(playerId);
  const playerConversation = player && game.world.playerConversation(player);

  const previousConversation = useQuery(
    api.world.previousConversation,
    playerId ? { worldId, playerId } : 'skip',
  );

  const playerDescription = playerId && game.playerDescriptions.get(playerId);

  const startConversation = useSendInput(engineId, 'startConversation');
  const acceptInvite = useSendInput(engineId, 'acceptInvite');
  const rejectInvite = useSendInput(engineId, 'rejectInvite');
  const leaveConversation = useSendInput(engineId, 'leaveConversation');

  if (!playerId) {
    return (
      <div className="h-full text-xl flex text-center items-center p-4">
        Click on an agent on the map to see chat history.
      </div>
    );
  }
  if (!player) {
    return null;
  }
  const isMe = humanPlayer && player.id === humanPlayer.id;
  const canInvite = !isMe && !playerConversation && humanPlayer && !humanConversation;
  const sameConversation =
    !isMe &&
    humanPlayer &&
    humanConversation &&
    playerConversation &&
    humanConversation.id === playerConversation.id;

  const humanStatus =
    humanPlayer && humanConversation && humanConversation.participants.get(humanPlayer.id)?.status;
  const playerStatus = playerConversation && playerConversation.participants.get(playerId)?.status;

  const haveInvite = sameConversation && humanStatus?.kind === 'invited';
  const waitingForAccept =
    sameConversation && playerConversation.participants.get(playerId)?.status.kind === 'invited';
  const waitingForNearby =
    sameConversation && playerStatus?.kind === 'walkingOver' && humanStatus?.kind === 'walkingOver';

  const inConversationWithMe =
    sameConversation &&
    playerStatus?.kind === 'participating' &&
    humanStatus?.kind === 'participating';

  const onStartConversation = async () => {
    if (!humanPlayer || !playerId) return;
    await toastOnError(startConversation({ playerId: humanPlayer.id, invitee: playerId }));
  };
  const onAcceptInvite = async () => {
    if (!humanPlayer || !humanConversation || !playerId) return;
    await toastOnError(
      acceptInvite({ playerId: humanPlayer.id, conversationId: humanConversation.id }),
    );
  };
  const onRejectInvite = async () => {
    if (!humanPlayer || !humanConversation) return;
    await toastOnError(
      rejectInvite({ playerId: humanPlayer.id, conversationId: humanConversation.id }),
    );
  };
  const onLeaveConversation = async () => {
    if (!humanPlayer || !inConversationWithMe || !humanConversation) return;
    await toastOnError(
      leaveConversation({ playerId: humanPlayer.id, conversationId: humanConversation.id }),
    );
  };

  return (
    <>
      <div className="flex gap-4">
        <div className="box w-3/4 sm:w-full mr-auto">
          <h2 className="bg-brown-700 p-2 font-display text-2xl sm:text-4xl tracking-wider shadow-solid text-center">
            {playerDescription?.name}
          </h2>
        </div>
        <Button
          variant="game"
          size="game"
          className="text-2xl cursor-pointer"
          onClick={() => setSelectedElement(undefined)}
        >
          <span className="h-full bg-clay-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="w-4 h-4 sm:w-5 sm:h-5" src="/assets/close.svg" alt="close" />
          </span>
        </Button>
      </div>
      {canInvite && (
        <ConversationAction onClick={onStartConversation}>Start conversation</ConversationAction>
      )}
      {waitingForAccept && <ConversationAction disabled>Waiting for accept...</ConversationAction>}
      {waitingForNearby && <ConversationAction disabled>Walking over...</ConversationAction>}
      {inConversationWithMe && (
        <ConversationAction onClick={onLeaveConversation}>Leave conversation</ConversationAction>
      )}
      {haveInvite && (
        <>
          <ConversationAction onClick={onAcceptInvite}>Accept</ConversationAction>
          <ConversationAction onClick={onRejectInvite}>Reject</ConversationAction>
        </>
      )}
      {!playerConversation && player.activity && player.activity.until > Date.now() && (
        <div className="box flex-grow mt-6">
          <h2 className="bg-brown-700 text-base sm:text-lg text-center">
            {player.activity.description}
          </h2>
        </div>
      )}
      <div className="desc my-6">
        <p className="leading-tight -m-4 bg-brown-700 text-base sm:text-sm">
          {!isMe && playerDescription?.description}
          {isMe && <i>This is you!</i>}
          {!isMe && inConversationWithMe && (
            <>
              <br />
              <br />(<i>Conversing with you!</i>)
            </>
          )}
        </p>
      </div>
      {!isMe && playerConversation && playerStatus?.kind === 'participating' && (
        <Messages
          worldId={worldId}
          engineId={engineId}
          inConversationWithMe={inConversationWithMe ?? false}
          conversation={{ kind: 'active', doc: playerConversation }}
          humanPlayer={humanPlayer}
          scrollViewRef={scrollViewRef}
        />
      )}
      {!playerConversation && previousConversation && (
        <>
          <div className="box flex-grow">
            <h2 className="bg-brown-700 text-lg text-center">Previous conversation</h2>
          </div>
          <Messages
            worldId={worldId}
            engineId={engineId}
            inConversationWithMe={false}
            conversation={{ kind: 'archived', doc: previousConversation }}
            humanPlayer={humanPlayer}
            scrollViewRef={scrollViewRef}
          />
        </>
      )}
    </>
  );
}
