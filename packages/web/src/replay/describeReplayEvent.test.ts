import { describe, expect, it } from "vitest";
import { describeReplayEvent } from "./describeReplayEvent.js";

describe("describeReplayEvent", () => {
  it("formats dispatch_move", () => {
    expect(
      describeReplayEvent({
        kind: "dispatch_move",
        tribe: "orange",
        force_id: "f1",
        from: "r_a",
        to: "r_b",
        ticks: 2,
      }),
    ).toContain("orange");
    expect(
      describeReplayEvent({
        kind: "dispatch_move",
        tribe: "orange",
        force_id: "f1",
        from: "r_a",
        to: "r_b",
        ticks: 2,
      }),
    ).toContain("r_a");
  });
});
