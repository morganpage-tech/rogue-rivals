import { describe, expect, it } from "vitest";
import { initMatch, tick, checkVictory } from "../src/index.js";
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

function packetsWithOrders(state: GameState, ordersByTribe: Partial<Record<Tribe, OrderPacket["orders"]>>): Record<Tribe, OrderPacket> {
  return Object.fromEntries(
    state.tribesAlive.map((t) => [
      t,
      { tribe: t, tick: state.tick, orders: ordersByTribe[t] ?? [] },
    ]),
  ) as Record<Tribe, OrderPacket>;
}

describe("tick combat", () => {
  it("dispatch_move creates a transit force and movement events", () => {
    const state = handMinimalState();
    const orangeForce = Object.values(state.forces).find((f) => f.owner === "orange")!;
    const origin = (orangeForce.location as { regionId: string }).regionId;

    const adjacents = Object.keys(state.regions).filter((rid) => {
      return state.trails.some(
        (t) =>
          (t.a === origin && t.b === rid) || (t.b === origin && t.a === rid),
      );
    });
    if (adjacents.length === 0) return;

    const moveOrder = { kind: "move" as const, forceId: orangeForce.id, destinationRegionId: adjacents[0]! };
    const result = tick(state, packetsWithOrders(state, { orange: [moveOrder] }));

    const dispatchEvents = result.events.filter((e) => e.kind === "dispatch_move");
    expect(dispatchEvents.length).toBeGreaterThan(0);
    expect((dispatchEvents[0] as { force_id: string }).force_id).toBe(orangeForce.id);

    const forceAfter = state.forces[orangeForce.id];
    expect(forceAfter).toBeDefined();
    expect(forceAfter!.location.kind).toBe("transit");
  });

  it("move_failed for invalid force", () => {
    const state = handMinimalState();
    const moveOrder = { kind: "move" as const, forceId: "nonexistent", destinationRegionId: "r_x" };
    const result = tick(state, packetsWithOrders(state, { orange: [moveOrder] }));
    expect(result.events.some((e) => e.kind === "move_failed")).toBe(true);
  });

  it("move_failed for no trail", () => {
    const state = handMinimalState();
    const orangeForce = Object.values(state.forces).find((f) => f.owner === "orange")!;
    const moveOrder = { kind: "move" as const, forceId: orangeForce.id, destinationRegionId: "nonexistent_region" };
    const result = tick(state, packetsWithOrders(state, { orange: [moveOrder] }));
    expect(result.events.some((e) => e.kind === "move_failed")).toBe(true);
  });
});

