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

function GameStatusFrame({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w grid lg:grow max-w-[1400px] min-h-[480px] game-frame">
      <div className="flex flex-col items-center justify-center gap-2 bg-brown-900 p-8 text-center text-brown-100">
        <h2 className="font-display text-3xl">{title}</h2>
        {children}
      </div>
    </div>
  );
}

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

  if (worldStatus === undefined) {
    return <GameStatusFrame title="Loading the zoo…" />;
  }
  if (!worldId || !engineId) {
    return (
      <GameStatusFrame title="The zoo isn't seeded yet">
        <p className="max-w-md text-base text-brown-300">
          No default world found in Supabase. Run{' '}
          <code className="rounded bg-brown-800 px-1">pnpm seed</code> against your Supabase
          project to create one, then reload this page.
        </p>
      </GameStatusFrame>
    );
  }
  if (!game) {
    return (
      <GameStatusFrame title="Connecting to the zoo…">
        <p className="max-w-md text-base text-brown-300">
          Waiting for the first world snapshot from the game server. If this persists, check that
          your Cloudflare Worker is reachable at{' '}
          <code className="rounded bg-brown-800 px-1">NEXT_PUBLIC_WORKER_URL</code>.
        </p>
      </GameStatusFrame>
    );
  }
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
