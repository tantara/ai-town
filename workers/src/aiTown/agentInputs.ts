import { parseGameId } from './ids';
import { Player } from './player';
import { Conversation, conversationInputs } from './conversation';
import { movePlayer } from './movement';
import { inputHandler } from './inputHandler';
import { Activity } from './types';
import { Point } from '../util/types';
import { AgentDescription } from './agentDescription';
import { Agent } from './agent';

export const agentInputs = {
  finishRememberConversation: inputHandler<{ operationId: string; agentId: string }, null>({
    args: { operationId: 'string', agentId: 'string' },
    handler: (game, _now, args) => {
      const agentId = parseGameId('agents', args.agentId);
      const agent = game.world.agents.get(agentId);
      if (!agent) throw new Error(`Couldn't find agent: ${agentId}`);
      if (agent.inProgressOperation && agent.inProgressOperation.operationId === args.operationId) {
        delete agent.inProgressOperation;
        delete agent.toRemember;
      }
      return null;
    },
  }),
  finishDoSomething: inputHandler<
    {
      operationId: string;
      agentId: string;
      destination?: Point;
      invitee?: string;
      activity?: Activity;
    },
    null
  >({
    args: {
      operationId: 'string',
      agentId: 'string',
      destination: 'point?',
      invitee: 'string?',
      activity: 'activity?',
    },
    handler: (game, now, args) => {
      const agentId = parseGameId('agents', args.agentId);
      const agent = game.world.agents.get(agentId);
      if (!agent) throw new Error(`Couldn't find agent: ${agentId}`);
      if (
        !agent.inProgressOperation ||
        agent.inProgressOperation.operationId !== args.operationId
      ) {
        return null;
      }
      delete agent.inProgressOperation;
      const player = game.world.players.get(agent.playerId)!;
      if (args.invitee) {
        const inviteeId = parseGameId('players', args.invitee);
        const invitee = game.world.players.get(inviteeId);
        if (!invitee) throw new Error(`Couldn't find player: ${inviteeId}`);
        Conversation.start(game, now, player, invitee);
        agent.lastInviteAttempt = now;
      }
      if (args.destination) movePlayer(game, now, player, args.destination);
      if (args.activity) player.activity = args.activity;
      return null;
    },
  }),
  agentFinishSendingMessage: inputHandler<
    {
      agentId: string;
      conversationId: string;
      timestamp: number;
      operationId: string;
      leaveConversation: boolean;
    },
    null
  >({
    args: {
      agentId: 'string',
      conversationId: 'string',
      timestamp: 'number',
      operationId: 'string',
      leaveConversation: 'boolean',
    },
    handler: (game, now, args) => {
      const agentId = parseGameId('agents', args.agentId);
      const agent = game.world.agents.get(agentId);
      if (!agent) throw new Error(`Couldn't find agent: ${agentId}`);
      const player = game.world.players.get(agent.playerId);
      if (!player) throw new Error(`Couldn't find player: ${agent.playerId}`);
      const conversationId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(conversationId);
      if (!conversation) throw new Error(`Couldn't find conversation: ${conversationId}`);
      if (
        !agent.inProgressOperation ||
        agent.inProgressOperation.operationId !== args.operationId
      ) {
        return null;
      }
      delete agent.inProgressOperation;
      conversationInputs.finishSendingMessage.handler(game, now, {
        playerId: agent.playerId,
        conversationId: args.conversationId,
        timestamp: args.timestamp,
      });
      if (args.leaveConversation) conversation.leave(game, now, player);
      return null;
    },
  }),
  // Note: createAgent originally used a `descriptionIndex` to pull from the
  // hardcoded Descriptions list. We now pass the description fields directly
  // (the Worker's seed step looks them up).
  createAgent: inputHandler<
    { name: string; character: string; identity: string; plan: string },
    { agentId: string }
  >({
    args: { name: 'string', character: 'string', identity: 'string', plan: 'string' },
    handler: (game, now, args) => {
      const playerId = Player.join(game, now, args.name, args.character, args.identity);
      const agentId = game.allocId('agents');
      game.world.agents.set(
        agentId,
        new Agent({
          id: agentId,
          playerId,
          inProgressOperation: undefined,
          lastConversation: undefined,
          lastInviteAttempt: undefined,
          toRemember: undefined,
        }),
      );
      game.agentDescriptions.set(
        agentId,
        new AgentDescription({ agentId, identity: args.identity, plan: args.plan }),
      );
      game.descriptionsModified = true;
      return { agentId };
    },
  }),
};
