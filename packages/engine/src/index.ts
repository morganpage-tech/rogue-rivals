export type {
  Tribe,
  Region,
  Resource,
  BuildingType,
  Resources,
} from "./rules.js";
export {
  RES_KEYS,
  REGION_KEYS,
  TRIBE_HOME,
  REGION_TO_RES,
  BUILD_ORDER,
  VP_WIN_THRESHOLD,
  MAX_ROUNDS,
  emptyResources,
  canonicalPair,
} from "./rules.js";

export type {
  PlayerState,
  TradeOffer,
  MatchState,
  Action,
  Command,
  CounterPayload,
  EndTrigger,
} from "./state.js";
export {
  cloneMatchState,
  clonePlayer,
  insertBuildingSorted,
  snapshotPrivate,
  createInitialPlayer,
} from "./state.js";

export type { RandomFn, RngState } from "./rng.js";
export { mulberry32, shuffle, createRngState, nextRandom } from "./rng.js";

export { initMatch, initialScrapPool } from "./init.js";
export type { InitMatchOpts } from "./init.js";

export {
  applyCommand,
  listLegalActions,
  isLegal,
  actionIsLegalNow,
} from "./commands.js";
export type { RuleError } from "./commands.js";

export { resolveTrade, canPayResources } from "./trade.js";

export { runEndOfRound, computeStandings } from "./endOfRound.js";
export { advanceAfterTakeAction, anyPlayerReachedVp, computeMatchOutcome } from "./matchEnd.js";

export {
  forgeTriple,
  computeBuildCost,
  computeBaseYield,
  computeGatherYield,
  applyGather,
  vpForBuilding,
} from "./actions.js";

export { replayOneTurn, mapSimActionPayload } from "./replay.js";
export type { SimTurnEvent } from "./replay.js";
