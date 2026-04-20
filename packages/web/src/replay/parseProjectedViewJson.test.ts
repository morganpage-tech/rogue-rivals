import { describe, expect, it } from "vitest";
import { serializeProjectedViewForReplay } from "./projectedViewReplay.js";
import { parseProjectedViewJson } from "./parseProjectedViewJson.js";
import { initMatch, projectForPlayer, DEFAULT_MATCH_CONFIG, CONTINENT_6P_DEFAULT_TRIBES } from "@rr/engine2";

describe("parseProjectedViewJson", () => {
  it("round-trips JSON from serializeProjectedViewForReplay", () => {
    const state = initMatch({
      ...DEFAULT_MATCH_CONFIG,
      seed: 42,
      tribes: [...CONTINENT_6P_DEFAULT_TRIBES],
      mapPreset: "continent6p",
    });
    const v = projectForPlayer(state, "orange");
    const json = serializeProjectedViewForReplay(v);
    const back = parseProjectedViewJson(json);
    expect(back).not.toBeNull();
    expect(back!.forTribe).toBe("orange");
    expect(back!.tick).toBe(v.tick);
    expect(Object.keys(back!.visibleRegions).length).toBeGreaterThan(0);
  });
});
