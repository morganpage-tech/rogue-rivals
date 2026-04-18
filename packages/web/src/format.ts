import type { Resource, Tribe, Region, BuildingType } from "@rr/engine";

export const RES_LABEL: Record<Resource, string> = {
  T: "Timber",
  O: "Ore",
  F: "Forage",
  Rel: "Relic",
  S: "Scrap",
};

export const RES_SHORT: Record<Resource, string> = {
  T: "T",
  O: "O",
  F: "F",
  Rel: "Rel",
  S: "S",
};

export const REGION_LABEL: Record<Region, string> = {
  plains: "Plains",
  mountains: "Mountains",
  swamps: "Swamps",
  desert: "Desert",
  ruins: "Ruins",
};

export const REGION_RES_NAME: Record<Region, string> = {
  plains: "Timber",
  mountains: "Ore",
  swamps: "Forage",
  desert: "Relic",
  ruins: "Scrap",
};

export const TRIBE_LABEL: Record<Tribe, string> = {
  orange: "Orange",
  grey: "Grey",
  brown: "Brown",
  red: "Red",
};

export const BUILDING_LABEL: Record<BuildingType, string> = {
  shack: "Shack",
  den: "Den",
  watchtower: "Watchtower",
  forge: "Forge",
  great_hall: "Great Hall",
};

export const BUILDING_VP: Record<BuildingType, number> = {
  shack: 1,
  den: 1,
  watchtower: 2,
  forge: 2,
  great_hall: 4,
};

export function formatResourceBag(bag: Partial<Record<Resource, number>>): string {
  const parts: string[] = [];
  (Object.keys(RES_LABEL) as Resource[]).forEach((k) => {
    const v = bag[k] ?? 0;
    if (v > 0) parts.push(`${v} ${RES_SHORT[k]}`);
  });
  return parts.length ? parts.join(" + ") : "—";
}
