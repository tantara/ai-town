// Implements the agent operations originally in convex/aiWorld/agentOperations.ts.
// Each operation runs in the Worker, then submits a follow-up input back to
// the Durable Object via an HTTP POST.

import type { DB } from '../../../shared/db/supabase';
import type { Env } from '../env';
import { rememberConversation } from './memory';
import {
  startConversationMessage,
  continueConversationMessage,
  leaveConversationMessage,
} from './conversation';
import { ACTIVITIES, ACTIVITY_COOLDOWN, CONVERSATION_COOLDOWN, PLAYER_CONVERSATION_COOLDOWN } from '../../../shared/aiWorld/constants';
import { distance } from '../../../shared/util/geometry';
import { sleep } from '../../../shared/util/sleep';
import * as repo from '../../../shared/db/repository';

async function sendInput(env: Env, worldId: string, name: string, args: any) {
  // Submit input to the world's Durable Object.
  const id = env.WORLD.idFromName(worldId);
  const stub = env.WORLD.get(id);
  await stub.fetch(`https://world/sendInput?worldId=${worldId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, args }),
  });
}

export async function agentRememberConversation(env: Env, db: DB, args: any) {
  await rememberConversation(env, db, args.worldId, args.agentId, args.playerId, args.conversationId);
  await sleep(Math.random() * 1000);
  await sendInput(env, args.worldId, 'finishRememberConversation', {
    agentId: args.agentId,
    operationId: args.operationId,
  });
}

export async function agentGenerateMessage(env: Env, db: DB, args: any) {
  let fn;
  if (args.type === 'start') fn = startConversationMessage;
  else if (args.type === 'continue') fn = continueConversationMessage;
  else if (args.type === 'leave') fn = leaveConversationMessage;
  else throw new Error(`Unknown message type ${args.type}`);

  const text = await fn(env, db, args.worldId, args.conversationId, args.playerId, args.otherPlayerId);

  await repo.insertMessage(db, args.worldId, args.conversationId, args.messageUuid, args.playerId, text);
  await sendInput(env, args.worldId, 'agentFinishSendingMessage', {
    conversationId: args.conversationId,
    agentId: args.agentId,
    timestamp: Date.now(),
    leaveConversation: args.type === 'leave',
    operationId: args.operationId,
  });
}

export async function agentDoSomething(env: Env, db: DB, args: any) {
  const { player, agent, map, otherFreePlayers, worldId, operationId } = args;
  const now = Date.now();
  const justLeftConversation =
    agent.lastConversation && now < agent.lastConversation + CONVERSATION_COOLDOWN;
  const recentlyAttemptedInvite =
    agent.lastInviteAttempt && now < agent.lastInviteAttempt + CONVERSATION_COOLDOWN;
  const recentActivity = player.activity && now < player.activity.until + ACTIVITY_COOLDOWN;

  if (!player.pathfinding) {
    if (recentActivity || justLeftConversation) {
      await sleep(Math.random() * 1000);
      await sendInput(env, worldId, 'finishDoSomething', {
        operationId,
        agentId: agent.id,
        destination: wanderDestination(map),
      });
      return;
    }
    const activity = ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)];
    await sleep(Math.random() * 1000);
    await sendInput(env, worldId, 'finishDoSomething', {
      operationId,
      agentId: agent.id,
      activity: { description: activity.description, emoji: activity.emoji, until: Date.now() + activity.duration },
    });
    return;
  }

  const invitee =
    justLeftConversation || recentlyAttemptedInvite
      ? undefined
      : await findConversationCandidate(db, now, worldId, player, otherFreePlayers);

  await sleep(Math.random() * 1000);
  await sendInput(env, worldId, 'finishDoSomething', {
    operationId,
    agentId: agent.id,
    invitee,
  });
}

async function findConversationCandidate(
  db: DB,
  now: number,
  worldId: string,
  player: any,
  otherFreePlayers: any[],
) {
  const candidates: { id: string; position: any }[] = [];
  for (const other of otherFreePlayers) {
    const { data: edge } = await db
      .from('participated_together')
      .select('ended')
      .eq('world_id', worldId)
      .eq('player1', player.id)
      .eq('player2', other.id)
      .order('ended', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (edge && now < Number(edge.ended) + PLAYER_CONVERSATION_COOLDOWN) continue;
    candidates.push({ id: other.id, position: other.position });
  }
  candidates.sort((a, b) => distance(a.position, player.position) - distance(b.position, player.position));
  return candidates[0]?.id;
}

function wanderDestination(map: { width: number; height: number }) {
  return {
    x: 1 + Math.floor(Math.random() * (map.width - 2)),
    y: 1 + Math.floor(Math.random() * (map.height - 2)),
  };
}

export const operations: Record<string, (env: Env, db: DB, args: any) => Promise<void>> = {
  agentRememberConversation,
  agentGenerateMessage,
  agentDoSomething,
};