describe("tick diplomacy", () => {
  it("declare_war creates a war pact", () => {
    const state = handMinimalState();
    const proposeOrder = {
      kind: "propose" as const,
      proposal: {
        id: "pending",
        kind: "declare_war" as const,
        from: "orange" as const,
        to: "grey" as const,
        lengthTicks: 0,
        amountInfluence: 0,
        expiresTick: 0,
      },
    };

    const result = tick(state, packetsWithOrders(state, { orange: [proposeOrder] }));
    expect(result.events.some((e) => e.kind === "war_declared")).toBe(true);
    expect(state.pacts.some((p) => p.kind === "war" && p.parties.includes("orange") && p.parties.includes("grey"))).toBe(true);
    expect(state.announcements.some((a) => a.kind === "war_declared")).toBe(true);
  });

  it("break_pact removes NAP and applies reputation penalty", () => {
    const state = handMinimalState();
    state.pacts.push({
      kind: "nap",
      parties: ["grey", "orange"],
      formedTick: 0,
      expiresTick: 100,
    });

    const breakOrder = {
      kind: "propose" as const,
      proposal: {
        id: "pending",
        kind: "break_pact" as const,
        from: "orange" as const,
        to: "grey" as const,
        lengthTicks: 0,
        amountInfluence: 0,
        expiresTick: 0,
      },
    };

    const result = tick(state, packetsWithOrders(state, { orange: [breakOrder] }));
    expect(result.events.some((e) => e.kind === "pact_broken")).toBe(true);
    expect(state.pacts.some((p) => p.kind === "nap" && p.parties.includes("orange"))).toBe(false);
    expect(state.players["orange"]!.reputationPenaltyExpiresTick).toBeGreaterThan(0);
  });

  it("shared_vision proposal is sent when proposer can see target", () => {
    const state = handMinimalState();
    const proposeOrder = {
      kind: "propose" as const,
      proposal: {
        id: "pending",
        kind: "shared_vision" as const,
        from: "orange" as const,
        to: "brown" as const,
        lengthTicks: 5,
        amountInfluence: 0,
        expiresTick: 0,
      },
    };

    const result = tick(state, packetsWithOrders(state, { orange: [proposeOrder] }));
    expect(result.events.some((e) => e.kind === "proposal_sent")).toBe(true);
    expect(state.players["brown"]!.outstandingProposals.some((p) => p.kind === "shared_vision")).toBe(true);
  });

  it("proposal fails when proposer cannot see target", () => {
    const state = handMinimalState();
    const proposeOrder = {
      kind: "propose" as const,
      proposal: {
        id: "pending",
        kind: "shared_vision" as const,
        from: "orange" as const,
        to: "red" as const,
        lengthTicks: 5,
        amountInfluence: 0,
        expiresTick: 0,
      },
    };

    const result = tick(state, packetsWithOrders(state, { orange: [proposeOrder] }));
    expect(result.events.some((e) => e.kind === "proposal_failed" && (e as { reason: string }).reason === "no_visibility")).toBe(true);
    expect(state.players["red"]!.outstandingProposals.some((p) => p.kind === "shared_vision")).toBe(false);
  });

  it("shared_vision accept creates pact when acceptor can see proposer", () => {
    const state = handMinimalState();
    state.players["brown"]!.outstandingProposals.push({
      id: "p_0001",
      kind: "shared_vision",
      from: "orange",
      to: "brown",
      lengthTicks: 5,
      amountInfluence: 0,
      expiresTick: 10,
    });

    const respondOrder = {
      kind: "respond" as const,
      proposalId: "p_0001",
      response: "accept" as const,
    };

    const result = tick(state, packetsWithOrders(state, { brown: [respondOrder] }));
    expect(result.events.some((e) => e.kind === "pact_formed")).toBe(true);
    expect(state.pacts.some((p) => p.kind === "shared_vision")).toBe(true);
  });

  it("accept fails when acceptor cannot see proposer", () => {
    const state = handMinimalState();
    state.players["red"]!.outstandingProposals.push({
      id: "p_0001",
      kind: "shared_vision",
      from: "orange",
      to: "red",
      lengthTicks: 5,
      amountInfluence: 0,
      expiresTick: 10,
    });

    const respondOrder = {
      kind: "respond" as const,
      proposalId: "p_0001",
      response: "accept" as const,
    };

    const result = tick(state, packetsWithOrders(state, { red: [respondOrder] }));
    expect(result.events.some((e) => e.kind === "respond_failed" && (e as { reason: string }).reason === "no_visibility")).toBe(true);
    expect(state.pacts.some((p) => p.kind === "shared_vision")).toBe(false);
  });
});

describe("tick victory", () => {
  it("checkVictory returns null at game start", () => {
    const state = handMinimalState();
    expect(checkVictory(state)).toBeNull();
  });

  it("last_standing when only one tribe has regions", () => {
    const state = handMinimalState();
    for (const rid of Object.keys(state.regions)) {
      state.regions[rid]!.owner = "orange";
    }
    state.tribesAlive = ["orange"];
    state.tick = 5;

    const result = tick(state, packetsWithOrders(state, {}));
    expect(result.events.some((e) => e.kind === "victory")).toBe(true);
    expect(result.state.winner).toBe("orange");
  });

  it("tick_limit triggers weighted score winner", () => {
    const state = handMinimalState();
    state.tick = 59;

    const result = tick(state, emptyPackets(state));
    expect(result.state.tick).toBe(60);
    expect(result.events.some((e) => e.kind === "victory")).toBe(true);
    expect(result.state.winner).not.toBeNull();
  });
});

