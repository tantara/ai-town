// Builds LLM prompts for agent conversation messages. Port of
// convex/agent/conversation.ts (start/continue/leave variants).

import type { DB } from '../db/supabase';
import type { Env } from '../env';
import { chatCompletion, LLMMessage } from '../util/llm';
import { listMessages } from '../db/repository';
import * as memory from './memory';
import * as embeddingsCache from './embeddingsCache';
import { NUM_MEMORIES_TO_SEARCH } from '../aiTown/constants';

type PromptData = {
  player: { id: string; name: string };
  otherPlayer: { id: string; name: string };
  conversation: { id: string; created: number };
  agent: { identity: string; plan: string } | null;
  otherAgent: { identity: string; plan: string } | null;
  lastConversation: { created: number } | null;
};

async function loadPromptData(
  db: DB,
  worldId: string,
  playerId: string,
  otherPlayerId: string,
  conversationId: string,
): Promise<PromptData> {
  const { data: world } = await db.from('worlds').select('state').eq('id', worldId).single();
  const state = (world!.state as any);
  const conversation = state.conversations.find((c: any) => c.id === conversationId);
  const { data: pd } = await db.from('player_descriptions').select('*').eq('world_id', worldId).eq('player_id', playerId).single();
  const { data: opd } = await db.from('player_descriptions').select('*').eq('world_id', worldId).eq('player_id', otherPlayerId).single();
  const agentRow = state.agents.find((a: any) => a.playerId === playerId);
  const otherAgentRow = state.agents.find((a: any) => a.playerId === otherPlayerId);
  const { data: ad } = agentRow
    ? await db.from('agent_descriptions').select('identity, plan').eq('world_id', worldId).eq('agent_id', agentRow.id).single()
    : { data: null };
  const { data: oad } = otherAgentRow
    ? await db.from('agent_descriptions').select('identity, plan').eq('world_id', worldId).eq('agent_id', otherAgentRow.id).single()
    : { data: null };
  const { data: lastEdge } = await db
    .from('participated_together')
    .select('conversation_id, ended')
    .eq('world_id', worldId)
    .eq('player1', playerId)
    .eq('player2', otherPlayerId)
    .order('ended', { ascending: false })
    .limit(1)
    .maybeSingle();
  let lastConversation: { created: number } | null = null;
  if (lastEdge) {
    const { data: lc } = await db
      .from('archived_conversations')
      .select('created')
      .eq('world_id', worldId)
      .eq('conversation_id', lastEdge.conversation_id)
      .maybeSingle();
    if (lc) lastConversation = { created: Number(lc.created) };
  }
  return {
    player: { id: playerId, name: pd!.name },
    otherPlayer: { id: otherPlayerId, name: opd!.name },
    conversation: { id: conversationId, created: conversation?.created ?? Date.now() },
    agent: ad,
    otherAgent: oad,
    lastConversation,
  };
}

function trimContentPrefix(content: string, prefix: string) {
  return content.startsWith(prefix) ? content.slice(prefix.length).trim() : content;
}

function agentPrompts(otherName: string, agent: any, otherAgent: any) {
  const out: string[] = [];
  if (agent) {
    out.push(`About you: ${agent.identity}`);
    out.push(`Your goals for the conversation: ${agent.plan}`);
  }
  if (otherAgent) out.push(`About ${otherName}: ${otherAgent.identity}`);
  return out;
}

function relatedMemoriesPrompt(memories: { description: string }[]) {
  if (!memories.length) return [];
  return [
    `Here are some related memories in decreasing relevance order:`,
    ...memories.map((m) => ` - ${m.description}`),
  ];
}

function previousConversationPrompt(otherName: string, conv: { created: number } | null) {
  if (!conv) return [];
  const prev = new Date(conv.created);
  return [
    `Last time you chatted with ${otherName} it was ${prev.toLocaleString()}. It's now ${new Date().toLocaleString()}.`,
  ];
}

async function previousMessages(
  db: DB,
  worldId: string,
  player: { id: string; name: string },
  otherPlayer: { id: string; name: string },
  conversationId: string,
): Promise<LLMMessage[]> {
  const msgs = await listMessages(db, worldId, conversationId);
  return msgs.map((m: any) => {
    const author = m.author === player.id ? player : otherPlayer;
    const recipient = m.author === player.id ? otherPlayer : player;
    return { role: 'user' as const, content: `${author.name} to ${recipient.name}: ${m.text}` };
  });
}

