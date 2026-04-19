/**
 * @rr/engine2 — Public surface.
 *
 * This package exposes the *type contract* for the v2 async-on-submit
 * Rogue Rivals engine. The runtime implementation lives initially in the
 * Python oracle simulator (`tools/v2/sim_v2.py`); a TypeScript port will
 * follow once the rules prove fun in pure-LLM batch.
 *
 * All function signatures below are declared, not implemented. Consumers
 * (web client, future batch runner, tests) should import these types and
 * signatures and rely on the Python oracle for canonical semantics until
 * the TS port lands.
 */

export * from "./types.js";
export * from "./constants.js";

import type {
  GameState,
  MatchConfig,
  OrderPacket,
  ProjectedView,
  ResolutionEvent,
  Tribe,
} from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Match lifecycle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialise a match from a config. Consumes PRNG draws for map generation,
 * home placement, and asymmetric-start effects. After this call returns, the
 * PRNG state must be discarded — tick resolution uses no randomness.
 *
 * See RULES_v2.md §2, §10, §11.
 */
export declare function initMatch(config: MatchConfig): GameState;

// ─────────────────────────────────────────────────────────────────────────────
// Tick resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of a single tick resolution. Implementations MUST return events in
 * the order they occurred during §5.1–§5.10 of RULES_v2.md so that replays
 * are byte-identical across implementations.
 */
export interface TickResult {
  /** Mutated-in-place GameState (same reference as input, for performance). */
  readonly state: GameState;
  readonly events: readonly ResolutionEvent[];
  readonly projectedViews: Readonly<Record<Tribe, ProjectedView>>;
  /** Stable hash of `state` post-resolution, for conformance tests. */
  readonly stateHash: string;
}

/**
 * Resolve a single tick. Requires an `OrderPacket` for every tribe in
 * `state.tribesAlive`. Missing packets cause the engine to throw — it is the
 * caller's responsibility (batch runner / web client) to furnish a default
 * "pass" packet for silent players.
 *
 * This function is pure over `(state, packets)` in its observable effects,
 * and must consume zero PRNG draws.
 */
export declare function tick(
  state: GameState,
  packets: Readonly<Record<Tribe, OrderPacket>>,
): TickResult;

// ─────────────────────────────────────────────────────────────────────────────
// Fog of war
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Project the current state through a player's fog of war. Returns the ONLY
 * object an LLM or human for this tribe should ever see during normal play.
 *
 * Must not leak any field violating RULES_v2.md §9.
 */
export declare function projectForPlayer(
  state: GameState,
  tribe: Tribe,
): ProjectedView;

// ─────────────────────────────────────────────────────────────────────────────
// Determinism helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stable hash of a GameState for replay-regression tests. Implementations
 * must agree: the same state hashes to the same string across languages and
 * runtimes. Suggested: SHA-256 over a canonical JSON serialization with
 * sorted keys.
 */
export declare function hashState(state: GameState): string;

// ─────────────────────────────────────────────────────────────────────────────
// Victory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate victory conditions at end-of-tick. Mutates `state.winner` and
 * `state.victoryCounters` in place per RULES_v2.md §8. Returns the triggered
 * condition name if a win fired this tick, else null.
 */
export declare function checkVictory(state: GameState): string | null;
