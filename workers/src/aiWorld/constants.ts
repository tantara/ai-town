// Verbatim copy of convex/constants.ts. No Convex dependency to begin with.

export const ACTION_TIMEOUT = 120_000;
export const IDLE_WORLD_TIMEOUT = 5 * 60 * 1000;
export const WORLD_HEARTBEAT_INTERVAL = 60 * 1000;
export const MAX_STEP = 10 * 60 * 1000;
export const TICK = 16;
export const STEP_INTERVAL = 1000;
export const PATHFINDING_TIMEOUT = 60 * 1000;
export const PATHFINDING_BACKOFF = 1000;
export const CONVERSATION_DISTANCE = 1.3;
export const MIDPOINT_THRESHOLD = 4;
export const TYPING_TIMEOUT = 15 * 1000;
export const COLLISION_THRESHOLD = 0.75;
export const MAX_HUMAN_PLAYERS = 8;
export const CONVERSATION_COOLDOWN = 15000;
export const ACTIVITY_COOLDOWN = 10_000;
export const PLAYER_CONVERSATION_COOLDOWN = 60000;
export const INVITE_ACCEPT_PROBABILITY = 0.8;
export const INVITE_TIMEOUT = 60000;
export const AWKWARD_CONVERSATION_TIMEOUT = 60_000;
export const MAX_CONVERSATION_DURATION = 10 * 60_000;
export const MAX_CONVERSATION_MESSAGES = 8;
export const INPUT_DELAY = 1000;
export const NUM_MEMORIES_TO_SEARCH = 3;
export const MESSAGE_COOLDOWN = 2000;
export const AGENT_WAKEUP_THRESHOLD = 1000;
export const VACUUM_MAX_AGE = 2 * 7 * 24 * 60 * 60 * 1000;
export const DELETE_BATCH_SIZE = 64;
export const HUMAN_IDLE_TOO_LONG = 5 * 60 * 1000;
export const ACTIVITIES = [
  { description: 'reading a book', emoji: '📖', duration: 60_000 },
  { description: 'daydreaming', emoji: '🤔', duration: 60_000 },
  { description: 'gardening', emoji: '🥕', duration: 60_000 },
];
export const ENGINE_ACTION_DURATION = 30000;
export const MAX_PATHFINDS_PER_STEP = 16;
export const DEFAULT_NAME = 'Me';
