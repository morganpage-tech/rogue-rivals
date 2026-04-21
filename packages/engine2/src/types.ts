/**
 * Re-exports wire types from `@rr/shared` plus engine-only `GameState` / `TickResult`.
 */

export * from "@rr/shared";
export type { GameState, TickResult } from "./gameState.js";
