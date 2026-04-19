import {
  STARTING_GARRISON_TIER,
  STARTING_INFLUENCE,
  TRIBE_HOME_TERRAIN,
  baseTrailLength,
} from "./constants.js";
import { adjacentRegions } from "./graph.js";
import type {
  Force,
  GameState,
  PlayerState,
  Region,
  RegionId,
  StructureKind,
  Trail,
  Tribe,
} from "./types.js";

const HAND_MAP_SPEC: readonly [RegionId, Region["type"]][] = [
  ["r_orange_plains", "plains"],
  ["r_grey_mountains", "mountains"],
  ["r_brown_swamps", "swamps"],
  ["r_red_desert", "desert"],
  ["r_ruins_center", "ruins"],
  ["r_desert_wastes", "desert"],
];

const HAND_TRAILS: readonly [RegionId, RegionId][] = [
  ["r_orange_plains", "r_ruins_center"],
  ["r_grey_mountains", "r_ruins_center"],
  ["r_brown_swamps", "r_desert_wastes"],
  ["r_red_desert", "r_desert_wastes"],
  ["r_orange_plains", "r_brown_swamps"],
  ["r_grey_mountains", "r_red_desert"],
  ["r_ruins_center", "r_desert_wastes"],
];

const HAND_MINIMAL_HOME: Partial<Record<Tribe, RegionId>> = {
  orange: "r_orange_plains",
  grey: "r_grey_mountains",
  brown: "r_brown_swamps",
  red: "r_red_desert",
};

function handMinimalHomeRegion(tribe: Tribe): RegionId {
  const id = HAND_MINIMAL_HOME[tribe];
  if (!id) {
    throw new Error(`hand_minimal map does not define a home for ${tribe}`);
  }
  return id;
}

/** Hand-built 6-region oracle map (tools/v2/mapgen.py `build_hand_map`). */
export function buildHandMap(state: GameState): void {
  for (const [regionId, terrain] of HAND_MAP_SPEC) {
    state.regions[regionId] = {
      id: regionId,
      type: terrain,
      owner: null,
      structures: [],
      roadTargets: {},
      garrisonForceId: null,
    };
  }
  for (let idx = 0; idx < HAND_TRAILS.length; idx++) {
    const [a, b] = HAND_TRAILS[idx]!;
    const ta = state.regions[a]!.type;
    const tb = state.regions[b]!.type;
    const tr: Trail = {
      index: idx,
      a,
      b,
      baseLengthTicks: baseTrailLength(ta, tb),
    };
    state.trails.push(tr);
  }
}

/**
 * Shared placement core (tools/v2/mapgen.py `_place_tribes_core`).
 */
export function placeTribesCore(
  state: GameState,
  tribes: Tribe[],
  homeRegionByTribe: Record<Tribe, RegionId>,
  secondRegionByTribe?: Partial<Record<Tribe, RegionId>>,
): void {
  for (const tribe of tribes) {
    const homeRegionId = homeRegionByTribe[tribe];
    if (!homeRegionId) {
      throw new Error(`placeTribesCore: missing home region for ${tribe}`);
    }
    const region = state.regions[homeRegionId];
    if (!region) {
      throw new Error(`placeTribesCore: unknown home region ${homeRegionId}`);
    }
    if (region.type !== TRIBE_HOME_TERRAIN[tribe]) {
      throw new Error(`hand-map mismatch: ${tribe} home ${homeRegionId} is ${region.type}`);
    }
    region.owner = tribe;

    const forceId = `f_${tribe}_${String(state.nextForceIdx).padStart(3, "0")}`;
    state.nextForceIdx += 1;

    const force: Force = {
      id: forceId,
      owner: tribe,
      tier: STARTING_GARRISON_TIER,
      location: { kind: "garrison", regionId: homeRegionId },
    };
    state.forces[forceId] = force;
    region.garrisonForceId = forceId;

    const ps: PlayerState = {
      tribe,
      influence: STARTING_INFLUENCE[tribe],
      reputationPenaltyExpiresTick: 0,
      inbox: [],
      outstandingProposals: [],
    };
    state.players[tribe] = ps;
    state.victoryCounters[tribe] = {};
  }

  state.tribesAlive = [...tribes];

  if (secondRegionByTribe === undefined) {
    for (const tribe of [...tribes].sort((a, b) => a.localeCompare(b))) {
      const homeRegionId = homeRegionByTribe[tribe]!;
      const adj = adjacentRegions(state, homeRegionId);
      let adjacentClaim: RegionId | null = null;
      for (const cand of adj) {
        const candRegion = state.regions[cand];
        if (candRegion?.owner === null) {
          adjacentClaim = cand;
          break;
        }
      }
      if (adjacentClaim !== null) {
        state.regions[adjacentClaim]!.owner = tribe;
      } else {
        state.announcements.push({
          tick: 0,
          kind: "starting_adjacent_unavailable",
          parties: [tribe],
          detail: homeRegionId,
        });
      }
    }
  } else {
    for (const tribe of tribes) {
      const homeRegionId = homeRegionByTribe[tribe]!;
      const adjacentClaim = secondRegionByTribe[tribe];
      if (adjacentClaim === undefined) {
        state.announcements.push({
          tick: 0,
          kind: "starting_adjacent_unavailable",
          parties: [tribe],
          detail: homeRegionId,
        });
        continue;
      }
      if (!state.regions[adjacentClaim]) {
        throw new Error(`unknown authored second region ${adjacentClaim} for tribe ${tribe}`);
      }
      if (!adjacentRegions(state, homeRegionId).includes(adjacentClaim)) {
        throw new Error(
          `authored second region ${adjacentClaim} is not adjacent to home ${homeRegionId} for ${tribe}`,
        );
      }
      const adjacentRegion = state.regions[adjacentClaim]!;
      if (adjacentRegion.owner !== null && adjacentRegion.owner !== tribe) {
        throw new Error(
          `authored second region ${adjacentClaim} for ${tribe} is already owned by ${adjacentRegion.owner}`,
        );
      }
      adjacentRegion.owner = tribe;
    }
  }

  if (tribes.includes("grey")) {
    const greyHome = state.regions[homeRegionByTribe.grey!]!;
    greyHome.structures.push("fort" as StructureKind);
  }
  if (tribes.includes("brown")) {
    const brownHomeId = homeRegionByTribe.brown!;
    const brownHome = state.regions[brownHomeId]!;
    brownHome.structures.push("road" as StructureKind);
    const adj = adjacentRegions(state, brownHomeId);
    if (adj.length > 0) {
      const target = adj[0]!;
      brownHome.roadTargets[brownHome.structures.length - 1] = target;
    }
  }
}

export function placeTribes(state: GameState, tribes: Tribe[]): void {
  const homes: Record<Tribe, RegionId> = {} as Record<Tribe, RegionId>;
  for (const t of tribes) {
    homes[t] = handMinimalHomeRegion(t);
  }
  placeTribesCore(state, tribes, homes);
}
