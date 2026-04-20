import type { ReplayFrame, ReplayMeta, ReplayPayload } from "./types.js";
import { REPLAY_TERRAIN_FILL, REPLAY_TRIBE_STROKE } from "./replayTheme.js";

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

export function normalizeReplayPayload(raw: unknown): ReplayPayload {
  if (!isRecord(raw)) {
    throw new Error("Replay payload must be a JSON object");
  }
  const metaIn = raw.meta;
  if (!isRecord(metaIn)) {
    throw new Error("Replay payload missing meta");
  }
  if (!Array.isArray(raw.frames)) {
    throw new Error("Replay payload missing frames array");
  }

  const meta: ReplayMeta = {
    trace_path:
      typeof metaIn.trace_path === "string" ? metaIn.trace_path : undefined,
    map_kind: String(metaIn.map_kind ?? "6p-continent"),
    seed: Number(metaIn.seed ?? 0),
    match_idx:
      typeof metaIn.match_idx === "number" ? metaIn.match_idx : undefined,
    tick_final: Number(metaIn.tick_final ?? 0),
    winner: metaIn.winner,
    roster: Array.isArray(metaIn.roster)
      ? metaIn.roster.map((x) => String(x))
      : [],
    warnings: Array.isArray(metaIn.warnings)
      ? metaIn.warnings.map((x) => String(x))
      : [],
  };

  const layout = isRecord(raw.layout)
    ? (raw.layout as Record<string, readonly [number, number]>)
    : {};
  const terrain_fill = isRecord(raw.terrain_fill)
    ? (raw.terrain_fill as Record<string, string>)
    : { ...REPLAY_TERRAIN_FILL };
  const tribe_stroke = isRecord(raw.tribe_stroke)
    ? (raw.tribe_stroke as Record<string, string>)
    : { ...REPLAY_TRIBE_STROKE };

  return {
    meta,
    layout,
    terrain_fill,
    tribe_stroke,
    frames: raw.frames as ReplayFrame[],
  };
}
