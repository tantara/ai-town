'use client';

import { useEffect, useState } from 'react';
import { getGameClient, WorldSnapshot } from '@/lib/game-client';

// Replaces `useQuery(api.world.worldState, { worldId })`. Subscribes to the
// world's Durable Object via WebSocket and re-renders on each snapshot.
export function useWorldState(worldId: string | undefined): WorldSnapshot | undefined {
  const [snapshot, setSnapshot] = useState<WorldSnapshot | undefined>(undefined);
  useEffect(() => {
    if (!worldId) return;
    const client = getGameClient(worldId);
    return client.subscribe(setSnapshot);
  }, [worldId]);
  return snapshot;
}
