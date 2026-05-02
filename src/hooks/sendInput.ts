'use client';

import { getGameClient } from '@/lib/game-client';

// Drop-in replacement for the previous Convex-backed `useSendInput`. Submits
// an input to the per-world Durable Object and (optionally) waits for the
// engine to process it.
export function useSendInput<Args = any, Return = any>(
  worldId: string | undefined,
  name: string,
): (args: Args) => Promise<Return> {
  return async (args: Args) => {
    if (!worldId) throw new Error('No worldId');
    const client = getGameClient(worldId);
    const inputId = await client.sendInput(name, args);
    return await client.waitForInput(inputId);
  };
}

// Used when fire-and-forget semantics are fine (e.g. `startTyping`).
export function useSendInputFireAndForget<Args = any>(
  worldId: string | undefined,
  name: string,
): (args: Args) => Promise<void> {
  return async (args: Args) => {
    if (!worldId) throw new Error('No worldId');
    const client = getGameClient(worldId);
    await client.sendInput(name, args);
  };
}
