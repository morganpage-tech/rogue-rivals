/**
 * @rr/engine2 — v2 rules engine (TypeScript) and public type surface.
 *
 * Tick resolution mirrors `tools/v2/engine.py`; state hashing matches
 * `_hash_state` for conformance tests.
 */

export * from "./types.js";
export * from "./constants.js";

export { CONTINENT_6P_DEFAULT_TRIBES } from "./continent6pMap.js";
export { initMatch } from "./initMatch.js";
export { hashState, sortKeysDeep } from "./hashState.js";
export { tick, checkVictory } from "./tick.js";
export { projectForPlayer } from "./projectForPlayer.js";
