'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Replaces `useQuery(api.world.previousConversation, ...)`. Walks the
// participatedTogether edges from newest to oldest to find a conversation
// with at least one message.
export function usePreviousConversation(worldId: string | undefined, playerId: string | undefined) {
  const [conv, setConv] = useState<any>(null);

  useEffect(() => {
    if (!worldId || !playerId) {
      setConv(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const sb = supabase();
      const { data: edges } = await sb
        .from('participated_together')
        .select('conversation_id')
        .eq('world_id', worldId)
        .eq('player1', playerId)
        .order('ended', { ascending: false })
        .limit(20);
      for (const e of edges ?? []) {
        const { data } = await sb
          .from('archived_conversations')
          .select('*')
          .eq('world_id', worldId)
          .eq('conversation_id', (e as any).conversation_id)
          .maybeSingle();
        if (data && (data as any).num_messages > 0) {
          if (!cancelled) {
            setConv({
              id: (data as any).conversation_id,
              creator: (data as any).creator,
              created: Number((data as any).created),
              ended: Number((data as any).ended),
              numMessages: (data as any).num_messages,
              participants: (data as any).participants,
              lastMessage: (data as any).last_message,
            });
          }
          return;
        }
      }
      if (!cancelled) setConv(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [worldId, playerId]);

  return conv;
}
