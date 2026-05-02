import { GameId, parseGameId } from './ids';
import { SerializedAgentDescription } from './types';

export class AgentDescription {
  agentId: GameId<'agents'>;
  identity: string;
  plan: string;
  constructor(s: SerializedAgentDescription) {
    this.agentId = parseGameId('agents', s.agentId);
    this.identity = s.identity;
    this.plan = s.plan;
  }
  serialize(): SerializedAgentDescription {
    return { agentId: this.agentId, identity: this.identity, plan: this.plan };
  }
}
