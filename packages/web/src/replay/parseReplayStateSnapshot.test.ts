import { describe, expect, it } from "vitest";
import {
  parseReplayStateSnapshot,
  parseRegion,
  parseTrail,
  parseScout,
  parseCaravan,
  buildOmniscientProjectedViewFromState,
  parsedReplayStateFromGameState,
} from "./parseReplayStateSnapshot.js";

describe("parseReplayStateSnapshot", () => {
  it("returns null for non-object input", () => {
    expect(parseReplayStateSnapshot(null)).toBeNull();
    expect(parseReplayStateSnapshot("string")).toBeNull();
    expect(parseReplayStateSnapshot(42)).toBeNull();
  });

  it("parses a minimal state", () => {
    const raw = {
      tick: 5,
      tribes_alive: ["orange", "grey"],
      winner: null,
      regions: {},
      trails: [],
      forces: {},
      scouts: {},
      caravans: {},
      players: {},
      pacts: [],
    };
    const result = parseReplayStateSnapshot(raw);
    expect(result).not.toBeNull();
    expect(result!.tick).toBe(5);
    expect(result!.tribesAlive).toEqual(["orange", "grey"]);
    expect(result!.winner).toBeNull();
  });

  it("parses regions", () => {
    const raw = {
      tick: 0,
      regions: {
        r_a: { id: "r_a", type: "plains", owner: "orange", structures: ["fort"], road_targets: {}, garrison_force_id: "f1" },
      },
      trails: [],
      forces: {},
      scouts: {},
      caravans: {},
      players: {},
      pacts: [],
      tribes_alive: ["orange"],
    };
    const result = parseReplayStateSnapshot(raw);
    expect(result!.regions["r_a"]).toBeDefined();
    expect(result!.regions["r_a"]!.type).toBe("plains");
    expect(result!.regions["r_a"]!.owner).toBe("orange");
    expect(result!.regions["r_a"]!.structures).toEqual(["fort"]);
    expect(result!.regions["r_a"]!.garrisonForceId).toBe("f1");
  });

  it("parses trails", () => {
    const raw = {
      tick: 0,
      regions: {},
      trails: [{ index: 0, a: "r_a", b: "r_b", base_length_ticks: 2 }],
      forces: {},
      scouts: {},
      caravans: {},
      players: {},
      pacts: [],
      tribes_alive: [],
    };
    const result = parseReplayStateSnapshot(raw);
    expect(result!.trails).toHaveLength(1);
    expect(result!.trails[0]!.a).toBe("r_a");
    expect(result!.trails[0]!.baseLengthTicks).toBe(2);
  });

  it("parses forces with garrison location", () => {
    const raw = {
      tick: 0,
      regions: {},
      trails: [],
      forces: {
        f1: { id: "f1", owner: "orange", tier: 2, location_kind: "garrison", location_region_id: "r_a", location_transit: null },
      },
      scouts: {},
      caravans: {},
      players: {},
      pacts: [],
      tribes_alive: [],
    };
    const result = parseReplayStateSnapshot(raw);
    expect(result!.forces["f1"]).toBeDefined();
    expect(result!.forces["f1"]!.location.kind).toBe("garrison");
    expect(result!.forces["f1"]!.tier).toBe(2);
  });

  it("parses forces with transit location", () => {
    const raw = {
      tick: 0,
      regions: {},
      trails: [],
      forces: {
        f1: {
          id: "f1", owner: "orange", tier: 3, location_kind: "transit", location_region_id: null,
          location_transit: { trail_index: 1, direction_from: "r_a", direction_to: "r_b", ticks_remaining: 2 },
        },
      },
      scouts: {},
      caravans: {},
      players: {},
      pacts: [],
      tribes_alive: [],
    };
    const result = parseReplayStateSnapshot(raw);
    expect(result!.forces["f1"]!.location.kind).toBe("transit");
  });

  it("parses winner as single tribe", () => {
    const raw = {
      tick: 10,
      regions: {},
      trails: [],
      forces: {},
      scouts: {},
      caravans: {},
      players: {},
      pacts: [],
      tribes_alive: ["orange"],
      winner: "orange",
    };
    const result = parseReplayStateSnapshot(raw);
    expect(result!.winner).toBe("orange");
  });

  it("parses winner as array of tribes", () => {
    const raw = {
      tick: 10,
      regions: {},
      trails: [],
      forces: {},
      scouts: {},
      caravans: {},
      players: {},
      pacts: [],
      tribes_alive: ["orange", "grey"],
      winner: ["orange", "grey"],
    };
    const result = parseReplayStateSnapshot(raw);
    expect(result!.winner).toEqual(["orange", "grey"]);
  });

  it("parses pacts", () => {
    const raw = {
      tick: 0,
      regions: {},
      trails: [],
      forces: {},
      scouts: {},
      caravans: {},
      players: {},
      pacts: [{ kind: "nap", parties: ["grey", "orange"], formed_tick: 1, expires_tick: 9 }],
      tribes_alive: ["orange", "grey"],
    };
    const result = parseReplayStateSnapshot(raw);
    expect(result!.pacts).toHaveLength(1);
    expect(result!.pacts[0]!.kind).toBe("nap");
    expect(result!.pacts[0]!.parties).toEqual(["grey", "orange"]);
  });

  it("parses tickLimit override", () => {
    const raw = {
      tick: 0,
      tick_limit: 30,
      regions: {},
      trails: [],
      forces: {},
      scouts: {},
      caravans: {},
      players: {},
      pacts: [],
      tribes_alive: [],
    };
    const result = parseReplayStateSnapshot(raw);
    expect(result!.tickLimit).toBe(30);
  });
});

