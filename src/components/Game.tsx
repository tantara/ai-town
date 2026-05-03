'use client';

import { useRef, useState } from 'react';
import PixiGame from './PixiGame';

import { useElementSize } from 'usehooks-ts';
import { Stage } from '@pixi/react';
import PlayerDetails from './PlayerDetails';
import { useWorldHeartbeat } from '../hooks/useWorldHeartbeat';
import { useHistoricalTime } from '../hooks/useHistoricalTime';
import { DebugTimeManager } from './DebugTimeManager';
import { GameId } from '../../shared/aiZoo/ids';
import { useServerGame } from '../hooks/serverGame';
import { useDefaultWorldStatus } from '../hooks/useWorldStatus';
import { useWorldState } from '../hooks/useWorldState';

export const SHOW_DEBUG_UI = !!process.env.NEXT_PUBLIC_SHOW_DEBUG_UI;

export default function Game() {
  const [selectedElement, setSelectedElement] = useState<{
    kind: 'player';
    id: GameId<'players'>;
  }>();
  const [gameWrapperRef, { width, height }] = useElementSize();

  const worldStatus = useDefaultWorldStatus();
  const worldId = worldStatus?.world_id;
  const engineId = worldStatus?.engine_id;

  const game = useServerGame(worldId);
  useWorldHeartbeat();

  const worldState = useWorldState(worldId);
  // useHistoricalTime expects an object shaped like Convex's Doc<'engines'> —
  // our snapshot already exposes currentTime / lastStepTs so this works.
  const { historicalTime, timeManager } = useHistoricalTime(worldState?.engine as any);

  const scrollViewRef = useRef<HTMLDivElement>(null);

  if (!worldId || !engineId || !game) return null;
  return (
    <>
      {SHOW_DEBUG_UI && <DebugTimeManager timeManager={timeManager} width={200} height={100} />}
      <div className="mx-auto w-full max-w grid grid-rows-[240px_1fr] lg:grid-rows-[1fr] lg:grid-cols-[1fr_auto] lg:grow max-w-[1400px] min-h-[480px] game-frame">
        <div className="relative overflow-hidden bg-brown-900" ref={gameWrapperRef}>
          <div className="absolute inset-0">
            <div className="container">
              <Stage width={width} height={height} options={{ backgroundColor: 0x7ab5ff }}>
                <PixiGame
                  game={game}
                  worldId={worldId}
                  engineId={engineId}
                  width={width}
                  height={height}
                  historicalTime={historicalTime}
                  setSelectedElement={setSelectedElement}
                />
              </Stage>
            </div>
          </div>
        </div>
        <div
          className="flex flex-col overflow-y-auto shrink-0 px-4 py-6 sm:px-6 lg:w-96 xl:pr-6 border-t-8 sm:border-t-0 sm:border-l-8 border-brown-900 bg-brown-800 text-brown-100"
          ref={scrollViewRef}
        >
          <PlayerDetails
            worldId={worldId}
            engineId={engineId}
            game={game}
            playerId={selectedElement?.id}
            setSelectedElement={setSelectedElement}
            scrollViewRef={scrollViewRef}
          />
        </div>
      </div>
    </>
  );
}
