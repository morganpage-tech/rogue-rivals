import { describe, expect, it } from "vitest";
import type { ReplayFrame } from "./types.js";
import { REPLAY_TERRAIN_FILL, REPLAY_TRIBE_STROKE } from "./replayTheme.js";
import { makeLiveReplayPayload } from "./makeLiveReplayPayload.js";

function minimalFrame(tick: number): ReplayFrame {
  return {
    tick,
    label: `t${tick}`,
    orders_by_tribe: {},
    resolution_events: [],
    tick_summary: { messages: [], diplomacy: [] },
    projected_views: {},
    state: {},
  };
}

describe("makeLiveReplayPayload", () => {
  it("builds meta from last frame tick and copies layout/roster", () => {
    const frames = [minimalFrame(0), minimalFrame(5)];
    const payload = makeLiveReplayPayload(frames, {
      seed: 7,
      mapKind: "6p-continent",
      roster: ["a", "b"],
      layout: { x: [0, 0] },
      warnings: ["once"],
    });
    expect(payload.meta.seed).toBe(7);
    expect(payload.meta.map_kind).toBe("6p-continent");
    expect(payload.meta.roster).toEqual(["a", "b"]);
    expect(payload.meta.tick_final).toBe(5);
    expect(payload.meta.warnings).toEqual(["once"]);
    expect(payload.layout).toEqual({ x: [0, 0] });
    expect(payload.terrain_fill).toEqual(REPLAY_TERRAIN_FILL);
    expect(payload.tribe_stroke).toEqual(REPLAY_TRIBE_STROKE);
    expect(payload.frames).toBe(frames);
  });

  it("uses tick 0 when there are no frames", () => {
    const payload = makeLiveReplayPayload([], {
      seed: 1,
      mapKind: "m",
      roster: [],
      layout: {},
    });
    expect(payload.meta.tick_final).toBe(0);
    expect(payload.meta.warnings).toEqual([]);
  });
});
