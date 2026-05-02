import { playerInputs } from './player';
import { conversationInputs } from './conversation';
import { agentInputs } from './agentInputs';

export const inputs = {
  ...playerInputs,
  ...conversationInputs,
  ...agentInputs,
};
export type Inputs = typeof inputs;
export type InputNames = keyof Inputs;
