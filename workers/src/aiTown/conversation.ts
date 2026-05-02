import { GameId, parseGameId } from './ids';
import { Player } from './player';
import { inputHandler } from './inputHandler';
import { CONVERSATION_DISTANCE, TYPING_TIMEOUT } from './constants';
import { distance, normalize, vector } from '../util/geometry';
import { Point } from '../util/types';
import type { Game } from './game';
import { stopPlayer, blocked, movePlayer } from './movement';
import { ConversationMembership } from './conversationMembership';
import { parseMap, serializeMap } from '../util/object';
import { SerializedConversation } from './types';

export class Conversation {
  id: GameId<'conversations'>;
  creator: GameId<'players'>;
  created: number;
  isTyping?: { playerId: GameId<'players'>; messageUuid: string; since: number };
  lastMessage?: { author: GameId<'players'>; timestamp: number };
  numMessages: number;
  participants: Map<GameId<'players'>, ConversationMembership>;

  constructor(s: SerializedConversation) {
    this.id = parseGameId('conversations', s.id);
    this.creator = parseGameId('players', s.creator);
    this.created = s.created;
    this.isTyping =
      s.isTyping && {
        playerId: parseGameId('players', s.isTyping.playerId),
        messageUuid: s.isTyping.messageUuid,
        since: s.isTyping.since,
      };
    this.lastMessage =
      s.lastMessage && {
        author: parseGameId('players', s.lastMessage.author),
        timestamp: s.lastMessage.timestamp,
      };
    this.numMessages = s.numMessages;
    this.participants = parseMap(s.participants, ConversationMembership, (m) => m.playerId);
  }

  tick(game: Game, now: number) {
    if (this.isTyping && this.isTyping.since + TYPING_TIMEOUT < now) delete this.isTyping;
    if (this.participants.size !== 2) return;
    const [playerId1, playerId2] = [...this.participants.keys()];
    const member1 = this.participants.get(playerId1)!;
    const member2 = this.participants.get(playerId2)!;
    const player1 = game.world.players.get(playerId1)!;
    const player2 = game.world.players.get(playerId2)!;
    const playerDistance = distance(player1?.position, player2?.position);

    if (member1.status.kind === 'walkingOver' && member2.status.kind === 'walkingOver') {
      if (playerDistance < CONVERSATION_DISTANCE) {
        stopPlayer(player1);
        stopPlayer(player2);
        member1.status = { kind: 'participating', started: now };
        member2.status = { kind: 'participating', started: now };

        const neighbors = (p: Point) => [
          { x: p.x + 1, y: p.y },
          { x: p.x - 1, y: p.y },
          { x: p.x, y: p.y + 1 },
          { x: p.x, y: p.y - 1 },
        ];
        const floorPos1 = { x: Math.floor(player1.position.x), y: Math.floor(player1.position.y) };
        const p1Candidates = neighbors(floorPos1).filter((p) => !blocked(game, now, p, player1.id));
        p1Candidates.sort((a, b) => distance(a, player2.position) - distance(b, player2.position));
        if (p1Candidates.length > 0) {
          const p1Candidate = p1Candidates[0];
          const p2Candidates = neighbors(p1Candidate).filter(
            (p) => !blocked(game, now, p, player2.id),
          );
          p2Candidates.sort((a, b) => distance(a, player2.position) - distance(b, player2.position));
          if (p2Candidates.length > 0) {
            movePlayer(game, now, player1, p1Candidate, true);
            movePlayer(game, now, player2, p2Candidates[0], true);
          }
        }
      }
    }
    if (member1.status.kind === 'participating' && member2.status.kind === 'participating') {
      const v = normalize(vector(player1.position, player2.position));
      if (!player1.pathfinding && v) player1.facing = v;
      if (!player2.pathfinding && v) {
        player2.facing.dx = -v.dx;
        player2.facing.dy = -v.dy;
      }
    }
  }

  static start(game: Game, now: number, player: Player, invitee: Player) {
    if (player.id === invitee.id) throw new Error(`Can't invite yourself to a conversation`);
    if ([...game.world.conversations.values()].find((c) => c.participants.has(player.id))) {
      return { error: `Player ${player.id} is already in a conversation` };
    }
    if ([...game.world.conversations.values()].find((c) => c.participants.has(invitee.id))) {
      return { error: `Player ${invitee.id} is already in a conversation` };
    }
    const conversationId = game.allocId('conversations');
    game.world.conversations.set(
      conversationId,
      new Conversation({
        id: conversationId,
        created: now,
        creator: player.id,
        numMessages: 0,
        participants: [
          { playerId: player.id, invited: now, status: { kind: 'walkingOver' } },
          { playerId: invitee.id, invited: now, status: { kind: 'invited' } },
        ],
      }),
    );
    return { conversationId };
  }

