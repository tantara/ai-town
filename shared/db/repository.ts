// Thin Postgres repository that handles the persistence shape of the Convex
// model. The engine code talks to this — never to Supabase directly.

import type { DB } from './supabase';
import {
  EngineDoc,
  GameStateDiff,
  GameStateSnapshot,
  InputDoc,
  SerializedAgentDescription,
  SerializedConversation,
  SerializedPlayer,
  SerializedPlayerDescription,
  SerializedWorldMap,
  SerializedAgent,
} from '../aiZoo/types';

// ---- Engine -----------------------------------------------------------------
export async function loadEngine(db: DB, engineId: string): Promise<EngineDoc> {
  const { data, error } = await db.from('engines').select('*').eq('id', engineId).single();
  if (error) throw error;
  return rowToEngine(data);
}

export async function createEngine(db: DB): Promise<EngineDoc> {
  const now = Date.now();
  const { data, error } = await db
    .from('engines')
    .insert({ current_time_ms: now, generation_number: 0, running: true })
    .select()
    .single();
  if (error) throw error;
  return rowToEngine(data);
}

export async function replaceEngine(
  db: DB,
  engineId: string,
  engine: Omit<EngineDoc, 'id'>,
): Promise<void> {
  const { error } = await db
    .from('engines')
    .update({
      current_time_ms: engine.currentTime ?? null,
      last_step_ts_ms: engine.lastStepTs ?? null,
      processed_input_number: engine.processedInputNumber ?? null,
      running: engine.running,
      generation_number: engine.generationNumber,
    })
    .eq('id', engineId);
  if (error) throw error;
}

function rowToEngine(row: any): EngineDoc {
  return {
    id: row.id,
    currentTime: row.current_time_ms ?? undefined,
    lastStepTs: row.last_step_ts_ms ?? undefined,
    processedInputNumber: row.processed_input_number ?? undefined,
    running: row.running,
    generationNumber: Number(row.generation_number),
  };
}

