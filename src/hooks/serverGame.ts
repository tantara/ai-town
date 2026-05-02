'use client';

import { useMemo } from 'react';
import { GameId } from '../../convex/aiWorld/ids';
import { AgentDescription } from '../../convex/aiWorld/agentDescription';
import { PlayerDescription } from '../../convex/aiWorld/playerDescription';
import { World } from '../../convex/aiWorld/world';
import { WorldMap } from '../../convex/aiWorld/worldMap';
import { parseMap } from '../../convex/util/object';
import { useWorldState } from './useWorldState';
import { useGameDescriptions } from './useGameDescriptions';

export type ServerGame = {
  world: World;
  playerDescriptions: Map<GameId<'players'>, PlayerDescription>;
  agentDescriptions: Map<GameId<'agents'>, AgentDescription>;
  worldMap: WorldMap;
};

// Combines a live world snapshot (from the Worker WebSocket) with map +
// description data (from Supabase) to produce the same `ServerGame` shape the
// existing components expect.
export function useServerGame(worldId: string | undefined): ServerGame | undefined {
  const snapshot = useWorldState(worldId);
  const descriptions = useGameDescriptions(worldId);
  return useMemo(() => {
    if (!snapshot || !descriptions) return undefined;
    return {
      world: new World(snapshot.world),
      agentDescriptions: parseMap(
        descriptions.agentDescriptions as any,
        AgentDescription,
        (a) => a.agentId,
      ),
      playerDescriptions: parseMap(
        descriptions.playerDescriptions as any,
        PlayerDescription,
        (p) => p.playerId,
      ),
      worldMap: new WorldMap(descriptions.worldMap),
    };
  }, [snapshot, descriptions]);
}
