/**
 * Influence costs shared by engine and client preview — single source of truth.
 */

import type { ForceTier, StructureKind } from "./engineTypes.js";

export const FORCE_RECRUIT_COST: Record<ForceTier, number> = {
  1: 2,
  2: 5,
  3: 12,
  4: 30,
};

export const SCOUT_COST = 3;

export const STRUCTURE_COST: Record<StructureKind, number> = {
  granary: 8,
  fort: 10,
  road: 6,
  watchtower: 6,
  shrine: 12,
  forge: 15,
};
