'use client';

import { supabase, WORKER_URL } from '@/lib/supabase';
import { getGameClient } from '@/lib/game-client';

// Writes a chat message and notifies the engine that the human finished
// sending. Replaces the Convex `api.messages.writeMessage` mutation.
export function useWriteMessage() {
  return async (args: {
    worldId: string;
    conversationId: string;
    messageUuid: string;
    playerId: string;
    text: string;
  }) => {
    if (!WORKER_URL) {
      throw new Error('NEXT_PUBLIC_WORKER_URL must be set to write messages.');
    }
    // Insert via the Worker so the server enforces the same invariants the
    // Convex mutation did (single source of truth for messages + finish input).
    // For brevity we POST a small RPC route — but to keep the surface lean,
    // we insert directly with the anon client and fire `finishSendingMessage`
    // as a normal input. (RLS lets the anon role insert messages.)
    const sb = supabase();
    const { error } = await sb.from('messages').insert({
      world_id: args.worldId,
      conversation_id: args.conversationId,
      message_uuid: args.messageUuid,
      author: args.playerId,
      text: args.text,
    });
    if (error) throw error;
    const client = getGameClient(args.worldId);
    await client.sendInput('finishSendingMessage', {
      conversationId: args.conversationId,
      playerId: args.playerId,
      timestamp: Date.now(),
    });
  };
}
