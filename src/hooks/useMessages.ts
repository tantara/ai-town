'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type ChatMessage = {
  _id: string;
  _creationTime: number;
  worldId: string;
  conversationId: string;
  messageUuid: string;
  author: string;
  text: string;
  authorName: string;
};

// Replaces `useQuery(api.messages.listMessages, ...)`. Initial fetch + Postgres
// Realtime subscription on the messages table, filtered by conversation.
export function useMessages(
  worldId: string | undefined,
  conversationId: string | undefined,
): ChatMessage[] | undefined {
  const [rows, setRows] = useState<ChatMessage[] | undefined>(undefined);

  useEffect(() => {
    if (!worldId || !conversationId) return;
    const sb = supabase();
    let cancelled = false;

    const fetchOnce = async () => {
      const [{ data: msgs }, { data: pds }] = await Promise.all([
        sb
          .from('messages')
          .select('*')
          .eq('world_id', worldId)
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true }),
        sb.from('player_descriptions').select('player_id, name').eq('world_id', worldId),
      ]);
      if (cancelled) return;
      const nameByPlayer = new Map<string, string>();
      for (const p of pds ?? []) nameByPlayer.set((p as any).player_id, (p as any).name);
      setRows(
        (msgs ?? []).map((m: any) => ({
          _id: m.id,
          _creationTime: new Date(m.created_at).getTime(),
          worldId: m.world_id,
          conversationId: m.conversation_id,
          messageUuid: m.message_uuid,
          author: m.author,
          text: m.text,
          authorName: nameByPlayer.get(m.author) ?? '?',
        })),
      );
    };

    fetchOnce();
    const channel = sb
      .channel(`msgs_${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => fetchOnce(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      sb.removeChannel(channel);
    };
  }, [worldId, conversationId]);

  return rows;
}
