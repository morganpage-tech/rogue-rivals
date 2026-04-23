import { describe, expect, it } from "vitest";
import { initMatch, tick, projectForPlayer, projectForSpectator } from "../src/index.js";
import type { GameState, OrderPacket, Tribe } from "../src/types.js";

function handMinimalState(): GameState {
  return initMatch({
    seed: 42,
    rulesVersion: "v2.0",
    tribes: ["orange", "grey", "brown", "red"],
    mapPreset: "hand_minimal",
    regionCount: 20,
    tickLimit: 60,
    victorySustainTicks: 3,
    napDefaultLength: 8,
    sharedVisionDefaultLength: 5,
    caravanTravelTicks: 2,
  });
}

function emptyPackets(state: GameState): Record<Tribe, OrderPacket> {
  return Object.fromEntries(
    state.tribesAlive.map((t) => [t, { tribe: t, tick: state.tick, orders: [] }]),
  ) as Record<Tribe, OrderPacket>;
}

describe("projectForPlayer", () => {
  it("returns correct tribe and tick in projected view", () => {
    const state = handMinimalState();
    const pv = projectForPlayer(state, "orange");
    expect(pv.forTribe).toBe("orange");
    expect(pv.tick).toBe(0);
  });

  it("sees own regions and their adjacent regions", () => {
    const state = handMinimalState();
    const pv = projectForPlayer(state, "orange");
    const ownedRegions = Object.keys(state.regions).filter(
      (rid) => state.regions[rid]!.owner === "orange",
    );
    for (const rid of ownedRegions) {
      expect(pv.visibleRegions[rid]).toBeDefined();
    }
  });

  it("includes own forces in myForces", () => {
    const state = handMinimalState();
    const pv = projectForPlayer(state, "orange");
    const ownForces = Object.values(state.forces).filter((f) => f.owner === "orange");
    expect(pv.myForces).toHaveLength(ownForces.length);
  });

  it("excludes own forces from visibleForces", () => {
    const state = handMinimalState();
    const pv = projectForPlayer(state, "orange");
    expect(pv.visibleForces.every((f) => f.owner !== "orange")).toBe(true);
  });

  it("includes legal order options", () => {
    const state = handMinimalState();
    const pv = projectForPlayer(state, "orange");
    expect(pv.legalOrderOptions.length).toBeGreaterThan(0);
  });

  it("legal order options include move options for own garrisoned forces", () => {
    const state = handMinimalState();
    const pv = projectForPlayer(state, "orange");
    const moveOpts = pv.legalOrderOptions.filter((o) => o.kind === "move");
    expect(moveOpts.length).toBeGreaterThan(0);
  });

  it("legal order options only include proposals to visible tribes", () => {
    const state = handMinimalState();
    const pv = projectForPlayer(state, "orange");
    const gatedOpts = pv.legalOrderOptions.filter(
      (o) => o.kind === "propose" && (o.id.startsWith("propose:nap:") || o.id.startsWith("propose:shared_vision:") || o.id.startsWith("propose:trade_offer:")),
    );
    const targets = gatedOpts.map((o) => {
      const match = o.id.match(/^propose:\w+:(\w+)/);
      return match ? match[1] : null;
    });
    expect(targets).toContain("brown");
    expect(targets).toContain("grey");
    expect(targets).not.toContain("red");
  });

  it("declare_war requires visibility", () => {
    const state = handMinimalState();
    const pv = projectForPlayer(state, "orange");
    const warOpts = pv.legalOrderOptions.filter((o) => o.id.startsWith("propose:declare_war:"));
    const warTargets = warOpts.map((o) => {
      const match = o.id.match(/^propose:declare_war:(\w+)/);
      return match ? match[1] : null;
    });
    expect(warTargets).toContain("brown");
    expect(warTargets).toContain("grey");
    expect(warTargets).not.toContain("red");
  });

  it("includes tribesAlive", () => {
    const state = handMinimalState();
    const pv = projectForPlayer(state, "orange");
    expect(pv.tribesAlive).toEqual(state.tribesAlive);
  });

  it("returns projected views from tick result", () => {
    const state = handMinimalState();
    const result = tick(state, emptyPackets(state));
    for (const t of state.tribesAlive) {
      const pv = result.projectedViews[t];
      expect(pv).toBeDefined();
      expect(pv.forTribe).toBe(t);
      expect(pv.tick).toBe(1);
    }
  });

  it("tick result projected views have valid structure", () => {
    const state = handMinimalState();
    const result = tick(state, emptyPackets(state));
    const pv = result.projectedViews["orange"]!;
    expect(pv.visibleRegions).toBeDefined();
    expect(pv.myPlayerState).toBeDefined();
    expect(pv.myPlayerState.influence).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(pv.legalOrderOptions)).toBe(true);
  });
});

describe("projectForSpectator", () => {
  it("returns all regions", () => {
    const state = handMinimalState();
    const sv = projectForSpectator(state);
    expect(Object.keys(sv.regions)).toEqual(Object.keys(state.regions));
  });

  it("returns exact tiers for forces (not fuzzy)", () => {
    const state = handMinimalState();
    const sv = projectForSpectator(state);
    for (const fid of Object.keys(state.forces)) {
      const sf = sv.forces[fid];
      expect(sf).toBeDefined();
      expect(sf!.tier).toBe(state.forces[fid]!.tier);
    }
  });

  it("returns all tribes alive", () => {
    const state = handMinimalState();
    const sv = projectForSpectator(state);
    expect(sv.tribesAlive).toEqual(state.tribesAlive);
  });

  it("returns player influence", () => {
    const state = handMinimalState();
    const sv = projectForSpectator(state);
    for (const tribe of state.tribesAlive) {
      expect(sv.players[tribe]).toBeDefined();
      expect(sv.players[tribe]!.influence).toBe(state.players[tribe]!.influence);
    }
  });

  it("accepts resolution events", () => {
    const state = handMinimalState();
    const events = [{ kind: "test_event" }];
    const sv = projectForSpectator(state, events);
    expect(sv.resolutionEvents).toHaveLength(1);
    expect(sv.resolutionEvents[0]!.kind).toBe("test_event");
  });

  it("accepts tickLimit override", () => {
    const state = handMinimalState();
    const sv = projectForSpectator(state, [], { tickLimit: 30 });
    expect(sv.tickLimit).toBe(30);
  });

  it("defaults tickLimit to DEFAULT_TICK_LIMIT", () => {
    const state = handMinimalState();
    const sv = projectForSpectator(state);
    expect(sv.tickLimit).toBe(60);
  });

  it("winner is null at init", () => {
    const state = handMinimalState();
    const sv = projectForSpectator(state);
    expect(sv.winner).toBeNull();
  });
});
