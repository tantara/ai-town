'use client';

import { useEffect } from 'react';
import { WORLD_HEARTBEAT_INTERVAL } from '../../convex/constants';
import { useDefaultWorldStatus } from './useWorldStatus';
import { WORKER_URL } from '@/lib/supabase';

// Pings the Worker so it bumps `last_viewed` on the world_status row. The
// Worker's DO uses that to decide whether to keep ticking.
export function useWorldHeartbeat() {
  const status = useDefaultWorldStatus();
  const worldId = status?.world_id;

  useEffect(() => {
    if (!worldId) return;
    const beat = () => {
      if (!status) return;
      if (Date.now() - WORLD_HEARTBEAT_INTERVAL / 2 < Number(status.last_viewed)) return;
      void fetch(`${WORKER_URL}/world/${worldId}/heartbeat`, { method: 'POST' });
    };
    beat();
    const id = setInterval(beat, WORLD_HEARTBEAT_INTERVAL);
    return () => clearInterval(id);
  }, [worldId]);
}
