'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type GameDescriptions = {
  playerDescriptions: Array<{ playerId: string; name: string; description: string; character: string }>;
  agentDescriptions: Array<{ agentId: string; identity: string; plan: string }>;
  worldMap: any;
};

// Fetches map + agent/player descriptions from Supabase and subscribes to
// changes via Realtime. Replaces `useQuery(api.world.gameDescriptions, ...)`.
export function useGameDescriptions(worldId: string | undefined): GameDescriptions | undefined {
  const [data, setData] = useState<GameDescriptions | undefined>(undefined);
  useEffect(() => {
    if (!worldId) return;
    const sb = supabase();
    let cancelled = false;

    const reload = async () => {
      const [pds, ads, mapRow] = await Promise.all([
        sb.from('player_descriptions').select('*').eq('world_id', worldId),
        sb.from('agent_descriptions').select('*').eq('world_id', worldId),
        sb.from('maps').select('*').eq('world_id', worldId).maybeSingle(),
      ]);
      if (cancelled || !mapRow.data) return;
      const m: any = mapRow.data;
      setData({
        playerDescriptions: (pds.data ?? []).map((r: any) => ({
          playerId: r.player_id,
          name: r.name,
          description: r.description,
          character: r.character,
        })),
        agentDescriptions: (ads.data ?? []).map((r: any) => ({
          agentId: r.agent_id,
          identity: r.identity,
          plan: r.plan,
        })),
        worldMap: {
          width: m.width,
          height: m.height,
          tileSetUrl: m.tile_set_url,
          tileSetDimX: m.tile_set_dim_x,
          tileSetDimY: m.tile_set_dim_y,
          tileDim: m.tile_dim,
          bgTiles: m.bg_tiles,
          objectTiles: m.object_tiles,
          animatedSprites: m.animated_sprites,
        },
      });
    };

    reload();
    const channel = sb
      .channel(`gd_${worldId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'player_descriptions', filter: `world_id=eq.${worldId}` },
        reload,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agent_descriptions', filter: `world_id=eq.${worldId}` },
        reload,
      )
      .subscribe();
    return () => {
      cancelled = true;
      sb.removeChannel(channel);
    };
  }, [worldId]);
  return data;
}
