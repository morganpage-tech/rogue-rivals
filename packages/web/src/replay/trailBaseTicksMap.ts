import type { ParsedReplayState } from "./parseReplayStateSnapshot.js";

export function trailBaseTicksMap(state: ParsedReplayState): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of state.trails) {
    const key = t.a < t.b ? `${t.a}|${t.b}` : `${t.b}|${t.a}`;
    m.set(key, t.baseLengthTicks);
  }
  return m;
}
