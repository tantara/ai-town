// Agent long-term memory: stores summaries with embeddings, retrieves with
// pgvector. This is a straight port of convex/agent/memory.ts adapted to use
// Postgres rather than Convex's vectorSearch.

import type { DB } from '../db/supabase';
import type { Env } from '../env';
import { chatCompletion, fetchEmbedding, LLMMessage } from '../util/llm';
import { listMessages } from '../db/repository';
import { asyncMap } from '../util/asyncMap';

export const MEMORY_ACCESS_THROTTLE = 300_000;
const MEMORY_OVERFETCH = 10;

export type Memory = {
  id: string;
  player_id: string;
  description: string;
  embedding_id: string;
  importance: number;
  last_access: number;
  kind: 'relationship' | 'conversation' | 'reflection';
  data: any;
};

export async function rememberConversation(
  env: Env,
  db: DB,
  worldId: string,
  agentId: string,
  playerId: string,
  conversationId: string,
) {
  const data = await loadConversation(db, worldId, playerId, conversationId);
  const messages = await listMessages(db, worldId, conversationId);
  if (!messages.length) return;

  const llmMessages: LLMMessage[] = [
    {
      role: 'user',
      content: `You are ${data.player.name}, and you just finished a conversation with ${data.otherPlayer.name}. Summarize the conversation from ${data.player.name}'s perspective in first person, and add whether you liked or disliked the interaction.`,
    },
  ];
  const authors = new Set<string>();
  for (const m of messages) {
    const author = m.author === data.player.id ? data.player : data.otherPlayer;
    authors.add(author.id);
    const recipient = m.author === data.player.id ? data.otherPlayer : data.player;
    llmMessages.push({
      role: 'user',
      content: `${author.name} to ${recipient.name}: ${m.text}`,
    });
  }
  llmMessages.push({ role: 'user', content: 'Summary:' });

  const { content } = await chatCompletion(env, { messages: llmMessages, max_tokens: 500 });
  const description = `Conversation with ${data.otherPlayer.name} at ${new Date(
    data.conversation.created,
  ).toLocaleString()}: ${content}`;
  const importance = await calculateImportance(env, description);
  const { embedding } = await fetchEmbedding(env, description);
  authors.delete(data.player.id);

  const { data: emb, error: e1 } = await db
    .from('memory_embeddings')
    .insert({ player_id: playerId, embedding: embedding as any })
    .select('id')
    .single();
  if (e1) throw e1;
  const { error: e2 } = await db.from('memories').insert({
    player_id: playerId,
    description,
    embedding_id: emb.id,
    importance,
    last_access: Date.now(),
    kind: 'conversation',
    data: { conversationId, playerIds: [...authors] },
  });
  if (e2) throw e2;
  return description;
}

async function loadConversation(db: DB, worldId: string, playerId: string, conversationId: string) {
  const { data: world, error: ew } = await db.from('worlds').select('state').eq('id', worldId).single();
  if (ew) throw ew;
  const state = world.state as any;
  const player = state.players.find((p: any) => p.id === playerId);
  const { data: pd } = await db
    .from('player_descriptions')
    .select('*')
    .eq('world_id', worldId)
    .eq('player_id', playerId)
    .single();
  const { data: conv } = await db
    .from('archived_conversations')
    .select('*')
    .eq('world_id', worldId)
    .eq('conversation_id', conversationId)
    .maybeSingle();
  const { data: edge } = await db
    .from('participated_together')
    .select('player2')
    .eq('world_id', worldId)
    .eq('player1', playerId)
    .eq('conversation_id', conversationId)
    .maybeSingle();
  const otherPlayerId = edge?.player2;
  const otherInWorld = state.players.find((p: any) => p.id === otherPlayerId);
  const { data: opd } = await db
    .from('player_descriptions')
    .select('*')
    .eq('world_id', worldId)
    .eq('player_id', otherPlayerId)
    .single();
  return {
    player: { id: playerId, name: pd!.name, ...player },
    otherPlayer: { id: otherPlayerId, name: opd!.name, ...(otherInWorld ?? {}) },
    conversation: { id: conversationId, created: Number(conv?.created ?? 0) },
  };
}

export async function searchMemories(
  db: DB,
  playerId: string,
  searchEmbedding: number[],
  n = 3,
): Promise<Memory[]> {
  const { data, error } = await db.rpc('match_memories', {
    p_player_id: playerId,
    p_embedding: searchEmbedding as any,
    p_limit: n * MEMORY_OVERFETCH,
  });
  if (error) throw error;
  const candidates = (data ?? []) as { embedding_id: string; score: number }[];
  if (!candidates.length) return [];

  const memories = (await asyncMap(candidates, async (c) => {
    const { data: m } = await db
      .from('memories')
      .select('*')
      .eq('embedding_id', c.embedding_id)
      .maybeSingle();
    return m ? ({ ...m, _score: c.score } as Memory & { _score: number }) : null;
  })).filter((m): m is Memory & { _score: number } => !!m);

  const ts = Date.now();
  const recencyScore = memories.map((m) => 0.99 ** Math.floor((ts - m.last_access) / 3_600_000));
  const range = (xs: number[]) => [Math.min(...xs), Math.max(...xs)] as const;
  const norm = (v: number, [a, b]: readonly [number, number]) => (b === a ? 0 : (v - a) / (b - a));
  const relevance = range(memories.map((m) => m._score));
  const importance = range(memories.map((m) => m.importance));
  const recency = range(recencyScore);
  const scored = memories
    .map((m, idx) => ({
      memory: m,
      score:
        norm(m._score, relevance) +
        norm(m.importance, importance) +
        norm(recencyScore[idx], recency),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);

  // Throttled lastAccess update.
  for (const { memory } of scored) {
    if (memory.last_access < ts - MEMORY_ACCESS_THROTTLE) {
      await db.from('memories').update({ last_access: ts }).eq('id', memory.id);
    }
  }
  return scored.map((s) => s.memory);
}

async function calculateImportance(env: Env, description: string) {
  const { content } = await chatCompletion(env, {
    messages: [
      {
        role: 'user',
        content: `On the scale of 0 to 9, where 0 is purely mundane and 9 is extremely poignant, rate the following memory. Respond with a number only.\nMemory: ${description}\nAnswer:`,
      },
    ],
    temperature: 0,
    max_tokens: 1,
  });
  const parsed = parseFloat(content) || +(content.match(/\d+/)?.[0] ?? '5');
  return Number.isNaN(parsed) ? 5 : parsed;
}
