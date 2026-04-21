/**
 * @rr/engine2 — v2 rules engine (TypeScript) and public type surface.
 *
 * Tick resolution and state hashing match the legacy v2 oracle baselines used in conformance tests.
 */

export * from "./types.js";
export * from "./constants.js";
export * from "./matchConfig.js";

export { CONTINENT_6P_DEFAULT_TRIBES } from "./continent6pMap.js";
export { initMatch } from "./initMatch.js";
export { hashState, sortKeysDeep } from "./hashState.js";
export { tick, checkVictory } from "./tick.js";
export { projectForPlayer } from "./projectForPlayer.js";
export { projectForSpectator, type ProjectForSpectatorOptions } from "./projectForSpectator.js";
export {
  filterOrdersByInfluenceBudget,
  ordersExceedInfluenceBudget,
  dedupeMovesOnePerForce,
  sanitizePlayerOrders,
  wouldClipOrders,
} from "@rr/shared";