describe("tick build", () => {
  it("build_failed when not owned", () => {
    const state = handMinimalState();
    const notOwned = Object.keys(state.regions).find(
      (rid) => state.regions[rid]!.owner !== "orange",
    )!;
    const buildOrder = { kind: "build" as const, regionId: notOwned, structure: "fort" as const };
    const result = tick(state, packetsWithOrders(state, { orange: [buildOrder] }));
    expect(result.events.some((e) => e.kind === "build_failed")).toBe(true);
  });

  it("build_failed when duplicate", () => {
    const state = handMinimalState();
    const owned = Object.keys(state.regions).find(
      (rid) => state.regions[rid]!.owner === "orange",
    )!;
    state.regions[owned]!.structures.push("fort");
    const buildOrder = { kind: "build" as const, regionId: owned, structure: "fort" as const };
    const result = tick(state, packetsWithOrders(state, { orange: [buildOrder] }));
    expect(result.events.some((e) => e.kind === "build_failed" && (e as { reason: string }).reason === "duplicate")).toBe(true);
  });

  it("build_failed when no influence", () => {
    const state = handMinimalState();
    const owned = Object.keys(state.regions).find(
      (rid) => state.regions[rid]!.owner === "orange",
    )!;
    state.players["orange"]!.influence = 0;
    const buildOrder = { kind: "build" as const, regionId: owned, structure: "fort" as const };
    const result = tick(state, packetsWithOrders(state, { orange: [buildOrder] }));
    expect(result.events.some((e) => e.kind === "build_failed" && (e as { reason: string }).reason === "no_influence")).toBe(true);
  });
});

describe("tick recruit", () => {
  it("recruit_failed when garrison present", () => {
    const state = handMinimalState();
    const owned = Object.keys(state.regions).find(
      (rid) => state.regions[rid]!.owner === "orange",
    )!;
    const recruitOrder = { kind: "recruit" as const, regionId: owned, tier: 1 as const };
    const result = tick(state, packetsWithOrders(state, { orange: [recruitOrder] }));
    expect(result.events.some((e) => e.kind === "recruit_failed" && (e as { reason: string }).reason === "garrison_present")).toBe(true);
  });

  it("recruit_failed when no influence", () => {
    const state = handMinimalState();
    const owned = Object.keys(state.regions).find(
      (rid) => state.regions[rid]!.owner === "orange",
    )!;
    state.regions[owned]!.garrisonForceId = null;
    state.players["orange"]!.influence = 0;
    const recruitOrder = { kind: "recruit" as const, regionId: owned, tier: 1 as const };
    const result = tick(state, packetsWithOrders(state, { orange: [recruitOrder] }));
    expect(result.events.some((e) => e.kind === "recruit_failed" && (e as { reason: string }).reason === "no_influence")).toBe(true);
  });
});

describe("tick scout", () => {
  it("scout_failed when not owned origin", () => {
    const state = handMinimalState();
    const notOwned = Object.keys(state.regions).find(
      (rid) => state.regions[rid]!.owner !== "orange",
    )!;
    const scoutOrder = { kind: "scout" as const, fromRegionId: notOwned, targetRegionId: "r_x" };
    const result = tick(state, packetsWithOrders(state, { orange: [scoutOrder] }));
    expect(result.events.some((e) => e.kind === "scout_failed")).toBe(true);
  });

  it("scout_failed when no influence", () => {
    const state = handMinimalState();
    const owned = Object.keys(state.regions).find(
      (rid) => state.regions[rid]!.owner === "orange",
    )!;
    state.players["orange"]!.influence = 0;
    const adj = state.trails.find((t) => t.a === owned || t.b === owned);
    if (!adj) return;
    const target = adj.a === owned ? adj.b : adj.a;
    const scoutOrder = { kind: "scout" as const, fromRegionId: owned, targetRegionId: target };
    const result = tick(state, packetsWithOrders(state, { orange: [scoutOrder] }));
    expect(result.events.some((e) => e.kind === "scout_failed" && (e as { reason: string }).reason === "no_influence")).toBe(true);
  });
});

