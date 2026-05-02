'use client';

// Replaces `useQuery(api.world.userStatus, { worldId, tokenIdentifier })`.
// In the original, this just echoed back the token identifier or a default,
// so we keep the same shape — no DB roundtrip needed.
export function useUserStatus(tokenIdentifier?: string): string {
  return tokenIdentifier ?? 'Me';
}
