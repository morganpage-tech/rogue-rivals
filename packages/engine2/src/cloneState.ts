import type { GameState } from "./gameState.js";

export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}