describe("tick combat defender bonus cap", () => {
  it("defender own_region + fort bonus is capped at 1", () => {
    const state = handMinimalState();
    const defenderRegion = Object.keys(state.regions).find(
      (rid) => state.regions[rid]!.owner === "orange",
    )!;
    state.regions[defenderRegion]!.structures.push("fort");

    const defenderForce = Object.values(state.forces).find(
      (f) => f.owner === "orange",
    )!;
    const attackerForceId = `f_test_attacker`;
    state.forces[attackerForceId] = {
      id: attackerForceId,
      owner: "grey",
      tier: defenderForce.tier,
      location: { kind: "garrison", regionId: defenderRegion },
    };

    const result = tick(state, emptyPackets(state));

    const combatEvents = result.events.filter((e) => e.kind === "combat");
    expect(combatEvents.length).toBe(1);
    const combat = combatEvents[0] as any;
    expect(combat.d_eff).toBe(defenderForce.tier + 1);
    expect(combat.a_eff).toBe(defenderForce.tier);
    expect(combat.result).toBe("defender_wins");
  });

  it("defender in unfortified home region still gets +1", () => {
    const state = handMinimalState();
    const defenderRegion = Object.keys(state.regions).find(
      (rid) => state.regions[rid]!.owner === "orange",
    )!;

    const defenderForce = Object.values(state.forces).find(
      (f) => f.owner === "orange",
    )!;
    const attackerForceId = `f_test_attacker`;
    state.forces[attackerForceId] = {
      id: attackerForceId,
      owner: "grey",
      tier: defenderForce.tier,
      location: { kind: "garrison", regionId: defenderRegion },
    };

    const result = tick(state, emptyPackets(state));

    const combatEvents = result.events.filter((e) => e.kind === "combat");
    expect(combatEvents.length).toBe(1);
    const combat = combatEvents[0] as any;
    expect(combat.d_eff).toBe(defenderForce.tier + 1);
    expect(combat.result).toBe("defender_wins");
  });
});

describe("tick message cap", () => {
  it("allows up to 3 messages per tribe per tick", () => {
    const state = handMinimalState();
    const msgs = ["grey", "brown", "red"].map(
      (to) => ({ kind: "message" as const, to: to as any, text: `hello ${to}` }),
    );
    const result = tick(state, packetsWithOrders(state, { orange: msgs }));
    const sent = result.events.filter((e) => e.kind === "message_sent" && (e as any).from === "orange");
    expect(sent.length).toBe(3);
  });

  it("rejects messages beyond the cap", () => {
    const state = handMinimalState();
    const targets = (state.tribesAlive.filter((t) => t !== "orange") as string[]);
    while (targets.length < 5) targets.push(targets[0]!);
    const msgs = targets.map(
      (to, i) => ({ kind: "message" as const, to: to as any, text: `msg ${i}` }),
    );
    const result = tick(state, packetsWithOrders(state, { orange: msgs }));
    const sent = result.events.filter((e) => e.kind === "message_sent" && (e as any).from === "orange");
    const failed = result.events.filter((e) => e.kind === "message_failed" && (e as any).from === "orange");
    expect(sent.length).toBe(3);
    expect(failed.length).toBe(msgs.length - 3);
  });
});

describe("tick influence production", () => {
  it("credits influence to all tribes each tick", () => {
    const state = handMinimalState();
    const before = { ...Object.fromEntries(state.tribesAlive.map((t) => [t, state.players[t]!.influence])) };
    tick(state, emptyPackets(state));
    for (const t of state.tribesAlive) {
      expect(state.players[t]!.influence).toBeGreaterThan(before[t]!);
    }
  });
});
