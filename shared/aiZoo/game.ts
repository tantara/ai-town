// Concrete Game class. load/save go through the Repository module and
// `agentOperations` are queued for the Worker to dispatch.

import { AbstractGame } from '../engine/abstractGame';
import { HistoricalObject } from '../engine/historicalObject';
import { GameId, IdTypes, allocGameId } from './ids';
import { World } from './world';
import { WorldMap } from './worldMap';
import { PlayerDescription } from './playerDescription';
import { AgentDescription } from './agentDescription';
import { locationFields, playerLocation } from './location';
import { parseMap, serializeMap } from '../util/object';
import { inputs as inputRegistry, InputNames, Inputs } from './inputs';
import {
  EngineDoc,
  GameStateDiff,
  GameStateSnapshot,
  SerializedAgentDescription,
  SerializedPlayerDescription,
  SerializedWorldMap,
} from './types';
import type { DB } from '../db/supabase';
import * as repo from '../db/repository';

export class Game extends AbstractGame {
  tickDuration = 16;
  stepDuration = 1000;
  maxTicksPerStep = 600;
  maxInputsPerStep = 32;

  world: World;
  historicalLocations: Map<GameId<'players'>, HistoricalObject<any>>;
  descriptionsModified: boolean;
  worldMap: WorldMap;
  playerDescriptions: Map<GameId<'players'>, PlayerDescription>;
  agentDescriptions: Map<GameId<'agents'>, AgentDescription>;
  pendingOperations: Array<{ name: string; args: any }> = [];
  numPathfinds: number;

  constructor(
    engine: EngineDoc,
    public worldId: string,
    state: GameStateSnapshot,
  ) {
    super(engine);
    this.world = new World(state.world);
    delete this.world.historicalLocations;
    this.descriptionsModified = false;
    this.worldMap = new WorldMap(state.worldMap);
    this.agentDescriptions = parseMap(state.agentDescriptions, AgentDescription, (a) => a.agentId);
    this.playerDescriptions = parseMap(
      state.playerDescriptions,
      PlayerDescription,
      (p) => p.playerId,
    );
    this.historicalLocations = new Map();
    this.numPathfinds = 0;
  }

  static async load(db: DB, worldId: string): Promise<Game> {
    const status = await repo.getWorldStatus(db, worldId);
    if (!status) throw new Error(`No world status for ${worldId}`);
    const engine = await repo.loadEngine(db, status.engine_id);
    const state = await repo.loadGameState(db, worldId);
    return new Game(engine, worldId, state);
  }

  allocId<T extends IdTypes>(idType: T): GameId<T> {
    const id = allocGameId(idType, this.world.nextId);
    this.world.nextId += 1;
    return id;
  }

  scheduleOperation(name: string, args: unknown) {
    this.pendingOperations.push({ name, args });
  }

  handleInput(now: number, name: string, args: any) {
    const handler = (inputRegistry as Inputs)[name as InputNames]?.handler as
      | ((g: Game, n: number, a: any) => unknown)
      | undefined;
    if (!handler) throw new Error(`Invalid input: ${name}`);
    return handler(this, now, args);
  }

  beginStep(_now: number) {
    this.historicalLocations.clear();
    for (const player of this.world.players.values()) {
      this.historicalLocations.set(
        player.id,
        new HistoricalObject(locationFields, playerLocation(player) as any),
      );
    }
    this.numPathfinds = 0;
  }

  tick(now: number) {
    for (const player of this.world.players.values()) player.tick(this, now);
    for (const player of this.world.players.values()) player.tickPathfinding(this, now);
    for (const player of this.world.players.values()) player.tickPosition(this, now);
    for (const conversation of this.world.conversations.values()) conversation.tick(this, now);
    for (const agent of this.world.agents.values()) agent.tick(this, now);
    for (const player of this.world.players.values()) {
      let h = this.historicalLocations.get(player.id);
      if (!h) {
        h = new HistoricalObject(locationFields, playerLocation(player) as any);
        this.historicalLocations.set(player.id, h);
      }
      h.update(now, playerLocation(player) as any);
    }
  }

  takeDiff(): GameStateDiff {
    const historicalLocations: { playerId: string; location: ArrayBuffer }[] = [];
    for (const [id, ho] of this.historicalLocations.entries()) {
      const buffer = ho.pack();
      if (!buffer) continue;
      historicalLocations.push({ playerId: id, location: buffer });
    }
    this.historicalLocations.clear();
    const result: GameStateDiff = {
      world: { ...this.world.serialize(), historicalLocations },
      agentOperations: this.pendingOperations,
    };
    this.pendingOperations = [];
    if (this.descriptionsModified) {
      result.playerDescriptions = serializeMap(this.playerDescriptions) as SerializedPlayerDescription[];
      result.agentDescriptions = serializeMap(this.agentDescriptions) as SerializedAgentDescription[];
      result.worldMap = this.worldMap.serialize() as SerializedWorldMap;
      this.descriptionsModified = false;
    }
    return result;
  }
}
