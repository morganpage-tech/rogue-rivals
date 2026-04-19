import type { GameState, RegionId, Trail } from "./types.js";

export function trailBetween(
  state: GameState,
  a: RegionId,
  b: RegionId,
): Trail | undefined {
  for (const t of state.trails) {
    if ((t.a === a && t.b === b) || (t.a === b && t.b === a)) {
      return t;
    }
  }
  return undefined;
}

export function adjacentRegions(state: GameState, regionId: RegionId): RegionId[] {
  const out: RegionId[] = [];
  for (const tr of state.trails) {
    if (tr.a === regionId) out.push(tr.b);
    else if (tr.b === regionId) out.push(tr.a);
  }
  return [...new Set(out)].sort((x, y) => x.localeCompare(y));
}
