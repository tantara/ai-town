import { COLLISION_THRESHOLD } from './constants';
import { compressPath, distance, manhattanDistance, pointsEqual } from '../util/geometry';
import { MinHeap } from '../util/minheap';
import { Point, Vector } from '../util/types';
import { Game } from './game';
import { GameId } from './ids';
import { Player } from './player';
import { WorldMap } from './worldMap';

// Movement speed kept here (not pulled from data/characters) so the engine
// stays free of asset dependencies. Tweak via a constant.
const MOVEMENT_SPEED = 0.75;

type PathCandidate = {
  position: Point;
  facing?: Vector;
  t: number;
  length: number;
  cost: number;
  prev?: PathCandidate;
};

export function stopPlayer(player: Player) {
  delete player.pathfinding;
  player.speed = 0;
}

export function movePlayer(
  game: Game,
  now: number,
  player: Player,
  destination: Point,
  allowInConversation?: boolean,
) {
  if (Math.floor(destination.x) !== destination.x || Math.floor(destination.y) !== destination.y) {
    throw new Error(`Non-integral destination: ${JSON.stringify(destination)}`);
  }
  if (pointsEqual(player.position, destination)) return;
  const inConversation = [...game.world.conversations.values()].some(
    (c) => c.participants.get(player.id)?.status.kind === 'participating',
  );
  if (inConversation && !allowInConversation) {
    throw new Error(`Can't move when in a conversation. Leave the conversation first!`);
  }
  player.pathfinding = {
    destination,
    started: now,
    state: { kind: 'needsPath' },
  };
}

export function findRoute(game: Game, now: number, player: Player, destination: Point) {
  const minDistances: PathCandidate[][] = [];
  const explore = (current: PathCandidate): Array<PathCandidate> => {
    const { x, y } = current.position;
    const neighbors: { position: Point; facing: Vector }[] = [];
    if (x !== Math.floor(x)) {
      neighbors.push(
        { position: { x: Math.floor(x), y }, facing: { dx: -1, dy: 0 } },
        { position: { x: Math.floor(x) + 1, y }, facing: { dx: 1, dy: 0 } },
      );
    }
    if (y !== Math.floor(y)) {
      neighbors.push(
        { position: { x, y: Math.floor(y) }, facing: { dx: 0, dy: -1 } },
        { position: { x, y: Math.floor(y) + 1 }, facing: { dx: 0, dy: 1 } },
      );
    }
    if (x === Math.floor(x) && y === Math.floor(y)) {
      neighbors.push(
        { position: { x: x + 1, y }, facing: { dx: 1, dy: 0 } },
        { position: { x: x - 1, y }, facing: { dx: -1, dy: 0 } },
        { position: { x, y: y + 1 }, facing: { dx: 0, dy: 1 } },
        { position: { x, y: y - 1 }, facing: { dx: 0, dy: -1 } },
      );
    }
    const next: PathCandidate[] = [];
    for (const { position, facing } of neighbors) {
      const segmentLength = distance(current.position, position);
      const length = current.length + segmentLength;
      if (blocked(game, now, position, player.id)) continue;
      const remaining = manhattanDistance(position, destination);
      const path = {
        position,
        facing,
        t: current.t + (segmentLength / MOVEMENT_SPEED) * 1000,
        length,
        cost: length + remaining,
        prev: current,
      };
      const existingMin = minDistances[position.y]?.[position.x];
      if (existingMin && existingMin.cost <= path.cost) continue;
      minDistances[position.y] ??= [];
      minDistances[position.y][position.x] = path;
      next.push(path);
    }
    return next;
  };

  const startingPosition = { x: player.position.x, y: player.position.y };
  let current: PathCandidate | undefined = {
    position: startingPosition,
    facing: player.facing,
    t: now,
    length: 0,
    cost: manhattanDistance(startingPosition, destination),
    prev: undefined,
  };
  let bestCandidate = current;
  const minheap = MinHeap<PathCandidate>((p0, p1) => p0.cost > p1.cost);
  while (current) {
    if (pointsEqual(current.position, destination)) break;
    if (
      manhattanDistance(current.position, destination) <
      manhattanDistance(bestCandidate.position, destination)
    ) {
      bestCandidate = current;
    }
    for (const candidate of explore(current)) minheap.push(candidate);
    current = minheap.pop();
  }
  let newDestination = null;
  if (!current) {
    if (bestCandidate.length === 0) return null;
    current = bestCandidate;
    newDestination = current.position;
  }
  const densePath: { position: Point; t: number; facing: Vector }[] = [];
  let facing = current.facing!;
  while (current) {
    densePath.push({ position: current.position, t: current.t, facing });
    facing = current.facing!;
    current = current.prev;
  }
  densePath.reverse();
  return { path: compressPath(densePath), newDestination };
}

export function blocked(game: Game, now: number, pos: Point, playerId?: GameId<'players'>) {
  const otherPositions = [...game.world.players.values()]
    .filter((p) => p.id !== playerId)
    .map((p) => p.position);
  return blockedWithPositions(pos, otherPositions, game.worldMap);
}

export function blockedWithPositions(position: Point, otherPositions: Point[], map: WorldMap) {
  if (isNaN(position.x) || isNaN(position.y)) {
    throw new Error(`NaN position in ${JSON.stringify(position)}`);
  }
  if (position.x < 0 || position.y < 0 || position.x >= map.width || position.y >= map.height) {
    return 'out of bounds';
  }
  for (const layer of map.objectTiles) {
    if (layer[Math.floor(position.x)][Math.floor(position.y)] !== -1) return 'world blocked';
  }
  for (const otherPosition of otherPositions) {
    if (distance(otherPosition, position) < COLLISION_THRESHOLD) return 'player';
  }
  return null;
}
