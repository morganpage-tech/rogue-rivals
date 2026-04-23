/**
 * 6p continent schematic — mirrors `tools/v2/mapgen.py` (HTML/SVG coords only).
 */
import type { RegionId } from "@rr/shared";

export const CONTINENT_6P_REGION_LAYOUT: Record<RegionId, readonly [number, number]> = {
  r_core_foxfire_ruins: [382, 259],
  r_core_three_trails_market: [618, 259],
  r_core_moon_ford: [500, 427],
  r_border_snowpine_reach: [702, 91],
  r_border_glasswood_verge: [870, 360],
  r_border_saltfen_crossing: [702, 629],
  r_border_hillmire_gate: [298, 629],
  r_border_howling_pass: [130, 360],
  r_border_frostpass: [298, 91],
  r_arc_frosthold: [500, -178],
  r_arc_ice_shelf: [399, -77],
  r_arc_white_wastes: [601, -77],
  r_tri_hidden_grove: [1071, -144],
  r_tri_tricky_woods: [1004, -43],
  r_tri_whisper_thicket: [1138, -43],
  r_red_mirage_camp: [1071, 864],
  r_red_vast_dunes: [1004, 763],
  r_red_rare_veins: [1138, 763],
  r_br_root_cities: [500, 898],
  r_br_reeky_canopy: [399, 797],
  r_br_mire_channels: [601, 797],
  r_or_vulpgard: [-71, 864],
  r_or_windy_plains: [-4, 763],
  r_or_rocky_hills: [-138, 763],
  r_gr_middle_high_mountains: [-71, -144],
  r_gr_upper_high_mountains: [-4, -43],
  r_gr_lower_high_mountains: [-138, -43],
};

/**
 * 6p continent: short UI labels (one or two words). Ids not listed here still use
 * `regionShortName` in `formatV2.ts` (e.g. hand / replay test maps).
 */
export const REGION_DISPLAY_NAME: Partial<Record<RegionId, string>> = {
  r_core_foxfire_ruins: "Foxfire Ruins",
  r_core_three_trails_market: "Trails Market",
  r_core_moon_ford: "Moon Ford",
  r_border_snowpine_reach: "Snowpine",
  r_border_glasswood_verge: "Glasswood",
  r_border_saltfen_crossing: "Saltfen",
  r_border_hillmire_gate: "Hillmire",
  r_border_howling_pass: "Howling Pass",
  r_border_frostpass: "Frostpass",
  r_arc_frosthold: "Frosthold",
  r_arc_ice_shelf: "Ice Shelf",
  r_arc_white_wastes: "White Wastes",
  r_tri_hidden_grove: "Hidden Grove",
  r_tri_tricky_woods: "Tricky Woods",
  r_tri_whisper_thicket: "Whisper Thicket",
  r_red_mirage_camp: "Mirage Camp",
  r_red_vast_dunes: "Vast Dunes",
  r_red_rare_veins: "Rare Veins",
  r_br_root_cities: "Root Cities",
  r_br_reeky_canopy: "Reeky Canopy",
  r_br_mire_channels: "Mire Channels",
  r_or_vulpgard: "Vulpgard",
  r_or_windy_plains: "Windy Plains",
  r_or_rocky_hills: "Rocky Hills",
  r_gr_middle_high_mountains: "Middle Peaks",
  r_gr_upper_high_mountains: "Upper Peaks",
  r_gr_lower_high_mountains: "Lower Peaks",
};

/** Undirected trail edges for drawing lines (same as `_CONTINENT_6P_TRAILS`). */
export const CONTINENT_6P_TRAILS: readonly (readonly [RegionId, RegionId])[] = [
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

export function buildAdjacencyMap(
  trails: readonly (readonly [string, string])[],
): ReadonlyMap<string, readonly string[]> {
  const m = new Map<string, string[]>();
  for (const [a, b] of trails) {
    let la = m.get(a);
    if (!la) { la = []; m.set(a, la); }
    la.push(b);
    let lb = m.get(b);
    if (!lb) { lb = []; m.set(b, lb); }
    lb.push(a);
  }
  return m;
}

export const CONTINENT_6P_ADJACENCY = buildAdjacencyMap(CONTINENT_6P_TRAILS);

/** Hand-play minimal map — same coordinates as `engine2` `replayLayouts.json` → `minimal`. */
export const HAND_MINIMAL_REGION_LAYOUT: Record<string, readonly [number, number]> = {
  r_orange_plains: [0, 0],
  r_ruins_center: [300, 0],
  r_grey_mountains: [600, 0],
  r_brown_swamps: [0, 200],
  r_desert_wastes: [300, 200],
  r_red_desert: [600, 200],
};

/** Expanded hand map — same as `replayLayouts.json` → `expanded`. */
export const EXPANDED_REGION_LAYOUT: Record<string, readonly [number, number]> = {
  r_or_plains: [0, 0],
  r_gr_mountains: [1000, 0],
  r_or_forest: [200, 120],
  r_or_hills: [0, 240],
  r_gr_peaks: [800, 120],
  r_gr_gap: [1000, 240],
  r_dark_forest: [400, 120],
  r_shrine_vale: [400, 300],
  r_ruins_ctr: [600, 300],
  r_river_xing: [600, 480],
  r_br_fields: [200, 420],
  r_br_shore: [200, 600],
  r_rd_oasis: [800, 420],
  r_rd_dunes: [800, 600],
  r_br_swamps: [0, 540],
  r_rd_desert: [1000, 540],
};
