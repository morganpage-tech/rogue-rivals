/** Types and constants aligned with RULES.md v0.7.3 */

export type Tribe = "orange" | "grey" | "brown" | "red";
export type Region = "plains" | "mountains" | "swamps" | "desert" | "ruins";
export type Resource = "T" | "O" | "F" | "Rel" | "S";
export type BuildingType = "shack" | "den" | "watchtower" | "forge" | "great_hall";

export type Resources = Record<Resource, number>;

export const RES_KEYS: readonly Resource[] = ["T", "O", "F", "Rel", "S"] as const;
export const REGION_KEYS: readonly Region[] = [
  "plains",
  "mountains",
  "swamps",
  "desert",
  "ruins",
] as const;

export const TRIBE_HOME: Record<Tribe, { region: Region; resource: Resource }> = {
  orange: { region: "plains", resource: "T" },
  grey: { region: "mountains", resource: "O" },
  brown: { region: "swamps", resource: "F" },
  red: { region: "desert", resource: "Rel" },
};

export const REGION_TO_RES: Record<Region, Resource> = {
  plains: "T",
  mountains: "O",
  swamps: "F",
  desert: "Rel",
  ruins: "S",
};

export const BUILD_ORDER: readonly BuildingType[] = [
  "shack",
  "den",
  "watchtower",
  "forge",
  "great_hall",
] as const;

export const VP_WIN_THRESHOLD = 8;
export const MAX_ROUNDS = 15;

/**
 * v0.7.4: how many end-of-round ticks an ambush survives before expiring.
 * Bumped from 1 (v0.7.3.1) to 2 after the raider A/B experiment showed this
 * is the only ambush-knob that meaningfully lifts raider hit rate without
 * distorting other archetypes' win distributions.
 * See: simulations/raider_ab/COMPARISON_raider_ab.md
 */
export const AMBUSH_PERSIST_ROUNDS = 2;
export const AMBUSH_COST_S = 1;
export const AMBUSH_YIELD_MULT = 2;

export function emptyResources(): Resources {
  return { T: 0, O: 0, F: 0, Rel: 0, S: 0 };
}

export function canonicalPair(a: string, b: string): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}
