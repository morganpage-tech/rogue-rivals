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

export function emptyResources(): Resources {
  return { T: 0, O: 0, F: 0, Rel: 0, S: 0 };
}

export function canonicalPair(a: string, b: string): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}
