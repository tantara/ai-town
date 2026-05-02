import { GameId, parseGameId } from './ids';
import { SerializedPlayerDescription } from './types';

export class PlayerDescription {
  playerId: GameId<'players'>;
  name: string;
  description: string;
  character: string;
  constructor(s: SerializedPlayerDescription) {
    this.playerId = parseGameId('players', s.playerId);
    this.name = s.name;
    this.description = s.description;
    this.character = s.character;
  }
  serialize(): SerializedPlayerDescription {
    return {
      playerId: this.playerId,
      name: this.name,
      description: this.description,
      character: this.character,
    };
  }
}
