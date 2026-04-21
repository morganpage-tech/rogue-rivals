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

  it("formats combat", () => {
    const s = describeReplayEvent({ kind: "combat", attacker: "orange", defender: "grey", region: "r_a", result: "attacker_wins" });
    expect(s).toContain("orange vs grey");
    expect(s).toContain("r_a");
    expect(s).toContain("attacker_wins");
  });

  it("formats dispatch_scout", () => {
    const s = describeReplayEvent({ kind: "dispatch_scout", tribe: "orange", scout_id: "s1", from: "r_a", to: "r_b" });
    expect(s).toContain("dispatched scout s1");
    expect(s).toContain("r_a");
    expect(s).toContain("r_b");
  });

  it("formats force_arrived", () => {
    const s = describeReplayEvent({ kind: "force_arrived", force_id: "f1", region_id: "r_a" });
    expect(s).toContain("f1 arrived at r_a");
  });

  it("formats scout_arrived", () => {
    const s = describeReplayEvent({ kind: "scout_arrived", scout_id: "s1", region_id: "r_a" });
    expect(s).toContain("s1 arrived at r_a");
  });

  it("formats recruited", () => {
    const s = describeReplayEvent({ kind: "recruited", tribe: "orange", tier: 2, region_id: "r_a" });
    expect(s).toContain("recruited Tier 2");
    expect(s).toContain("r_a");
  });

  it("formats built", () => {
    const s = describeReplayEvent({ kind: "built", tribe: "orange", structure: "fort", region_id: "r_a" });
    expect(s).toContain("built fort");
    expect(s).toContain("r_a");
  });

  it("formats proposal_sent", () => {
    const s = describeReplayEvent({ kind: "proposal_sent", from: "orange", proposal_kind: "nap", to: "grey" });
    expect(s).toContain("proposed nap");
    expect(s).toContain("grey");
  });

  it("formats pact_formed", () => {
    const s = describeReplayEvent({ kind: "pact_formed", parties: ["orange", "grey"], pact: "nap" });
    expect(s).toContain("Pact formed");
    expect(s).toContain("orange / grey");
    expect(s).toContain("nap");
  });

  it("formats pact_broken", () => {
    const s = describeReplayEvent({ kind: "pact_broken", breaker: "orange", parties: ["orange", "grey"] });
    expect(s).toContain("Pact broken by orange");
    expect(s).toContain("orange / grey");
  });

  it("formats pact_broken_by_move", () => {
    const s = describeReplayEvent({ kind: "pact_broken_by_move", breaker: "orange", parties: ["orange", "grey"] });
    expect(s).toContain("Pact broken by orange");
  });

  it("formats war_declared", () => {
    const s = describeReplayEvent({ kind: "war_declared", parties: ["orange", "grey"] });
    expect(s).toContain("War declared");
    expect(s).toContain("orange / grey");
  });

  it("formats caravan_delivered", () => {
    const s = describeReplayEvent({ kind: "caravan_delivered", from: "orange", to: "grey", amount: 5 });
    expect(s).toContain("Caravan delivered");
    expect(s).toContain("5");
  });

  it("formats caravan_intercepted", () => {
    const s = describeReplayEvent({ kind: "caravan_intercepted", from: "orange", to: "grey", interceptor: "brown", amount: 5 });
    expect(s).toContain("Caravan intercepted");
    expect(s).toContain("brown");
  });

  it("formats proposal_expired", () => {
    const s = describeReplayEvent({ kind: "proposal_expired", id: "p1", from: "orange", to: "grey" });
    expect(s).toContain("Proposal expired: p1");
  });

  it("formats influence_credited", () => {
    const s = describeReplayEvent({ kind: "influence_credited", tribe: "orange", amount: 3 });
    expect(s).toContain("orange gained 3 Influence");
  });

  it("formats *_failed events with reason", () => {
    const s = describeReplayEvent({ kind: "build_failed", reason: "no_influence" });
    expect(s).toContain("build_failed");
    expect(s).toContain("no_influence");
  });

  it("formats *_failed with unknown fallback", () => {
    const s = describeReplayEvent({ kind: "some_failed" });
    expect(s).toContain("unknown");
  });

  it("JSON.stringify fallback for unknown kinds", () => {
    const s = describeReplayEvent({ kind: "custom_event", foo: "bar" });
    expect(s).toContain("custom_event");
  });
});
