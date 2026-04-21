import { describe, expect, it } from "vitest";
import { compactView } from "../src/compactView.js";

describe("compactView", () => {
  it("renders tick and tribe header", () => {
    const result = compactView({ tick: 5, for_tribe: "orange", tribes_alive: ["orange", "grey"] });
    expect(result).toContain("Tick: 5");
    expect(result).toContain("you are orange");
    expect(result).toContain("orange, grey");
  });

  it("renders player influence", () => {
    const result = compactView({
      tick: 0,
      for_tribe: "orange",
      tribes_alive: ["orange"],
      my_player_state: { influence: 42, reputation_penalty_expires_tick: 0 },
    });
    expect(result).toContain("42");
  });

  it("renders own forces with garrison location", () => {
    const result = compactView({
      tick: 0,
      for_tribe: "orange",
      tribes_alive: ["orange"],
      my_player_state: {},
      my_forces: [{
        id: "f1",
        tier: 2,
        location_kind: "garrison",
        location_region_id: "r_a",
        location_transit: null,
      }],
    });
    expect(result).toContain("f1");
    expect(result).toContain("Tier 2");
    expect(result).toContain("garrisoned at r_a");
  });

  it("renders own forces with transit location", () => {
    const result = compactView({
      tick: 0,
      for_tribe: "orange",
      tribes_alive: ["orange"],
      my_player_state: {},
      my_forces: [{
        id: "f1",
        tier: 3,
        location_kind: "transit",
        location_region_id: null,
        location_transit: { direction_from: "r_a", direction_to: "r_b", ticks_remaining: 2, trail_index: 0 },
      }],
    });
    expect(result).toContain("in transit r_a -> r_b");
    expect(result).toContain("2 ticks left");
  });

  it("renders (none) for empty forces", () => {
    const result = compactView({
      tick: 0,
      for_tribe: "orange",
      tribes_alive: ["orange"],
      my_player_state: {},
      my_forces: [],
    });
    expect(result).toContain("(none)");
  });

  it("renders visible regions", () => {
    const result = compactView({
      tick: 0,
      for_tribe: "orange",
      tribes_alive: ["orange"],
      my_player_state: {},
      my_forces: [],
      visible_regions: {
        r_a: { type: "plains", owner: "orange", structures: ["fort"], garrison_force_id: "f1" },
        r_b: { type: "mountains", owner: null, structures: [], garrison_force_id: null },
      },
    });
    expect(result).toContain("r_a");
    expect(result).toContain("plains");
    expect(result).toContain("fort");
    expect(result).toContain("r_b");
    expect(result).toContain("unclaimed");
  });

  it("renders visible foreign forces", () => {
    const result = compactView({
      tick: 0,
      for_tribe: "orange",
      tribes_alive: ["orange", "grey"],
      my_player_state: {},
      my_forces: [],
      visible_forces: [{ owner: "grey", fuzzy_tier: "warband", region_id: "r_a" }],
    });
    expect(result).toContain("grey");
    expect(result).toContain("warband");
  });

  it("renders visible foreign transits", () => {
    const result = compactView({
      tick: 0,
      for_tribe: "orange",
      tribes_alive: ["orange", "grey"],
      my_player_state: {},
      my_forces: [],
      visible_transits: [{
        owner: "grey", fuzzy_tier: "large_host",
        direction_from: "r_a", direction_to: "r_b",
        observed_in_region_id: "r_a", trail_index: 0,
      }],
    });
    expect(result).toContain("large_host");
    expect(result).toContain("r_a -> r_b");
  });

  it("renders visible foreign scouts", () => {
    const result = compactView({
      tick: 0,
      for_tribe: "orange",
      tribes_alive: ["orange", "grey"],
      my_player_state: {},
      my_forces: [],
      visible_scouts: [{ owner: "grey", region_id: "r_a" }],
    });
    expect(result).toContain("grey's scout at r_a");
  });

  it("renders pacts involving player", () => {
    const result = compactView({
      tick: 0,
      for_tribe: "orange",
      tribes_alive: ["orange", "grey"],
      my_player_state: {},
      my_forces: [],
      pacts_involving_me: [{
        kind: "nap",
        parties: ["grey", "orange"],
        formed_tick: 1,
        expires_tick: 9,
      }],
    });
    expect(result).toContain("nap");
    expect(result).toContain("formed tick 1");
  });

  it("renders inbox proposal", () => {
    const result = compactView({
      tick: 0,
      for_tribe: "orange",
      tribes_alive: ["orange", "grey"],
      my_player_state: {},
      my_forces: [],
      inbox_new: [{
        kind: "proposal",
        from_tribe: "grey",
        reputation_penalty: false,
        proposal: { id: "p1", kind: "nap", length_ticks: 8, amount_influence: 0 },
      }],
    });
    expect(result).toContain("PROPOSAL");
    expect(result).toContain("p1");
    expect(result).toContain("nap");
  });

  it("renders inbox proposal with reputation penalty", () => {
    const result = compactView({
      tick: 0,
      for_tribe: "orange",
      tribes_alive: ["orange", "grey"],
      my_player_state: {},
      my_forces: [],
      inbox_new: [{
        kind: "proposal",
        from_tribe: "grey",
        reputation_penalty: true,
        proposal: { id: "p2", kind: "trade_offer", amount_influence: 5 },
      }],
    });
    expect(result).toContain("RECENT PACT-BREAKER");
  });

  it("renders inbox message", () => {
    const result = compactView({
      tick: 0,
      for_tribe: "orange",
      tribes_alive: ["orange", "grey"],
      my_player_state: {},
      my_forces: [],
      inbox_new: [{ kind: "message", from_tribe: "grey", text: "hello" }],
    });
    expect(result).toContain('MESSAGE from grey: "hello"');
  });

  it("renders inbox scout report", () => {
    const result = compactView({
      tick: 0,
      for_tribe: "orange",
      tribes_alive: ["orange", "grey"],
      my_player_state: {},
      my_forces: [],
      inbox_new: [{ kind: "scout_report", payload: { region_id: "r_b" } }],
    });
    expect(result).toContain("SCOUT REPORT");
    expect(result).toContain("r_b");
  });

  it("renders announcements", () => {
    const result = compactView({
      tick: 0,
      for_tribe: "orange",
      tribes_alive: ["orange"],
      my_player_state: {},
      my_forces: [],
      announcements_new: [
        { kind: "pact_formed", parties: ["grey", "orange"], detail: "nap" },
        { kind: "war_declared", parties: ["grey", "red"] },
        { kind: "tribe_eliminated", parties: ["red"] },
        { kind: "victory", parties: ["orange"], condition: "last_standing" },
      ],
    });
    expect(result).toContain("PACT FORMED");
    expect(result).toContain("WAR DECLARED");
    expect(result).toContain("TRIBE ELIMINATED");
    expect(result).toContain("VICTORY");
  });

  it("renders legal order options", () => {
    const result = compactView({
      tick: 0,
      for_tribe: "orange",
      tribes_alive: ["orange"],
      my_player_state: {},
      my_forces: [],
      legal_order_options: [
        { id: "move:f1:r_b", summary: "Move f1 to r_b" },
        { id: "recruit:r_a:t1", summary: "Recruit T1 at r_a" },
      ],
    });
    expect(result).toContain("move:f1:r_b");
    expect(result).toContain("Move f1 to r_b");
  });

  it("renders pending proposals", () => {
    const result = compactView({
      tick: 0,
      for_tribe: "orange",
      tribes_alive: ["orange", "grey"],
      my_player_state: {
        outstanding_proposals: [{
          id: "p1", kind: "nap", from_tribe: "grey", length_ticks: 8, amount_influence: 0,
        }],
      },
      my_forces: [],
    });
    expect(result).toContain("Pending proposals");
    expect(result).toContain("p1");
  });

  it("renders own caravans", () => {
    const result = compactView({
      tick: 0,
      for_tribe: "orange",
      tribes_alive: ["orange", "grey"],
      my_player_state: {},
      my_forces: [],
      my_caravans: [{
        id: "c1", recipient: "grey", amount_influence: 5,
        path: ["r_a", "r_b"], current_index: 0, ticks_to_next_region: 1,
      }],
    });
    expect(result).toContain("c1");
    expect(result).toContain("grey");
  });
});
