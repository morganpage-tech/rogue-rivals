import { describe, expect, it } from "vitest";
import { REPLAY_TERRAIN_FILL, REPLAY_TRIBE_STROKE } from "./replayTheme.js";
import { normalizeReplayPayload } from "./normalizeReplayPayload.js";

describe("normalizeReplayPayload", () => {
  it("rejects non-objects", () => {
    expect(() => normalizeReplayPayload(null)).toThrow(
      "Replay payload must be a JSON object",
    );
    expect(() => normalizeReplayPayload("x")).toThrow(
      "Replay payload must be a JSON object",
    );
  });

  it("requires meta and frames", () => {
    expect(() => normalizeReplayPayload({})).toThrow(
      "Replay payload missing meta",
    );
    expect(() =>
      normalizeReplayPayload({ meta: {}, frames: "nope" }),
    ).toThrow("Replay payload missing frames array");
  });

  it("fills defaults and coerces meta fields", () => {
    const out = normalizeReplayPayload({
      meta: {},
      frames: [],
    });
    expect(out.meta.map_kind).toBe("6p-continent");
    expect(out.meta.seed).toBe(0);
    expect(out.meta.tick_final).toBe(0);
    expect(out.meta.roster).toEqual([]);
    expect(out.meta.warnings).toEqual([]);
    expect(out.layout).toEqual({});
    expect(out.terrain_fill).toEqual(REPLAY_TERRAIN_FILL);
    expect(out.tribe_stroke).toEqual(REPLAY_TRIBE_STROKE);
    expect(out.frames).toEqual([]);
  });

  it("preserves optional meta and custom theme maps", () => {
    const out = normalizeReplayPayload({
      meta: {
        trace_path: "t.jsonl",
        map_kind: "custom",
        seed: 42,
        match_idx: 3,
        tick_final: 100,
        winner: "alpha",
        roster: ["a", "b"],
        warnings: ["w"],
      },
      layout: { r1: [1, 2] },
      terrain_fill: { land: "#fff" },
      tribe_stroke: { alpha: "#000" },
      frames: [{ tick: 0 } as never],
    });
    expect(out.meta.trace_path).toBe("t.jsonl");
    expect(out.meta.map_kind).toBe("custom");
    expect(out.meta.seed).toBe(42);
    expect(out.meta.match_idx).toBe(3);
    expect(out.meta.tick_final).toBe(100);
    expect(out.meta.winner).toBe("alpha");
    expect(out.meta.roster).toEqual(["a", "b"]);
    expect(out.meta.warnings).toEqual(["w"]);
    expect(out.layout).toEqual({ r1: [1, 2] });
    expect(out.terrain_fill).toEqual({ land: "#fff" });
    expect(out.tribe_stroke).toEqual({ alpha: "#000" });
    expect(out.frames).toEqual([{ tick: 0 }]);
  });
});
