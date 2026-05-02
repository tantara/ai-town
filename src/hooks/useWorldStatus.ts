'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type WorldStatusRow = {
  world_id: string;
  engine_id: string;
  is_default: boolean;
  last_viewed: number;
  status: 'running' | 'stoppedByDeveloper' | 'inactive';
};

// Fetches the default world's status row and keeps it fresh via Postgres
// realtime. Replaces `useQuery(api.world.defaultWorldStatus)`.
export function useDefaultWorldStatus(): WorldStatusRow | undefined {
  const [row, setRow] = useState<WorldStatusRow | undefined>(undefined);

  useEffect(() => {
    const sb = supabase();
    let cancelled = false;
    (async () => {
      const { data } = await sb.from('world_status').select('*').eq('is_default', true).maybeSingle();
      if (!cancelled && data) setRow(data as unknown as WorldStatusRow);
    })();
    const channel = sb
      .channel('world_status_default')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'world_status' },
        (payload: any) => {
          const next = payload.new as WorldStatusRow | undefined;
          if (next?.is_default) setRow(next);
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      sb.removeChannel(channel);
    };
  }, []);

  return row;
}
