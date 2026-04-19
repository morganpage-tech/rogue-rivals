import { baseTrailLength } from "./constants.js";
import { placeTribesCore } from "./handMap.js";
import type { GameState, RegionId, RegionType, Trail, Tribe } from "./types.js";

/** Default wedge order (tools/v2/mapgen.py `CONTINENT_6P_DEFAULT_TRIBES`). */
export const CONTINENT_6P_DEFAULT_TRIBES: readonly Tribe[] = [
  "arctic",
  "tricoloured",
  "red",
  "brown",
  "orange",
  "grey",
];

const CONTINENT_6P_SPEC: readonly [RegionId, RegionType][] = [
  ["r_arc_frosthold", "mountains"],
  ["r_arc_ice_shelf", "plains"],
  ["r_arc_white_wastes", "mountains"],
  ["r_tri_hidden_grove", "forest"],
  ["r_tri_tricky_woods", "forest"],
  ["r_tri_whisper_thicket", "forest"],
  ["r_red_mirage_camp", "desert"],
  ["r_red_vast_dunes", "desert"],
  ["r_red_rare_veins", "ruins"],
  ["r_br_root_cities", "swamps"],
  ["r_br_reeky_canopy", "swamps"],
  ["r_br_mire_channels", "swamps"],
  ["r_or_vulpgard", "plains"],
  ["r_or_windy_plains", "plains"],
  ["r_or_rocky_hills", "mountains"],
  ["r_gr_middle_high_mountains", "mountains"],
  ["r_gr_upper_high_mountains", "mountains"],
  ["r_gr_lower_high_mountains", "mountains"],
  ["r_border_snowpine_reach", "forest"],
  ["r_border_glasswood_verge", "plains"],
  ["r_border_saltfen_crossing", "river_crossing"],
  ["r_border_hillmire_gate", "plains"],
  ["r_border_howling_pass", "mountains"],
  ["r_border_frostpass", "mountains"],
  ["r_core_foxfire_ruins", "ruins"],
  ["r_core_three_trails_market", "plains"],
  ["r_core_moon_ford", "river_crossing"],
];

const CONTINENT_6P_TRAILS: readonly [RegionId, RegionId][] = [
  ["r_arc_frosthold", "r_arc_ice_shelf"],
  ["r_arc_frosthold", "r_arc_white_wastes"],
  ["r_arc_ice_shelf", "r_arc_white_wastes"],
  ["r_tri_hidden_grove", "r_tri_tricky_woods"],
  ["r_tri_hidden_grove", "r_tri_whisper_thicket"],
  ["r_tri_tricky_woods", "r_tri_whisper_thicket"],
  ["r_red_mirage_camp", "r_red_vast_dunes"],
  ["r_red_mirage_camp", "r_red_rare_veins"],
  ["r_red_vast_dunes", "r_red_rare_veins"],
  ["r_br_root_cities", "r_br_reeky_canopy"],
  ["r_br_root_cities", "r_br_mire_channels"],
  ["r_br_reeky_canopy", "r_br_mire_channels"],
  ["r_or_vulpgard", "r_or_windy_plains"],
  ["r_or_vulpgard", "r_or_rocky_hills"],
  ["r_or_windy_plains", "r_or_rocky_hills"],
  ["r_gr_middle_high_mountains", "r_gr_upper_high_mountains"],
  ["r_gr_middle_high_mountains", "r_gr_lower_high_mountains"],
  ["r_gr_upper_high_mountains", "r_gr_lower_high_mountains"],
  ["r_arc_ice_shelf", "r_border_snowpine_reach"],
  ["r_tri_whisper_thicket", "r_border_snowpine_reach"],
  ["r_tri_tricky_woods", "r_border_glasswood_verge"],
  ["r_red_rare_veins", "r_border_glasswood_verge"],
  ["r_red_vast_dunes", "r_border_saltfen_crossing"],
  ["r_br_mire_channels", "r_border_saltfen_crossing"],
  ["r_br_reeky_canopy", "r_border_hillmire_gate"],
  ["r_or_rocky_hills", "r_border_hillmire_gate"],
  ["r_or_windy_plains", "r_border_howling_pass"],
  ["r_gr_lower_high_mountains", "r_border_howling_pass"],
  ["r_gr_upper_high_mountains", "r_border_frostpass"],
  ["r_arc_white_wastes", "r_border_frostpass"],
  ["r_arc_white_wastes", "r_core_foxfire_ruins"],
  ["r_red_rare_veins", "r_core_foxfire_ruins"],
  ["r_br_mire_channels", "r_core_foxfire_ruins"],
  ["r_gr_upper_high_mountains", "r_core_foxfire_ruins"],
  ["r_tri_tricky_woods", "r_core_three_trails_market"],
  ["r_red_vast_dunes", "r_core_three_trails_market"],
  ["r_or_rocky_hills", "r_core_three_trails_market"],
  ["r_gr_lower_high_mountains", "r_core_three_trails_market"],
  ["r_arc_ice_shelf", "r_core_moon_ford"],
  ["r_tri_whisper_thicket", "r_core_moon_ford"],
  ["r_br_reeky_canopy", "r_core_moon_ford"],
  ["r_or_windy_plains", "r_core_moon_ford"],
];

const CONTINENT_6P_TRIBE_HOME: Record<Tribe, RegionId> = {
  arctic: "r_arc_frosthold",
  tricoloured: "r_tri_hidden_grove",
  red: "r_red_mirage_camp",
  brown: "r_br_root_cities",
  orange: "r_or_vulpgard",
  grey: "r_gr_middle_high_mountains",
};

const CONTINENT_6P_SECOND_REGION: Record<Tribe, RegionId> = {
  arctic: "r_arc_ice_shelf",
  tricoloured: "r_tri_tricky_woods",
  red: "r_red_vast_dunes",
  brown: "r_br_reeky_canopy",
  orange: "r_or_windy_plains",
  grey: "r_gr_upper_high_mountains",
};

/** 27-region 6-player continent (`tools/v2/mapgen.py` `build_continent_map_6p`). */
export function buildContinentMap6p(state: GameState): void {
  for (const [regionId, terrain] of CONTINENT_6P_SPEC) {
    state.regions[regionId] = {
      id: regionId,
      type: terrain,
      owner: null,
      structures: [],
      roadTargets: {},
      garrisonForceId: null,
    };
  }
  for (let idx = 0; idx < CONTINENT_6P_TRAILS.length; idx++) {
    const [a, b] = CONTINENT_6P_TRAILS[idx]!;
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
 * Place tribes with authored second regions (`tools/v2/mapgen.py`
 * `place_tribes_continent_6p`).
 */
export function placeTribesContinent6p(state: GameState, tribes?: readonly Tribe[]): void {
  const roster = tribes ? [...tribes] : [...CONTINENT_6P_DEFAULT_TRIBES];
  const homes: Record<Tribe, RegionId> = {} as Record<Tribe, RegionId>;
  const second: Partial<Record<Tribe, RegionId>> = {};
  for (const t of roster) {
    const h = CONTINENT_6P_TRIBE_HOME[t];
    if (!h) {
      throw new Error(`continent6p: no home for tribe ${t}`);
    }
    homes[t] = h;
    second[t] = CONTINENT_6P_SECOND_REGION[t]!;
  }
  placeTribesCore(state, roster, homes, second);
}