describe("parseRegion", () => {
  it("parses with defaults for missing fields", () => {
    const r = parseRegion({});
    expect(r.id).toBe("");
    expect(r.type).toBe("plains");
    expect(r.owner).toBeNull();
    expect(r.structures).toEqual([]);
    expect(r.garrisonForceId).toBeNull();
  });
});

describe("parseTrail", () => {
  it("parses camelCase keys", () => {
    const t = parseTrail({ index: 3, a: "r_a", b: "r_b", baseLengthTicks: 5 });
    expect(t.index).toBe(3);
    expect(t.baseLengthTicks).toBe(5);
  });
});

describe("parseScout", () => {
  it("parses arrived scout", () => {
    const s = parseScout({ id: "s1", owner: "orange", target_region_id: "r_b", location_kind: "arrived", location_region_id: "r_b", expires_tick: 5 });
    expect(s.location.kind).toBe("arrived");
  });

  it("parses transit scout", () => {
    const s = parseScout({
      id: "s1", owner: "orange", target_region_id: "r_b", location_kind: "transit",
      transit: { trail_index: 1, direction_from: "r_a", direction_to: "r_b", ticks_remaining: 2 },
    });
    expect(s.location.kind).toBe("transit");
  });
});

describe("parseCaravan", () => {
  it("parses caravan with path", () => {
    const c = parseCaravan({
      id: "c1", owner: "orange", recipient: "grey", amount_influence: 5,
      path: ["r_a", "r_b", "r_c"], current_index: 1, ticks_to_next_region: 1,
    });
    expect(c.path).toEqual(["r_a", "r_b", "r_c"]);
    expect(c.currentIndex).toBe(1);
  });
});

describe("buildOmniscientProjectedViewFromState", () => {
  it("exposes all regions as visible", () => {
    const state = parseReplayStateSnapshot({
      tick: 0,
      regions: { r_a: { id: "r_a", type: "plains", owner: null, structures: [], road_targets: {}, garrison_force_id: null } },
      trails: [],
      forces: {},
      scouts: {},
      caravans: {},
      players: {},
      pacts: [],
      tribes_alive: ["orange"],
    })!;
    const pv = buildOmniscientProjectedViewFromState(state, "orange");
    expect(pv.visibleRegions["r_a"]).toBeDefined();
    expect(pv.forTribe).toBe("orange");
    expect(pv.legalOrderOptions).toEqual([]);
  });
});

describe("parsedReplayStateFromGameState", () => {
  it("creates a shallow copy", () => {
    const state = parseReplayStateSnapshot({
      tick: 1,
      regions: {},
      trails: [],
      forces: {},
      scouts: {},
      caravans: {},
      players: {},
      pacts: [],
      tribes_alive: ["orange"],
    })!;
    const copy = parsedReplayStateFromGameState(state);
    expect(copy.tick).toBe(state.tick);
    expect(copy.tribesAlive).toEqual(state.tribesAlive);
    expect(copy.tribesAlive).not.toBe(state.tribesAlive);
  });
});
