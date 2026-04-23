import type { Region, RegionType, StructureKind } from "@rr/shared";

export const TERRAIN_CLASS: Record<string, string> = {
  plains: "terrain-plains",
  mountains: "terrain-mountains",
  swamps: "terrain-swamps",
  desert: "terrain-desert",
  ruins: "terrain-ruins",
  forest: "terrain-forest",
  river_crossing: "terrain-river",
};

export const TERRAIN_DISPLAY: Record<string, string> = {
  plains: "Plains",
  mountains: "Mtns",
  swamps: "Swamps",
  desert: "Desert",
  ruins: "Ruins",
  forest: "Forest",
  river_crossing: "River X",
};

export const REGION_PRODUCTION: Record<RegionType, number> = {
  plains: 2,
  mountains: 2,
  swamps: 1,
  desert: 1,
  ruins: 3,
  forest: 1,
  river_crossing: 2,
};

export const STRUCTURE_PRODUCTION_BONUS: Partial<Record<StructureKind, number>> = {
  granary: 1,
  shrine: 1,
};

export const CULTURAL_SHRINE_REQUIREMENT = 4;
export const TERRITORIAL_DOMINANCE_FRACTION = 0.6;
export const ECONOMIC_SUPREMACY_FRACTION = 0.5;

export const WHEEL_FACTOR = 1.12;

export function regionProduction(r: Region): number {
  let total = REGION_PRODUCTION[r.type] ?? 0;
  for (const s of r.structures) {
    total += STRUCTURE_PRODUCTION_BONUS[s] ?? 0;
  }
  return total;
}
