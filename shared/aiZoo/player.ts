import { Point, Vector } from '../util/types';
import { GameId, parseGameId } from './ids';
import {
  HUMAN_IDLE_TOO_LONG,
  MAX_HUMAN_PLAYERS,
  MAX_PATHFINDS_PER_STEP,
  PATHFINDING_BACKOFF,
  PATHFINDING_TIMEOUT,
} from './constants';
import { pointsEqual, pathPosition } from '../util/geometry';
import type { Game } from './game';
import { stopPlayer, findRoute, blocked, movePlayer } from './movement';
import { inputHandler } from './inputHandler';
import { PlayerDescription } from './playerDescription';
import { Activity, Pathfinding, SerializedPlayer } from './types';

export type { Activity, Pathfinding, SerializedPlayer } from './types';

export class Player {
  id: GameId<'players'>;
  human?: string;
  pathfinding?: Pathfinding;
  activity?: Activity;
  lastInput: number;
  position: Point;
  facing: Vector;
  speed: number;

  constructor(s: SerializedPlayer) {
    this.id = parseGameId('players', s.id);
    this.human = s.human;
    this.pathfinding = s.pathfinding;
    this.activity = s.activity;
    this.lastInput = s.lastInput;
    this.position = s.position;
    this.facing = s.facing;
    this.speed = s.speed;
  }

  tick(game: Game, now: number) {
    if (this.human && this.lastInput < now - HUMAN_IDLE_TOO_LONG) this.leave(game, now);
  }

  tickPathfinding(game: Game, now: number) {
    const { pathfinding, position } = this;
    if (!pathfinding) return;
    if (pathfinding.state.kind === 'moving' && pointsEqual(pathfinding.destination, position)) {
      stopPlayer(this);
    }
    if (pathfinding.started + PATHFINDING_TIMEOUT < now) {
      console.warn(`Timing out pathfinding for ${this.id}`);
      stopPlayer(this);
    }
    if (pathfinding.state.kind === 'waiting' && pathfinding.state.until < now) {
      pathfinding.state = { kind: 'needsPath' };
    }
    if (pathfinding.state.kind === 'needsPath' && game.numPathfinds < MAX_PATHFINDS_PER_STEP) {
      game.numPathfinds++;
      const route = findRoute(game, now, this, pathfinding.destination);
      if (route === null) {
        stopPlayer(this);
      } else {
        if (route.newDestination) pathfinding.destination = route.newDestination;
        pathfinding.state = { kind: 'moving', path: route.path };
      }
    }
  }

  tickPosition(game: Game, now: number) {
    if (!this.pathfinding || this.pathfinding.state.kind !== 'moving') {
      this.speed = 0;
      return;
    }
    const candidate = pathPosition(this.pathfinding.state.path, now);
    if (!candidate) return;
    const { position, facing, velocity } = candidate;
    const collisionReason = blocked(game, now, position, this.id);
    if (collisionReason !== null) {
      const backoff = Math.random() * PATHFINDING_BACKOFF;
      this.pathfinding.state = { kind: 'waiting', until: now + backoff };
      return;
    }
    this.position = position;
    this.facing = facing;
    this.speed = velocity;
  }

  static join(
    game: Game,
    now: number,
    name: string,
    character: string,
    description: string,
    tokenIdentifier?: string,
  ) {
    if (tokenIdentifier) {
      let numHumans = 0;
      for (const player of game.world.players.values()) {
        if (player.human) numHumans++;
        if (player.human === tokenIdentifier) throw new Error(`You are already in this game!`);
      }
      if (numHumans >= MAX_HUMAN_PLAYERS) {
        throw new Error(`Only ${MAX_HUMAN_PLAYERS} human players allowed at once.`);
      }
    }
    let position: Point | undefined;
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = {
        x: Math.floor(Math.random() * game.worldMap.width),
        y: Math.floor(Math.random() * game.worldMap.height),
      };
      if (blocked(game, now, candidate)) continue;
      position = candidate;
      break;
    }
    if (!position) throw new Error(`Failed to find a free position!`);
    const facingOptions: Vector[] = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];
    const facing = facingOptions[Math.floor(Math.random() * facingOptions.length)];
    const playerId = game.allocId('players');
    game.world.players.set(
      playerId,
      new Player({
        id: playerId,
        human: tokenIdentifier,
        lastInput: now,
        position,
        facing,
        speed: 0,
      }),
    );
    game.playerDescriptions.set(
      playerId,
      new PlayerDescription({ playerId, character, description, name }),
    );
    game.descriptionsModified = true;
    return playerId;
  }

  leave(game: Game, now: number) {
    const conversation = [...game.world.conversations.values()].find((c) =>
      c.participants.has(this.id),
    );
    if (conversation) conversation.stop(game, now);
    game.world.players.delete(this.id);
  }

  serialize(): SerializedPlayer {
    return {
      id: this.id,
      human: this.human,
      pathfinding: this.pathfinding,
      activity: this.activity,
      lastInput: this.lastInput,
      position: this.position,
      facing: this.facing,
      speed: this.speed,
    };
  }
}

// Player input handlers. Argument shapes are documented in the comment;
// the Worker uses Zod (see workers/src/aiZoo/inputs.ts) to validate before
// calling these handlers.
export const playerInputs = {
  join: inputHandler<
    { name: string; character: string; description: string; tokenIdentifier?: string },
    null
  >({
    args: { name: 'string', character: 'string', description: 'string', tokenIdentifier: 'string?' },
    handler: (game, now, args) => {
      Player.join(game, now, args.name, args.character, args.description, args.tokenIdentifier);
      return null;
    },
  }),
  leave: inputHandler<{ playerId: string }, null>({
    args: { playerId: 'string' },
    handler: (game, now, args) => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) throw new Error(`Invalid player ID ${playerId}`);
      player.leave(game, now);
      return null;
    },
  }),
  moveTo: inputHandler<{ playerId: string; destination: Point | null }, null>({
    args: { playerId: 'string', destination: 'point|null' },
    handler: (game, now, args) => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) throw new Error(`Invalid player ID ${playerId}`);
      if (args.destination) movePlayer(game, now, player, args.destination);
      else stopPlayer(player);
      return null;
    },
  }),
};
