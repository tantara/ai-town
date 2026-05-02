// Plain-TS shape declarations for serialized game state. These mirror the
// `serialized*` schemas in convex/aiWorld/* but as TypeScript interfaces so
// the engine code can run inside a Cloudflare Durable Object without pulling
// in `convex/values`.

import { GameId } from './ids';
import { Path, Point, Vector } from '../util/types';

export type ConversationMembershipStatus =
  | { kind: 'invited' }
  | { kind: 'walkingOver' }
  | { kind: 'participating'; started: number };

export interface SerializedConversationMembership {
  playerId: string;
  invited: number;
  status: ConversationMembershipStatus;
}

export interface SerializedConversation {
  id: string;
  creator: string;
  created: number;
  isTyping?: { playerId: string; messageUuid: string; since: number };
  lastMessage?: { author: string; timestamp: number };
  numMessages: number;
  participants: SerializedConversationMembership[];
}

export interface Pathfinding {
  destination: Point;
  started: number;
  state:
    | { kind: 'needsPath' }
    | { kind: 'waiting'; until: number }
    | { kind: 'moving'; path: Path };
}

export interface Activity {
  description: string;
  emoji?: string;
  until: number;
}

export interface SerializedPlayer {
  id: string;
  human?: string;
  pathfinding?: Pathfinding;
  activity?: Activity;
  lastInput: number;
  position: Point;
  facing: Vector;
  speed: number;
}

export interface SerializedAgent {
  id: string;
  playerId: string;
  toRemember?: string;
  lastConversation?: number;
  lastInviteAttempt?: number;
  inProgressOperation?: { name: string; operationId: string; started: number };
}

export interface SerializedHistoricalLocation {
  playerId: string;
  location: ArrayBuffer;
}

export interface SerializedWorld {
  nextId: number;
  conversations: SerializedConversation[];
  players: SerializedPlayer[];
  agents: SerializedAgent[];
  historicalLocations?: SerializedHistoricalLocation[];
}

export interface SerializedPlayerDescription {
  playerId: string;
  name: string;
  description: string;
  character: string;
}

export interface SerializedAgentDescription {
  agentId: string;
  identity: string;
  plan: string;
}

export interface SerializedAnimatedSprite {
  x: number;
  y: number;
  w: number;
  h: number;
  layer: number;
  sheet: string;
  animation: string;
}
export type TileLayer = number[][];
export interface SerializedWorldMap {
  width: number;
  height: number;
  tileSetUrl: string;
  tileSetDimX: number;
  tileSetDimY: number;
  tileDim: number;
  bgTiles: number[][][];
  objectTiles: TileLayer[];
  animatedSprites: SerializedAnimatedSprite[];
}

export interface EngineDoc {
  id: string;
  currentTime?: number;
  lastStepTs?: number;
  processedInputNumber?: number;
  running: boolean;
  generationNumber: number;
}

export interface InputDoc {
  id: string;
  engineId: string;
  number: number;
  name: string;
  args: any;
  received: number;
  returnValue?: { kind: 'ok'; value: any } | { kind: 'error'; message: string };
}

export type GameStateSnapshot = {
  world: SerializedWorld;
  playerDescriptions: SerializedPlayerDescription[];
  agentDescriptions: SerializedAgentDescription[];
  worldMap: SerializedWorldMap;
};

export type GameStateDiff = {
  world: SerializedWorld;
  playerDescriptions?: SerializedPlayerDescription[];
  agentDescriptions?: SerializedAgentDescription[];
  worldMap?: SerializedWorldMap;
  agentOperations: Array<{ name: string; args: any }>;
};

export type EngineUpdate = {
  engine: Omit<EngineDoc, 'id'>;
  expectedGenerationNumber: number;
  completedInputs: Array<{
    inputId: string;
    returnValue: { kind: 'ok'; value: any } | { kind: 'error'; message: string };
  }>;
};