// ---- Inputs queue ----------------------------------------------------------
export async function insertInput(
  db: DB,
  engineId: string,
  name: string,
  args: any,
): Promise<string> {
  // Get next number atomically via "number = max+1"; rely on the unique
  // (engine_id, number) constraint to surface any race.
  const { data: prev } = await db
    .from('inputs')
    .select('number')
    .eq('engine_id', engineId)
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle();
  const number = prev ? Number(prev.number) + 1 : 0;
  const { data, error } = await db
    .from('inputs')
    .insert({ engine_id: engineId, number, name, args, received: Date.now() })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function loadPendingInputs(
  db: DB,
  engineId: string,
  processedInputNumber: number | undefined,
  max: number,
): Promise<InputDoc[]> {
  const { data, error } = await db
    .from('inputs')
    .select('*')
    .eq('engine_id', engineId)
    .gt('number', processedInputNumber ?? -1)
    .order('number', { ascending: true })
    .limit(max);
  if (error) throw error;
  return (data ?? []).map(rowToInput);
}

export async function completeInput(
  db: DB,
  inputId: string,
  result: { kind: 'ok'; value: any } | { kind: 'error'; message: string },
): Promise<void> {
  const update =
    result.kind === 'ok'
      ? { return_kind: 'ok', return_value: result.value, return_error: null }
      : { return_kind: 'error', return_value: null, return_error: result.message };
  const { error } = await db.from('inputs').update(update).eq('id', inputId);
  if (error) throw error;
}

export async function getInputResult(db: DB, inputId: string) {
  const { data, error } = await db
    .from('inputs')
    .select('return_kind, return_value, return_error')
    .eq('id', inputId)
    .single();
  if (error) throw error;
  if (!data.return_kind) return null;
  return data.return_kind === 'ok'
    ? { kind: 'ok' as const, value: data.return_value }
    : { kind: 'error' as const, message: data.return_error };
}

function rowToInput(row: any): InputDoc {
  let returnValue: InputDoc['returnValue'];
  if (row.return_kind === 'ok') returnValue = { kind: 'ok', value: row.return_value };
  else if (row.return_kind === 'error') returnValue = { kind: 'error', message: row.return_error };
  return {
    id: row.id,
    engineId: row.engine_id,
    number: Number(row.number),
    name: row.name,
    args: row.args,
    received: Number(row.received),
    returnValue,
  };
}

// ---- World snapshot --------------------------------------------------------
export async function loadGameState(
  db: DB,
  worldId: string,
): Promise<GameStateSnapshot> {
  const [{ data: world, error: e1 }, { data: map, error: e2 }, { data: pds, error: e3 }, { data: ads, error: e4 }] =
    await Promise.all([
      db.from('worlds').select('state').eq('id', worldId).single(),
      db.from('maps').select('*').eq('world_id', worldId).single(),
      db.from('player_descriptions').select('*').eq('world_id', worldId),
      db.from('agent_descriptions').select('*').eq('world_id', worldId),
    ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;
  if (e4) throw e4;
  return {
    world: world.state,
    worldMap: rowToMap(map),
    playerDescriptions: (pds ?? []).map(rowToPlayerDesc),
    agentDescriptions: (ads ?? []).map(rowToAgentDesc),
  };
}

export async function saveGameDiff(
  db: DB,
  worldId: string,
  diff: GameStateDiff,
): Promise<void> {
  // Load current world state to figure out what was archived.
  const { data: existingRow, error } = await db.from('worlds').select('state').eq('id', worldId).single();
  if (error) throw error;
  const existing = existingRow.state as { players: SerializedPlayer[]; conversations: SerializedConversation[]; agents: SerializedAgent[] };
  const newWorld = diff.world;
  const now = Date.now();

  // Archive removed players, conversations, agents.
  const removedPlayers = existing.players.filter((p) => !newWorld.players.some((np) => np.id === p.id));
  const removedConversations = existing.conversations.filter(
    (c) => !newWorld.conversations.some((nc) => nc.id === c.id),
  );
  const removedAgents = existing.agents.filter((a) => !newWorld.agents.some((na) => na.id === a.id));

  const archivePlayers = removedPlayers.map((p) => ({
    world_id: worldId,
    player_id: p.id,
    data: p,
  }));
  const archiveConversations = removedConversations.map((c) => ({
    world_id: worldId,
    conversation_id: c.id,
    creator: c.creator,
    created: c.created,
    ended: now,
    last_message: c.lastMessage ?? null,
    num_messages: c.numMessages,
    participants: c.participants.map((m) => m.playerId),
  }));
  const archiveAgents = removedAgents.map((a) => ({
    world_id: worldId,
    agent_id: a.id,
    data: a,
  }));
  const participatedRows: any[] = [];
  for (const c of removedConversations) {
    const participants = c.participants.map((m) => m.playerId);
    for (let i = 0; i < participants.length; i++) {
      for (let j = 0; j < participants.length; j++) {
        if (i === j) continue;
        participatedRows.push({
          world_id: worldId,
          conversation_id: c.id,
          player1: participants[i],
          player2: participants[j],
          ended: now,
        });
      }
    }
  }

  // Replace the world doc.
  const { error: e1 } = await db
    .from('worlds')
    .update({ state: newWorld, updated_at: new Date().toISOString() })
    .eq('id', worldId);
  if (e1) throw e1;

  if (archivePlayers.length) await db.from('archived_players').insert(archivePlayers);
  if (archiveConversations.length) await db.from('archived_conversations').insert(archiveConversations);
  if (archiveAgents.length) await db.from('archived_agents').insert(archiveAgents);
  if (participatedRows.length) await db.from('participated_together').insert(participatedRows);

  if (diff.playerDescriptions) {
    const rows = diff.playerDescriptions.map((d) => ({
      world_id: worldId,
      player_id: d.playerId,
      name: d.name,
      description: d.description,
      character: d.character,
    }));
    if (rows.length) {
      const { error: e } = await db
        .from('player_descriptions')
        .upsert(rows, { onConflict: 'world_id,player_id' });
      if (e) throw e;
    }
  }
  if (diff.agentDescriptions) {
    const rows = diff.agentDescriptions.map((d) => ({
      world_id: worldId,
      agent_id: d.agentId,
      identity: d.identity,
      plan: d.plan,
    }));
    if (rows.length) {
      const { error: e } = await db
        .from('agent_descriptions')
        .upsert(rows, { onConflict: 'world_id,agent_id' });
      if (e) throw e;
    }
  }
  if (diff.worldMap) {
    const { error: e } = await db
      .from('maps')
      .update({
        width: diff.worldMap.width,
        height: diff.worldMap.height,
        tile_set_url: diff.worldMap.tileSetUrl,
        tile_set_dim_x: diff.worldMap.tileSetDimX,
        tile_set_dim_y: diff.worldMap.tileSetDimY,
        tile_dim: diff.worldMap.tileDim,
        bg_tiles: diff.worldMap.bgTiles,
        object_tiles: diff.worldMap.objectTiles,
        animated_sprites: diff.worldMap.animatedSprites,
      })
      .eq('world_id', worldId);
    if (e) throw e;
  }
}

function rowToMap(row: any): SerializedWorldMap {
  return {
    width: row.width,
    height: row.height,
    tileSetUrl: row.tile_set_url,
    tileSetDimX: row.tile_set_dim_x,
    tileSetDimY: row.tile_set_dim_y,
    tileDim: row.tile_dim,
    bgTiles: row.bg_tiles,
    objectTiles: row.object_tiles,
    animatedSprites: row.animated_sprites,
  };
}
function rowToPlayerDesc(row: any): SerializedPlayerDescription {
  return {
    playerId: row.player_id,
    name: row.name,
    description: row.description,
    character: row.character,
  };
}
function rowToAgentDesc(row: any): SerializedAgentDescription {
  return { agentId: row.agent_id, identity: row.identity, plan: row.plan };
}

// ---- Messages --------------------------------------------------------------
export async function insertMessage(
  db: DB,
  worldId: string,
  conversationId: string,
  messageUuid: string,
  author: string,
  text: string,
): Promise<void> {
  const { error } = await db.from('messages').insert({
    world_id: worldId,
    conversation_id: conversationId,
    message_uuid: messageUuid,
    author,
    text,
  });
  if (error) throw error;
}

export async function listMessages(db: DB, worldId: string, conversationId: string) {
  const { data, error } = await db
    .from('messages')
    .select('*')
    .eq('world_id', worldId)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ---- World status / world creation ----------------------------------------
export async function getDefaultWorldStatus(db: DB) {
  const { data, error } = await db
    .from('world_status')
    .select('*')
    .eq('is_default', true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getWorldStatus(db: DB, worldId: string) {
  const { data, error } = await db.from('world_status').select('*').eq('world_id', worldId).single();
  if (error) throw error;
  return data;
}

export async function heartbeatWorld(db: DB, worldId: string) {
  const { error } = await db
    .from('world_status')
    .update({ last_viewed: Date.now() })
    .eq('world_id', worldId);
  if (error) throw error;
}

export type WorldStatusKind = 'running' | 'stoppedByDeveloper' | 'inactive';

export async function setWorldStatus(
  db: DB,
  worldId: string,
  status: WorldStatusKind,
): Promise<void> {
  const { error } = await db
    .from('world_status')
    .update({ status })
    .eq('world_id', worldId);
  if (error) throw error;
}
