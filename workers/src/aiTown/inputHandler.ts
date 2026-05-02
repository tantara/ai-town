import type { Game } from './game';

// `inputHandler` is now a thin builder — runtime arg validation moved to the
// Worker boundary (Zod). We keep it for the same call shape as the Convex
// version so input files port cleanly.
export function inputHandler<Args, Return>(def: {
  args: Record<string, unknown>; // shape descriptor (kept for parity, unused at runtime)
  handler: (game: Game, now: number, args: Args) => Return;
}) {
  return def;
}
