import {
  CONTINENT_6P_REGION_LAYOUT,
  EXPANDED_REGION_LAYOUT,
  HAND_MINIMAL_REGION_LAYOUT,
} from "../v2/mapData.js";

/** Which authored map a spectator snapshot belongs to (mutually exclusive presets). */
export type SpectatorMapKind =
  | "hand_minimal"
  | "expanded"
  | "continent6p"
  | "unknown";

/**
 * Classify map preset from region ids. Order matches `getSpectatorMapLayout`:
 * hand_minimal and expanded win over continent markers so presets never overlap.
 */
export function getSpectatorMapKind(regionIds: readonly string[]): SpectatorMapKind {
  const s = new Set(regionIds);
  if (s.has("r_orange_plains")) return "hand_minimal";
  if (s.has("r_or_plains")) return "expanded";
  if (s.has("r_core_foxfire_ruins") || s.has("r_core_moon_ford")) return "continent6p";
  return "unknown";
}

/** True when region ids match the 6-player continent map (full `V2Map` layout). */
export function isContinent6pSpectator(regionIds: readonly string[]): boolean {
  return getSpectatorMapKind(regionIds) === "continent6p";
}

/**
 * Resolve schematic map node positions for a spectator snapshot from region ids.
 * Aligns with `packages/engine2` `replayLayouts.json` (minimal / expanded / 6p-continent).
 */
export function getSpectatorMapLayout(
  regionIds: readonly string[],
): Record<string, readonly [number, number]> | null {
  const kind = getSpectatorMapKind(regionIds);
  let base: Record<string, readonly [number, number]> | null = null;
  if (kind === "hand_minimal") {
    base = HAND_MINIMAL_REGION_LAYOUT;
  } else if (kind === "expanded") {
    base = EXPANDED_REGION_LAYOUT;
  } else if (kind === "continent6p") {
    base = CONTINENT_6P_REGION_LAYOUT as Record<string, readonly [number, number]>;
  }
  if (!base) return null;

  const out: Record<string, readonly [number, number]> = {};
  for (const id of regionIds) {
    const pt = base[id];
    if (pt) out[id] = pt;
  }
  return Object.keys(out).length > 0 ? out : null;
}