  setIsTyping(now: number, player: Player, messageUuid: string) {
    if (this.isTyping) {
      if (this.isTyping.playerId !== player.id) {
        throw new Error(`Player ${this.isTyping.playerId} is already typing in ${this.id}`);
      }
      return;
    }
    this.isTyping = { playerId: player.id, messageUuid, since: now };
  }

  acceptInvite(_game: Game, player: Player) {
    const member = this.participants.get(player.id);
    if (!member) throw new Error(`Player ${player.id} not in conversation ${this.id}`);
    if (member.status.kind !== 'invited') throw new Error(`Wrong state`);
    member.status = { kind: 'walkingOver' };
  }

  rejectInvite(game: Game, now: number, player: Player) {
    const member = this.participants.get(player.id);
    if (!member) throw new Error(`Player ${player.id} not in conversation ${this.id}`);
    if (member.status.kind !== 'invited') throw new Error(`Wrong state`);
    this.stop(game, now);
  }

  stop(game: Game, now: number) {
    delete this.isTyping;
    for (const [playerId, _] of this.participants.entries()) {
      const agent = [...game.world.agents.values()].find((a) => a.playerId === playerId);
      if (agent) {
        agent.lastConversation = now;
        agent.toRemember = this.id;
      }
    }
    game.world.conversations.delete(this.id);
  }

  leave(game: Game, now: number, player: Player) {
    if (!this.participants.get(player.id)) {
      throw new Error(`Couldn't find membership for ${this.id}:${player.id}`);
    }
    this.stop(game, now);
  }

  serialize(): SerializedConversation {
    return {
      id: this.id,
      creator: this.creator,
      created: this.created,
      isTyping: this.isTyping,
      lastMessage: this.lastMessage,
      numMessages: this.numMessages,
      participants: serializeMap(this.participants),
    };
  }
}

export const conversationInputs = {
  startConversation: inputHandler<{ playerId: string; invitee: string }, GameId<'conversations'>>({
    args: { playerId: 'string', invitee: 'string' },
    handler: (game, now, args) => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) throw new Error(`Invalid player ID: ${playerId}`);
      const inviteeId = parseGameId('players', args.invitee);
      const invitee = game.world.players.get(inviteeId);
      if (!invitee) throw new Error(`Invalid player ID: ${inviteeId}`);
      const { conversationId, error } = Conversation.start(game, now, player, invitee);
      if (!conversationId) throw new Error(error);
      return conversationId;
    },
  }),
  startTyping: inputHandler<
    { playerId: string; conversationId: string; messageUuid: string },
    null
  >({
    args: { playerId: 'string', conversationId: 'string', messageUuid: 'string' },
    handler: (game, now, args) => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) throw new Error(`Invalid player ID: ${playerId}`);
      const conversationId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(conversationId);
      if (!conversation) throw new Error(`Invalid conversation ID: ${conversationId}`);
      if (conversation.isTyping && conversation.isTyping.playerId !== playerId) {
        throw new Error(`Already typing`);
      }
      conversation.isTyping = { playerId, messageUuid: args.messageUuid, since: now };
      return null;
    },
  }),
  finishSendingMessage: inputHandler<
    { playerId: string; conversationId: string; timestamp: number },
    null
  >({
    args: { playerId: 'string', conversationId: 'string', timestamp: 'number' },
    handler: (game, _now, args) => {
      const playerId = parseGameId('players', args.playerId);
      const conversationId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(conversationId);
      if (!conversation) throw new Error(`Invalid conversation ID: ${conversationId}`);
      if (conversation.isTyping && conversation.isTyping.playerId === playerId) {
        delete conversation.isTyping;
      }
      conversation.lastMessage = { author: playerId, timestamp: args.timestamp };
      conversation.numMessages++;
      return null;
    },
  }),
  acceptInvite: inputHandler<{ playerId: string; conversationId: string }, null>({
    args: { playerId: 'string', conversationId: 'string' },
    handler: (game, _now, args) => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) throw new Error(`Invalid player ID ${playerId}`);
      const conversationId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(conversationId);
      if (!conversation) throw new Error(`Invalid conversation ID ${conversationId}`);
      conversation.acceptInvite(game, player);
      return null;
    },
  }),
  rejectInvite: inputHandler<{ playerId: string; conversationId: string }, null>({
    args: { playerId: 'string', conversationId: 'string' },
    handler: (game, now, args) => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) throw new Error(`Invalid player ID ${playerId}`);
      const conversationId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(conversationId);
      if (!conversation) throw new Error(`Invalid conversation ID ${conversationId}`);
      conversation.rejectInvite(game, now, player);
      return null;
    },
  }),
  leaveConversation: inputHandler<{ playerId: string; conversationId: string }, null>({
    args: { playerId: 'string', conversationId: 'string' },
    handler: (game, now, args) => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) throw new Error(`Invalid player ID ${playerId}`);
      const conversationId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(conversationId);
      if (!conversation) throw new Error(`Invalid conversation ID ${conversationId}`);
      conversation.leave(game, now, player);
      return null;
    },
  }),
};
