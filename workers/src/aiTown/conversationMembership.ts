import { GameId, parseGameId } from './ids';
import { ConversationMembershipStatus, SerializedConversationMembership } from './types';

export class ConversationMembership {
  playerId: GameId<'players'>;
  invited: number;
  status: ConversationMembershipStatus;
  constructor(s: SerializedConversationMembership) {
    this.playerId = parseGameId('players', s.playerId);
    this.invited = s.invited;
    this.status = s.status;
  }
  serialize(): SerializedConversationMembership {
    return { playerId: this.playerId, invited: this.invited, status: this.status };
  }
}