function stopWords(otherName: string, name: string) {
  const variants = [`${otherName} to ${name}`];
  return variants.flatMap((s) => [s + ':', s.toLowerCase() + ':']);
}

export async function startConversationMessage(
  env: Env,
  db: DB,
  worldId: string,
  conversationId: string,
  playerId: string,
  otherPlayerId: string,
): Promise<string> {
  const data = await loadPromptData(db, worldId, playerId, otherPlayerId, conversationId);
  const embedding = await embeddingsCache.fetch(
    env,
    db,
    `${data.player.name} is talking to ${data.otherPlayer.name}`,
  );
  const memories = await memory.searchMemories(db, playerId, embedding, NUM_MEMORIES_TO_SEARCH);
  const prompt = [
    `You are ${data.player.name}, and you just started a conversation with ${data.otherPlayer.name}.`,
    ...agentPrompts(data.otherPlayer.name, data.agent, data.otherAgent),
    ...previousConversationPrompt(data.otherPlayer.name, data.lastConversation),
    ...relatedMemoriesPrompt(memories),
  ];
  const lastPrompt = `${data.player.name} to ${data.otherPlayer.name}:`;
  prompt.push(lastPrompt);
  const { content } = await chatCompletion(env, {
    messages: [{ role: 'system', content: prompt.join('\n') }],
    max_tokens: 300,
    stop: stopWords(data.otherPlayer.name, data.player.name),
  });
  return trimContentPrefix(content, lastPrompt);
}

export async function continueConversationMessage(
  env: Env,
  db: DB,
  worldId: string,
  conversationId: string,
  playerId: string,
  otherPlayerId: string,
): Promise<string> {
  const data = await loadPromptData(db, worldId, playerId, otherPlayerId, conversationId);
  const embedding = await embeddingsCache.fetch(
    env,
    db,
    `What do you think about ${data.otherPlayer.name}?`,
  );
  const memories = await memory.searchMemories(db, playerId, embedding, 3);
  const prompt = [
    `You are ${data.player.name}, currently in a conversation with ${data.otherPlayer.name}.`,
    `The conversation started at ${new Date(data.conversation.created).toLocaleString()}. It's now ${new Date().toLocaleString()}.`,
    ...agentPrompts(data.otherPlayer.name, data.agent, data.otherAgent),
    ...relatedMemoriesPrompt(memories),
    `Below is the chat history. DO NOT greet again. Be brief, under 200 characters.`,
  ];
  const messages: LLMMessage[] = [
    { role: 'system', content: prompt.join('\n') },
    ...(await previousMessages(db, worldId, data.player, data.otherPlayer, conversationId)),
    { role: 'user', content: `${data.player.name} to ${data.otherPlayer.name}:` },
  ];
  const { content } = await chatCompletion(env, {
    messages,
    max_tokens: 300,
    stop: stopWords(data.otherPlayer.name, data.player.name),
  });
  return trimContentPrefix(content, `${data.player.name} to ${data.otherPlayer.name}:`);
}

export async function leaveConversationMessage(
  env: Env,
  db: DB,
  worldId: string,
  conversationId: string,
  playerId: string,
  otherPlayerId: string,
): Promise<string> {
  const data = await loadPromptData(db, worldId, playerId, otherPlayerId, conversationId);
  const prompt = [
    `You are ${data.player.name}, currently in a conversation with ${data.otherPlayer.name}.`,
    `You've decided to leave and would like to politely tell them you're leaving.`,
    ...agentPrompts(data.otherPlayer.name, data.agent, data.otherAgent),
    `Below is the chat history. Be brief, under 200 characters.`,
  ];
  const messages: LLMMessage[] = [
    { role: 'system', content: prompt.join('\n') },
    ...(await previousMessages(db, worldId, data.player, data.otherPlayer, conversationId)),
    { role: 'user', content: `${data.player.name} to ${data.otherPlayer.name}:` },
  ];
  const { content } = await chatCompletion(env, {
    messages,
    max_tokens: 300,
    stop: stopWords(data.otherPlayer.name, data.player.name),
  });
  return trimContentPrefix(content, `${data.player.name} to ${data.otherPlayer.name}:`);
}
