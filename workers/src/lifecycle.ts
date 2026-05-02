// Lifecycle helpers for /freeze and /resume. Extracted into a separate module
// so they can be unit-tested without standing up the full Worker entrypoint.

import type { DB } from '../../shared/db/supabase';
import { setWorldStatus } from '../../shared/db/repository';

export interface DOStubLike {
  fetch(url: string, init?: RequestInit): Promise<Response>;
}

export async function freezeWorld(db: DB, worldId: string): Promise<{ status: 'stoppedByDeveloper' }> {
  await setWorldStatus(db, worldId, 'stoppedByDeveloper');
  return { status: 'stoppedByDeveloper' };
}

export async function resumeWorld(
  db: DB,
  stub: DOStubLike,
  worldId: string,
): Promise<{ status: 'running' }> {
  await setWorldStatus(db, worldId, 'running');
  // Kick the DO so it picks up the new status and reschedules its alarm.
  await stub.fetch(`https://world/start?worldId=${worldId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  return { status: 'running' };
}
