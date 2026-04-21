import { describe, expect, it } from "vitest";
import { normalizeProjectedViewForLlm } from "../src/normalizeProjectedViewForLlm.js";

describe("normalizeProjectedViewForLlm", () => {
  it("converts camelCase keys to snake_case", () => {
    const result = normalizeProjectedViewForLlm({ myForces: [], myScouts: [] });
    expect(result).toHaveProperty("my_forces");
    expect(result).toHaveProperty("my_scouts");
    expect(result).not.toHaveProperty("myForces");
  });

  it("flattens force garrison location", () => {
    const view = {
      tick: 0,
      forTribe: "orange",
      myForces: [{
        id: "f1",
        owner: "orange",
        tier: 2,
        location: { kind: "garrison", regionId: "r_a" },
      }],
      myScouts: [],
    };
    const result = normalizeProjectedViewForLlm(view);
    const forces = result.my_forces as Record<string, unknown>[];
    expect(forces[0]).toHaveProperty("location_kind", "garrison");
    expect(forces[0]).toHaveProperty("location_region_id", "r_a");
    expect(forces[0]).not.toHaveProperty("location");
  });

  it("flattens force transit location", () => {
    const view = {
      tick: 0,
      forTribe: "orange",
      myForces: [{
        id: "f1",
        owner: "orange",
        tier: 3,
        location: {
          kind: "transit",
          trailIndex: 1,
          directionFrom: "r_a",
          directionTo: "r_b",
          ticksRemaining: 2,
        },
      }],
      myScouts: [],
    };
    const result = normalizeProjectedViewForLlm(view);
    const forces = result.my_forces as Record<string, unknown>[];
    expect(forces[0]).toHaveProperty("location_kind", "transit");
    expect(forces[0]).toHaveProperty("location_region_id", null);
    const transit = forces[0]!.location_transit as Record<string, unknown>;
    expect(transit.trail_index).toBe(1);
    expect(transit.ticks_remaining).toBe(2);
  });

  it("flattens scout arrived location", () => {
    const view = {
      tick: 0,
      forTribe: "orange",
      myForces: [],
      myScouts: [{
        id: "s1",
        owner: "orange",
        targetRegionId: "r_b",
        location: { kind: "arrived", regionId: "r_b", expiresTick: 5 },
      }],
    };
    const result = normalizeProjectedViewForLlm(view);
    const scouts = result.my_scouts as Record<string, unknown>[];
    expect(scouts[0]).toHaveProperty("location_kind", "arrived");
    expect(scouts[0]).toHaveProperty("location_region_id", "r_b");
    expect(scouts[0]).toHaveProperty("expires_tick", 5);
  });

  it("flattens scout transit location", () => {
    const view = {
      tick: 0,
      forTribe: "orange",
      myForces: [],
      myScouts: [{
        id: "s1",
        owner: "orange",
        targetRegionId: "r_b",
        location: {
          kind: "transit",
          trailIndex: 0,
          directionFrom: "r_a",
          directionTo: "r_b",
          ticksRemaining: 1,
        },
      }],
    };
    const result = normalizeProjectedViewForLlm(view);
    const scouts = result.my_scouts as Record<string, unknown>[];
    expect(scouts[0]).toHaveProperty("location_kind", "transit");
    expect(scouts[0]!.transit).toBeDefined();
  });

  it("lifts from to from_tribe in inbox messages", () => {
    const view = {
      tick: 0,
      forTribe: "orange",
      myForces: [],
      myScouts: [],
      inboxNew: [{ kind: "message", from: "grey", text: "hi" }],
    };
    const result = normalizeProjectedViewForLlm(view);
    const inbox = result.inbox_new as Record<string, unknown>[];
    expect(inbox[0]).toHaveProperty("from_tribe", "grey");
    expect(inbox[0]).not.toHaveProperty("from");
  });

  it("lifts proposal from/to to from_tribe/to_tribe in inbox", () => {
    const view = {
      tick: 0,
      forTribe: "orange",
      myForces: [],
      myScouts: [],
      inboxNew: [{
        kind: "proposal",
        from: "grey",
        proposal: { from: "grey", to: "orange", id: "p1", kind: "nap" },
      }],
    };
    const result = normalizeProjectedViewForLlm(view);
    const inbox = result.inbox_new as Record<string, unknown>[];
    const proposal = (inbox[0] as Record<string, unknown>).proposal as Record<string, unknown>;
    expect(proposal).toHaveProperty("from_tribe");
    expect(proposal).toHaveProperty("to_tribe");
  });

  it("deep clones input (no mutation)", () => {
    const input = { tick: 0, forTribe: "orange", myForces: [], myScouts: [] };
    const original = JSON.stringify(input);
    normalizeProjectedViewForLlm(input);
    expect(JSON.stringify(input)).toBe(original);
  });

  it("handles already-flat forces (idempotent for location_kind)", () => {
    const view = {
      tick: 0,
      for_tribe: "orange",
      my_forces: [{
        id: "f1",
        owner: "orange",
        tier: 2,
        location_kind: "garrison",
        location_region_id: "r_a",
        location_transit: null,
      }],
      my_scouts: [],
    };
    const result = normalizeProjectedViewForLlm(view);
    const forces = result.my_forces as Record<string, unknown>[];
    expect(forces[0]).toHaveProperty("location_kind", "garrison");
  });
});
