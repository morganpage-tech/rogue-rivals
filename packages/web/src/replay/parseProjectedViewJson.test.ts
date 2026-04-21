import { describe, expect, it } from "vitest";
import { parseProjectedViewJson } from "./parseProjectedViewJson.js";

describe("parseProjectedViewJson", () => {
  it("returns null for invalid input", () => {
    expect(parseProjectedViewJson(null)).toBeNull();
    expect(parseProjectedViewJson(undefined)).toBeNull();
    expect(parseProjectedViewJson("string")).toBeNull();
    expect(parseProjectedViewJson(42)).toBeNull();
  });

  it("parses a minimal snake_case payload", () => {
    const raw = {
      tick: 3,
      for_tribe: "orange",
      visible_regions: {},
      visible_forces: [],
      visible_transits: [],
      visible_scouts: [],
      my_player_state: null,
      my_forces: [],
      my_scouts: [],
      my_caravans: [],
      inbox_new: [],
      announcements_new: [],
      pacts_involving_me: [],
      legal_order_options: [],
      tribes_alive: ["orange", "grey"],
      tick_limit: 60,
    };
    const pv = parseProjectedViewJson(raw);
    expect(pv).not.toBeNull();
    expect(pv!.tick).toBe(3);
    expect(pv!.forTribe).toBe("orange");
    expect(pv!.tribesAlive).toEqual(["orange", "grey"]);
    expect(pv!.tickLimit).toBe(60);
  });

  it("parses a camelCase payload", () => {
    const raw = {
      tick: 1,
      forTribe: "grey",
      visibleRegions: {},
      visibleForces: [],
      visibleTransits: [],
      visibleScouts: [],
      myPlayerState: null,
      myForces: [],
      myScouts: [],
      myCaravans: [],
      inboxNew: [],
      announcementsNew: [],
      pactsInvolvingMe: [],
      legalOrderOptions: [],
      tribesAlive: ["orange"],
      tickLimit: 30,
    };
    const pv = parseProjectedViewJson(raw);
    expect(pv!.forTribe).toBe("grey");
    expect(pv!.tickLimit).toBe(30);
  });

  it("parses regions with snake_case keys", () => {
    const raw = {
      tick: 0,
      for_tribe: "orange",
      visible_regions: {
        r_a: {
          id: "r_a",
          type: "plains",
          owner: "orange",
          structures: ["fort"],
          road_targets: {},
          garrison_force_id: "f1",
        },
      },
      visible_forces: [],
      visible_transits: [],
      visible_scouts: [],
      my_player_state: null,
      my_forces: [],
      my_scouts: [],
      my_caravans: [],
      inbox_new: [],
      announcements_new: [],
      pacts_involving_me: [],
      legal_order_options: [],
      tribes_alive: ["orange"],
    };
    const pv = parseProjectedViewJson(raw);
    expect(pv!.visibleRegions["r_a"]).toBeDefined();
    expect(pv!.visibleRegions["r_a"]!.type).toBe("plains");
    expect(pv!.visibleRegions["r_a"]!.owner).toBe("orange");
    expect(pv!.visibleRegions["r_a"]!.structures).toEqual(["fort"]);
    expect(pv!.visibleRegions["r_a"]!.garrisonForceId).toBe("f1");
  });

  it("parses visible forces with fuzzy tier", () => {
    const raw = {
      tick: 0,
      for_tribe: "orange",
      visible_regions: {},
      visible_forces: [{ region_id: "r_a", owner: "grey", fuzzy_tier: "warband" }],
      visible_transits: [],
      visible_scouts: [],
      my_player_state: null,
      my_forces: [],
      my_scouts: [],
      my_caravans: [],
      inbox_new: [],
      announcements_new: [],
      pacts_involving_me: [],
      legal_order_options: [],
      tribes_alive: ["orange"],
    };
    const pv = parseProjectedViewJson(raw);
    expect(pv!.visibleForces).toHaveLength(1);
    expect(pv!.visibleForces[0]!.owner).toBe("grey");
    expect(pv!.visibleForces[0]!.fuzzyTier).toBe("warband");
  });

  it("parses visible transits", () => {
    const raw = {
      tick: 0,
      for_tribe: "orange",
      visible_regions: {},
      visible_forces: [],
      visible_transits: [{
        trail_index: 2,
        observed_in_region_id: "r_a",
        owner: "grey",
        fuzzy_tier: "large_host",
        direction_from: "r_a",
        direction_to: "r_b",
      }],
      visible_scouts: [],
      my_player_state: null,
      my_forces: [],
      my_scouts: [],
      my_caravans: [],
      inbox_new: [],
      announcements_new: [],
      pacts_involving_me: [],
      legal_order_options: [],
      tribes_alive: ["orange"],
    };
    const pv = parseProjectedViewJson(raw);
    expect(pv!.visibleTransits).toHaveLength(1);
    expect(pv!.visibleTransits[0]!.trailIndex).toBe(2);
    expect(pv!.visibleTransits[0]!.fuzzyTier).toBe("large_host");
  });

  it("parses my_forces with garrison location", () => {
    const raw = {
      tick: 0,
      for_tribe: "orange",
      visible_regions: {},
      visible_forces: [],
      visible_transits: [],
      visible_scouts: [],
      my_player_state: null,
      my_forces: [{
        id: "f1",
        owner: "orange",
        tier: 2,
        location_kind: "garrison",
        location_region_id: "r_a",
        location_transit: null,
      }],
      my_scouts: [],
      my_caravans: [],
      inbox_new: [],
      announcements_new: [],
      pacts_involving_me: [],
      legal_order_options: [],
      tribes_alive: ["orange"],
    };
    const pv = parseProjectedViewJson(raw);
    expect(pv!.myForces).toHaveLength(1);
    expect(pv!.myForces[0]!.location.kind).toBe("garrison");
  });

  it("parses my_forces with transit location", () => {
    const raw = {
      tick: 0,
      for_tribe: "orange",
      visible_regions: {},
      visible_forces: [],
      visible_transits: [],
      visible_scouts: [],
      my_player_state: null,
      my_forces: [{
        id: "f1",
        owner: "orange",
        tier: 3,
        location_kind: "transit",
        location_region_id: null,
        location_transit: {
          trail_index: 1,
          direction_from: "r_a",
          direction_to: "r_b",
          ticks_remaining: 2,
        },
      }],
      my_scouts: [],
      my_caravans: [],
      inbox_new: [],
      announcements_new: [],
      pacts_involving_me: [],
      legal_order_options: [],
      tribes_alive: ["orange"],
    };
    const pv = parseProjectedViewJson(raw);
    expect(pv!.myForces[0]!.location.kind).toBe("transit");
  });

  it("parses my_player_state", () => {
    const raw = {
      tick: 0,
      for_tribe: "orange",
      visible_regions: {},
      visible_forces: [],
      visible_transits: [],
      visible_scouts: [],
      my_player_state: {
        tribe: "orange",
        influence: 10,
        reputation_penalty_expires_tick: 0,
        inbox: [],
        outstanding_proposals: [],
      },
      my_forces: [],
      my_scouts: [],
      my_caravans: [],
      inbox_new: [],
      announcements_new: [],
      pacts_involving_me: [],
      legal_order_options: [],
      tribes_alive: ["orange"],
    };
    const pv = parseProjectedViewJson(raw);
    expect(pv!.myPlayerState.influence).toBe(10);
    expect(pv!.myPlayerState.tribe).toBe("orange");
  });

  it("parses inbox messages with proposals", () => {
    const raw = {
      tick: 0,
      for_tribe: "orange",
      visible_regions: {},
      visible_forces: [],
      visible_transits: [],
      visible_scouts: [],
      my_player_state: null,
      my_forces: [],
      my_scouts: [],
      my_caravans: [],
      inbox_new: [{
        tick: 1,
        kind: "proposal",
        from_tribe: "grey",
        proposal: {
          id: "p1",
          kind: "nap",
          from_tribe: "grey",
          to_tribe: "orange",
          length_ticks: 8,
          amount_influence: 0,
          expires_tick: 4,
        },
      }],
      announcements_new: [],
      pacts_involving_me: [],
      legal_order_options: [],
      tribes_alive: ["orange"],
    };
    const pv = parseProjectedViewJson(raw);
    expect(pv!.inboxNew).toHaveLength(1);
    expect(pv!.inboxNew[0]!.kind).toBe("proposal");
    expect(pv!.inboxNew[0]!.proposal).toBeDefined();
    expect(pv!.inboxNew[0]!.proposal!.kind).toBe("nap");
  });

  it("parses legal order options", () => {
    const raw = {
      tick: 0,
      for_tribe: "orange",
      visible_regions: {},
      visible_forces: [],
      visible_transits: [],
      visible_scouts: [],
      my_player_state: null,
      my_forces: [],
      my_scouts: [],
      my_caravans: [],
      inbox_new: [],
      announcements_new: [],
      pacts_involving_me: [],
      legal_order_options: [{
        id: "move:f1:r_b",
        kind: "move",
        summary: "Move f1",
        payload: { forceId: "f1", destinationRegionId: "r_b" },
      }],
      tribes_alive: ["orange"],
    };
    const pv = parseProjectedViewJson(raw);
    expect(pv!.legalOrderOptions).toHaveLength(1);
    expect(pv!.legalOrderOptions[0]!.id).toBe("move:f1:r_b");
  });

  it("defaults my_player_state when null", () => {
    const raw = {
      tick: 0,
      for_tribe: "orange",
      visible_regions: {},
      visible_forces: [],
      visible_transits: [],
      visible_scouts: [],
      my_player_state: null,
      my_forces: [],
      my_scouts: [],
      my_caravans: [],
      inbox_new: [],
      announcements_new: [],
      pacts_involving_me: [],
      legal_order_options: [],
      tribes_alive: [],
    };
    const pv = parseProjectedViewJson(raw);
    expect(pv!.myPlayerState.tribe).toBe("orange");
    expect(pv!.myPlayerState.influence).toBe(0);
    expect(pv!.myPlayerState.inbox).toEqual([]);
  });
});
