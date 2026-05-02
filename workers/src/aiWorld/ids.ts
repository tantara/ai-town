// Branded GameId<T> helper. Identical to convex/aiWorld/ids.ts but with the
// `convex/values` runtime validators stripped — input validation is handled
// at the Worker boundary with Zod.

const IdShortCodes = { agents: 'a', conversations: 'c', players: 'p', operations: 'o' };
export type IdTypes = keyof typeof IdShortCodes;
export type GameId<T extends IdTypes> = string & { __type: T };

export function parseGameId<T extends IdTypes>(idType: T, gameId: string): GameId<T> {
  const type = gameId[0];
  const match = Object.entries(IdShortCodes).find(([_, value]) => value === type);
  if (!match || match[0] !== idType) throw new Error(`Invalid game ID type: ${type}`);
  // Require an explicit ':<non-negative integer>' suffix. Using parseInt alone
  // would silently accept fractional inputs like 'p:1.5' (parsed as 1).
  if (gameId[1] !== ':' || !/^\d+$/.test(gameId.slice(2))) {
    throw new Error(`Invalid game ID number: ${gameId}`);
  }
  return gameId as GameId<T>;
}

export function allocGameId<T extends IdTypes>(idType: T, idNumber: number): GameId<T> {
  const type = IdShortCodes[idType];
  if (!type) throw new Error(`Invalid game ID type: ${idType}`);
  return `${type}:${idNumber}` as GameId<T>;
}
