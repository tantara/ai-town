'use client';

import { KeyboardEvent, useRef } from 'react';

import { cn } from '@/lib/utils';
import { MessageRow } from '@/components/ui/message-bubble';
import { useSendInputFireAndForget } from '../hooks/sendInput';
import { useWriteMessage } from '../hooks/useWriteMessage';
import { Player } from '../../convex/aiTown/player';
import { Conversation } from '../../convex/aiTown/conversation';
import { useGameDescriptions } from '../hooks/useGameDescriptions';

type MessageInputProps = {
  worldId: string;
  engineId: string;
  humanPlayer: Player;
  conversation: Conversation;
};

export function MessageInput({ worldId, humanPlayer, conversation }: MessageInputProps) {
  const descriptions = useGameDescriptions(worldId);
  const humanName = descriptions?.playerDescriptions.find((p) => p.playerId === humanPlayer.id)?.name;

  const inputRef = useRef<HTMLParagraphElement>(null);
  const inflightUuid = useRef<string | undefined>(undefined);
  const writeMessage = useWriteMessage();
  const startTyping = useSendInputFireAndForget(worldId, 'startTyping');
  const currentlyTyping = conversation.isTyping;

  const onKeyDown = async (e: KeyboardEvent<HTMLParagraphElement>) => {
    e.stopPropagation();
    if (e.key !== 'Enter') {
      if (currentlyTyping || inflightUuid.current !== undefined) return;
      inflightUuid.current = crypto.randomUUID();
      try {
        await startTyping({
          playerId: humanPlayer.id,
          conversationId: conversation.id,
          messageUuid: inflightUuid.current,
        });
      } finally {
        inflightUuid.current = undefined;
      }
      return;
    }
    e.preventDefault();
    if (!inputRef.current) return;
    const text = inputRef.current.innerText;
    inputRef.current.innerText = '';
    if (!text) return;
    let messageUuid = inflightUuid.current;
    if (currentlyTyping && currentlyTyping.playerId === humanPlayer.id) {
      messageUuid = currentlyTyping.messageUuid;
    }
    messageUuid = messageUuid || crypto.randomUUID();
    await writeMessage({
      worldId,
      playerId: humanPlayer.id,
      conversationId: conversation.id,
      text,
      messageUuid,
    });
  };

  return (
    <MessageRow authorName={humanName}>
      <div className={cn('bubble', 'bubble-mine')}>
        <p
          className="bg-white -mx-3 -my-1"
          ref={inputRef}
          contentEditable
          style={{ outline: 'none' }}
          tabIndex={0}
          // @ts-expect-error: placeholder is read by CSS, not a standard <p> attr.
          placeholder="Type here"
          onKeyDown={onKeyDown}
        />
      </div>
    </MessageRow>
  );
}
