/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as agent_conversation from "../agent/conversation.js";
import type * as agent_embeddingsCache from "../agent/embeddingsCache.js";
import type * as agent_memory from "../agent/memory.js";
import type * as aiWorld_agent from "../aiWorld/agent.js";
import type * as aiWorld_agentDescription from "../aiWorld/agentDescription.js";
import type * as aiWorld_agentInputs from "../aiWorld/agentInputs.js";
import type * as aiWorld_agentOperations from "../aiWorld/agentOperations.js";
import type * as aiWorld_conversation from "../aiWorld/conversation.js";
import type * as aiWorld_conversationMembership from "../aiWorld/conversationMembership.js";
import type * as aiWorld_game from "../aiWorld/game.js";
import type * as aiWorld_ids from "../aiWorld/ids.js";
import type * as aiWorld_inputHandler from "../aiWorld/inputHandler.js";
import type * as aiWorld_inputs from "../aiWorld/inputs.js";
import type * as aiWorld_insertInput from "../aiWorld/insertInput.js";
import type * as aiWorld_location from "../aiWorld/location.js";
import type * as aiWorld_main from "../aiWorld/main.js";
import type * as aiWorld_movement from "../aiWorld/movement.js";
import type * as aiWorld_player from "../aiWorld/player.js";
import type * as aiWorld_playerDescription from "../aiWorld/playerDescription.js";
import type * as aiWorld_world from "../aiWorld/world.js";
import type * as aiWorld_worldMap from "../aiWorld/worldMap.js";
import type * as constants from "../constants.js";
import type * as crons from "../crons.js";
import type * as engine_abstractGame from "../engine/abstractGame.js";
import type * as engine_historicalObject from "../engine/historicalObject.js";
import type * as http from "../http.js";
import type * as init from "../init.js";
import type * as messages from "../messages.js";
import type * as music from "../music.js";
import type * as testing from "../testing.js";
import type * as util_FastIntegerCompression from "../util/FastIntegerCompression.js";
import type * as util_assertNever from "../util/assertNever.js";
import type * as util_asyncMap from "../util/asyncMap.js";
import type * as util_compression from "../util/compression.js";
import type * as util_geometry from "../util/geometry.js";
import type * as util_isSimpleObject from "../util/isSimpleObject.js";
import type * as util_llm from "../util/llm.js";
import type * as util_minheap from "../util/minheap.js";
import type * as util_object from "../util/object.js";
import type * as util_sleep from "../util/sleep.js";
import type * as util_types from "../util/types.js";
import type * as util_xxhash from "../util/xxhash.js";
import type * as world from "../world.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  "agent/conversation": typeof agent_conversation;
  "agent/embeddingsCache": typeof agent_embeddingsCache;
  "agent/memory": typeof agent_memory;
  "aiWorld/agent": typeof aiWorld_agent;
  "aiWorld/agentDescription": typeof aiWorld_agentDescription;
  "aiWorld/agentInputs": typeof aiWorld_agentInputs;
  "aiWorld/agentOperations": typeof aiWorld_agentOperations;
  "aiWorld/conversation": typeof aiWorld_conversation;
  "aiWorld/conversationMembership": typeof aiWorld_conversationMembership;
  "aiWorld/game": typeof aiWorld_game;
  "aiWorld/ids": typeof aiWorld_ids;
  "aiWorld/inputHandler": typeof aiWorld_inputHandler;
  "aiWorld/inputs": typeof aiWorld_inputs;
  "aiWorld/insertInput": typeof aiWorld_insertInput;
  "aiWorld/location": typeof aiWorld_location;
  "aiWorld/main": typeof aiWorld_main;
  "aiWorld/movement": typeof aiWorld_movement;
  "aiWorld/player": typeof aiWorld_player;
  "aiWorld/playerDescription": typeof aiWorld_playerDescription;
  "aiWorld/world": typeof aiWorld_world;
  "aiWorld/worldMap": typeof aiWorld_worldMap;
  constants: typeof constants;
  crons: typeof crons;
  "engine/abstractGame": typeof engine_abstractGame;
  "engine/historicalObject": typeof engine_historicalObject;
  http: typeof http;
  init: typeof init;
  messages: typeof messages;
  music: typeof music;
  testing: typeof testing;
  "util/FastIntegerCompression": typeof util_FastIntegerCompression;
  "util/assertNever": typeof util_assertNever;
  "util/asyncMap": typeof util_asyncMap;
  "util/compression": typeof util_compression;
  "util/geometry": typeof util_geometry;
  "util/isSimpleObject": typeof util_isSimpleObject;
  "util/llm": typeof util_llm;
  "util/minheap": typeof util_minheap;
  "util/object": typeof util_object;
  "util/sleep": typeof util_sleep;
  "util/types": typeof util_types;
  "util/xxhash": typeof util_xxhash;
  world: typeof world;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
