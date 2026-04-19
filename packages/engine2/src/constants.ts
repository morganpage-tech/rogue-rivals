/**
 * Normative constants from RULES_v2.md §4. Any implementation that disagrees
 * with these values is non-conformant.
 *
 * This file is imported by the future engine implementation, by the web
 * client (for UI tooltips), and by any port that wants to check parity with
 * the Python oracle simulator.
 */

import type {
  ForceTier,
  RegionType,
  StructureKind,
  Tribe,
  FuzzyTier,
} from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Influence production (§4.1)
// ─────────────────────────────────────────────────────────────────────────────

/** Base Influence per owned region per tick. */
export const REGION_PRODUCTION: Record<RegionType, number> = {
  plains: 2,
  mountains: 2,
  swamps: 1,
  desert: 1,
  ruins: 3,
  forest: 1,
  river_crossing: 2,
};

/** Additional Influence per tick contributed by a structure in the region. */
export const STRUCTURE_PRODUCTION_BONUS: Partial<Record<StructureKind, number>> = {
  granary: 1,
  shrine: 1,
};

// ─────────────────────────────────────────────────────────────────────────────
// Force recruiting (§4.2)
// ─────────────────────────────────────────────────────────────────────────────

export const FORCE_RECRUIT_COST: Record<ForceTier, number> = {
  1: 2,
  2: 5,
  3: 12,
  4: 30,
};

/** Ticks added to every trail traversal by a force of this tier. */
export const FORCE_TRAVEL_PENALTY: Record<ForceTier, number> = {
  1: 0,
  2: 0,
  3: 1,
  4: 2,
};

/** Tier IV cannot be recruited unless the recruit region has this structure. */
export const FORGE_REQUIRED_FOR_TIER: ForceTier = 4;

// ─────────────────────────────────────────────────────────────────────────────
// Structure costs (§4.3)
// ─────────────────────────────────────────────────────────────────────────────

export const STRUCTURE_COST: Record<StructureKind, number> = {
  granary: 8,
  fort: 10,
  road: 6,
  watchtower: 6,
  shrine: 12,
  forge: 15,
};

export const MAX_STRUCTURES_PER_REGION = 2;

// ─────────────────────────────────────────────────────────────────────────────
// Trail lengths (§4.4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the symmetric base length in ticks for a trail connecting two
 * region types. Implementations must agree bit-for-bit.
 */
export function baseTrailLength(a: RegionType, b: RegionType): number {
  const pair = [a, b].sort().join("+") as string;
  if (pair === "plains+plains") return 1;
  if (pair === "plains+river_crossing") return 1;
  if (pair === "mountains+mountains") return 3;
  if (pair === "swamps+swamps") return 3;
  return 2;
}

/** Road modifier applied to the specific edge a road targets. */
export function roadModifiedLength(baseLength: number): number {
  return Math.max(1, Math.floor(baseLength / 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// Combat modifiers (§4.5, §7)
// ─────────────────────────────────────────────────────────────────────────────

export const COMBAT_DEFENDER_OWN_REGION_BONUS = 1;
export const COMBAT_FORT_BONUS = 1;
export const COMBAT_REINFORCEMENT_BONUS_PER_ALLY = 1;
export const COMBAT_REINFORCEMENT_BONUS_CAP = 2;
export const COMBAT_SCOUT_REVEAL_PENALTY = -1;

// ─────────────────────────────────────────────────────────────────────────────
// Scouts & caravans (§4.6, §4.7)
// ─────────────────────────────────────────────────────────────────────────────

export const SCOUT_COST = 3;
export const SCOUT_DWELL_TICKS = 1;

export const CARAVAN_TRAVEL_TICKS_DEFAULT = 2;
/** Minimum hostile tier that intercepts a caravan passing through. */
export const CARAVAN_INTERCEPT_MIN_TIER: ForceTier = 2;
/** Fraction of amount refunded to sender if the offer is declined mid-flight. */
export const CARAVAN_DECLINE_REFUND_FRACTION = 0.5;

// ─────────────────────────────────────────────────────────────────────────────
// Reputation (§4.8)
// ─────────────────────────────────────────────────────────────────────────────

export const REPUTATION_PENALTY_DURATION_EARLY_BREAK = 4;
export const REPUTATION_PENALTY_DURATION_LATE_BREAK = 2;
/** Pact broken within this many ticks of formation counts as "early". */
export const REPUTATION_EARLY_BREAK_THRESHOLD_TICKS = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Starting conditions (§4.9)
// ─────────────────────────────────────────────────────────────────────────────

export const TRIBE_HOME_TERRAIN: Record<Tribe, RegionType> = {
  orange: "plains",
  grey: "mountains",
  brown: "swamps",
  red: "desert",
};

export const STARTING_INFLUENCE: Record<Tribe, number> = {
  orange: 5,
  grey: 5,
  brown: 5,
  red: 10,
};

export const STARTING_GARRISON_TIER: ForceTier = 2;

/** Fuzzy tier the observer sees when peeking at a foreign force. */
export const FUZZY_TIER_FOR: Record<ForceTier, FuzzyTier> = {
  1: "raiding_party",
  2: "warband",
  3: "large_host",
  4: "massive_army",
};

// ─────────────────────────────────────────────────────────────────────────────
// Victory (§8)
// ─────────────────────────────────────────────────────────────────────────────

export const TERRITORIAL_DOMINANCE_FRACTION = 0.6;
export const ECONOMIC_SUPREMACY_FRACTION = 0.5;
export const CULTURAL_SHRINE_REQUIREMENT = 4;

/** Weights for end-of-match scoring fallback. Must sum to 1.0. */
export const FINAL_SCORE_WEIGHTS = {
  regionsOwned: 0.4,
  influenceShare: 0.3,
  shrinesOwned: 0.2,
  activeNaps: 0.1,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Map generation parameters (§11)
// ─────────────────────────────────────────────────────────────────────────────

export const MAP_REGION_COUNT_MIN = 15;
export const MAP_REGION_COUNT_MAX = 25;
export const MAP_MAX_HOME_DISTANCE_TRAILS = 4;
export const MAP_HOME_DISTANCE_RELAXED = 5;
export const MAP_REGEN_ATTEMPTS = 10;

/** Sampling weights for region terrain assignment. Must sum to 1.0. */
export const TERRAIN_WEIGHTS: Record<RegionType, number> = {
  plains: 0.30,
  mountains: 0.18,
  swamps: 0.13,
  desert: 0.13,
  ruins: 0.10,
  forest: 0.10,
  river_crossing: 0.06,
};
