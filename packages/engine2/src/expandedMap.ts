import { baseTrailLength } from "./constants.js";
import { placeTribesCore } from "./handMap.js";
import type { GameState, RegionId, RegionType, Trail, Tribe } from "./types.js";

const EXP_SPEC: readonly [RegionId, RegionType][] = [
  ["r_or_plains", "plains"],
  ["r_or_forest", "forest"],
  ["r_or_hills", "mountains"],
  ["r_gr_mountains", "mountains"],
  ["r_gr_peaks", "mountains"],
  ["r_gr_gap", "plains"],
  ["r_br_swamps", "swamps"],
  ["r_br_fields", "plains"],
  ["r_br_shore", "swamps"],
  ["r_rd_desert", "desert"],
  ["r_rd_dunes", "desert"],
  ["r_rd_oasis", "plains"],
  ["r_dark_forest", "forest"],
  ["r_shrine_vale", "plains"],
  ["r_ruins_ctr", "ruins"],
  ["r_river_xing", "river_crossing"],
];

const EXP_TRAILS: readonly [RegionId, RegionId][] = [
  ["r_or_plains", "r_or_forest"],
  ["r_or_plains", "r_or_hills"],
  ["r_or_forest", "r_or_hills"],
  ["r_gr_mountains", "r_gr_peaks"],
  ["r_gr_mountains", "r_gr_gap"],
  ["r_gr_peaks", "r_gr_gap"],
  ["r_br_swamps", "r_br_fields"],
  ["r_br_swamps", "r_br_shore"],
  ["r_br_fields", "r_br_shore"],
  ["r_rd_desert", "r_rd_dunes"],
  ["r_rd_desert", "r_rd_oasis"],
  ["r_rd_dunes", "r_rd_oasis"],
  ["r_or_forest", "r_dark_forest"],
  ["r_or_hills", "r_shrine_vale"],
  ["r_gr_peaks", "r_dark_forest"],
  ["r_gr_gap", "r_ruins_ctr"],
  ["r_br_fields", "r_shrine_vale"],
  ["r_br_shore", "r_river_xing"],
  ["r_rd_oasis", "r_ruins_ctr"],
  ["r_rd_dunes", "r_river_xing"],
  ["r_dark_forest", "r_shrine_vale"],
  ["r_shrine_vale", "r_ruins_ctr"],
  ["r_ruins_ctr", "r_river_xing"],
  ["r_shrine_vale", "r_river_xing"],
];

/** Homes for the 4-tribe expanded layout (tools/v2/mapgen.py `_EXP_TRIBE_HOME`). */
const EXP_TRIBE_HOME: Partial<Record<Tribe, RegionId>> = {
  orange: "r_or_plains",
  grey: "r_gr_mountains",
  brown: "r_br_swamps",
  red: "r_rd_desert",
};

/** 16-region expanded map (`tools/v2/mapgen.py` `build_expanded_map`). */
export function buildExpandedMap(state: GameState): void {
  for (const [regionId, terrain] of EXP_SPEC) {
    state.regions[regionId] = {
      id: regionId,
      type: terrain,
      owner: null,
      structures: [],
      roadTargets: {},
      garrisonForceId: null,
    };
  }
  for (let idx = 0; idx < EXP_TRAILS.length; idx++) {
    const [a, b] = EXP_TRAILS[idx]!;
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

export function placeTribesExpanded(state: GameState, tribes: Tribe[]): void {
  const homes: Record<Tribe, RegionId> = {} as Record<Tribe, RegionId>;
  for (const t of tribes) {
    const h = EXP_TRIBE_HOME[t];
    if (!h) {
      throw new Error(`expanded map: unsupported tribe ${t} (use orange, grey, brown, red)`);
    }
    homes[t] = h;
  }
  placeTribesCore(state, tribes, homes);
}
