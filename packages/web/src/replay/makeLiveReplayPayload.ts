import type { ReplayFrame, ReplayPayload } from "./types.js";
import { REPLAY_TERRAIN_FILL, REPLAY_TRIBE_STROKE } from "./replayTheme.js";

export function makeLiveReplayPayload(
  frames: ReplayFrame[],
  opts: {
    seed: number;
    mapKind: string;
    roster: string[];
    layout: Record<string, readonly [number, number]>;
    warnings?: string[];
  },
): ReplayPayload {
  const lastTick = frames.length ? frames[frames.length - 1]!.tick : 0;
  return {
    meta: {
      map_kind: opts.mapKind,
      seed: opts.seed,
      roster: opts.roster.map(String),
      tick_final: lastTick,
      warnings: opts.warnings ?? [],
    },
    layout: opts.layout,
    terrain_fill: { ...REPLAY_TERRAIN_FILL },
    tribe_stroke: { ...REPLAY_TRIBE_STROKE },
    frames,
  };
}
