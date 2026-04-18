import { describe, expect, test } from "vitest";
import { VP_WIN_THRESHOLD } from "../src/rules.js";
import { forgeTriple, computeBuildCost } from "../src/actions.js";
import { initMatch } from "../src/init.js";
import { applyCommand } from "../src/commands.js";
import type { MatchState } from "../src/state.js";
import { cloneMatchState } from "../src/state.js";
import { resolveTrade } from "../src/trade.js";
import { computeMatchOutcome } from "../src/matchEnd.js";
import { runEndOfRound } from "../src/endOfRound.js";
import { AMBUSH_PERSIST_ROUNDS } from "../src/rules.js";

describe("initial state", () => {
  test("home resource is 2, scrap 5×n, round 1, rng and current player set", () => {
    const state = initMatch({
      seed: 7,
      seats: [
        { playerId: "P1", tribe: "orange" },
        { playerId: "P2", tribe: "grey" },
      ],
      turnOrder: ["P1", "P2"],
    });
    expect(state.scrapPool).toBe(10);
    expect(state.players.P1.resources.T).toBe(2);
    expect(state.players.P2.resources.O).toBe(2);
    expect(state.round).toBe(1);
    expect(state.currentPlayerId).toBe("P1");
    expect(state.rng.a).toBeDefined();
  });
});

describe("building VP and costs", () => {
  test("catalog VP values", () => {
    const s = initMatch({
      seed: 1,
      seats: [
        { playerId: "P1", tribe: "orange" },
        { playerId: "P2", tribe: "grey" },
      ],
      turnOrder: ["P1", "P2"],
    });
    const stock = { ...s.players.P1.resources };
    stock.T = 1;
    stock.S = 1;
    s.players.P1.resources = stock;
    s.players.P1.buildings = [];
    let c = computeBuildCost(s, "P1", "shack");
    expect(c).toEqual({ T: 1, S: 1 });

    const denRes = { ...s.players.P1.resources };
    denRes.T = 1;
    denRes.O = 1;
    denRes.S = 1;
    s.players.P1.resources = denRes;
    s.players.P1.buildings = [];
    c = computeBuildCost(s, "P1", "den");
    expect(c).toEqual({ T: 1, O: 1, S: 1 });

    const gh = initMatch({
      seed: 1,
      seats: [
        { playerId: "P1", tribe: "orange" },
        { playerId: "P2", tribe: "grey" },
      ],
      turnOrder: ["P1", "P2"],
    });
    const ghr = { ...gh.players.P1.resources };
    ghr.T = 1;
    ghr.O = 1;
    ghr.F = 1;
    ghr.Rel = 1;
    ghr.S = 2;
    gh.players.P1.resources = ghr;
    c = computeBuildCost(gh, "P1", "great_hall");
    expect(c).toEqual({ T: 1, O: 1, F: 1, Rel: 1, S: 2 });
  });

  test("watchtower cost: 2 of non-Scrap + 1 Scrap; 3 Scrap when only S available", () => {
    const s = initMatch({
      seed: 1,
      seats: [
        { playerId: "P1", tribe: "orange" },
        { playerId: "P2", tribe: "grey" },
      ],
      turnOrder: ["P1", "P2"],
    });

    // Case 1: 2 Timber + 1 Scrap, no other resource in quantity 2
    s.players.P1.resources = { T: 2, O: 1, F: 0, Rel: 0, S: 1 };
    s.players.P1.buildings = [];
    expect(computeBuildCost(s, "P1", "watchtower")).toEqual({ T: 2, S: 1 });

    // Case 2 (regression): only Scrap available. Pre-fix the dict
    // literal { [k]: 2, S: 1 } when k === "S" collapsed to { S: 1 }
    // and let a Scrap-only player buy a watchtower for 1 Scrap.
    // Correct behaviour is 3 Scrap total (2 + 1).
    s.players.P1.resources = { T: 0, O: 0, F: 0, Rel: 0, S: 1 };
    expect(computeBuildCost(s, "P1", "watchtower")).toBeNull();

    s.players.P1.resources = { T: 0, O: 0, F: 0, Rel: 0, S: 3 };
    expect(computeBuildCost(s, "P1", "watchtower")).toEqual({ S: 3 });
  });
});

describe("trade beads 2/round cap and conversion", () => {
  test("three trades same round: only first two grant beads each side", () => {
    let s = initMatch({
      seed: 1,
      seats: [
        { playerId: "P1", tribe: "orange" },
        { playerId: "P2", tribe: "grey" },
      ],
      turnOrder: ["P1", "P2"],
    });
    const now = new Date(0);
    s.players.P1.resources = { T: 10, O: 10, F: 0, Rel: 0, S: 10 };
    s.players.P2.resources = { T: 10, O: 10, F: 0, Rel: 0, S: 10 };

    for (let i = 0; i < 3; i++) {
      s.pendingOffers.push({
        id: `ox${i}`,
        offerer: "P1",
        recipient: "P2",
        offered: { T: 1 },
        requested: { O: 1 },
        createdTurn: 1,
        status: "pending",
      });
      const r = resolveTrade(s, s.pendingOffers[s.pendingOffers.length - 1]!);
      expect(r.ok).toBe(true);
      s.pendingOffers.pop();
    }

    expect(s.players.P1.beadsEarnedThisRound).toBe(2);
    expect(s.players.P2.beadsEarnedThisRound).toBe(2);
    // v0.8: beads from trades live in pendingBeads until end-of-round; the
    // permanent `beads` stash still has nothing in it at this point.
    expect(s.players.P1.beads).toBe(0);
    expect(s.players.P2.beads).toBe(0);
    expect(s.players.P1.pendingBeads).toBe(2);
    expect(s.players.P2.pendingBeads).toBe(2);
  });

  test("v0.8 pending trade beads flush + convert at end-of-round when safe", () => {
    let s = initMatch({
      seed: 1,
      seats: [
        { playerId: "P1", tribe: "orange" },
        { playerId: "P2", tribe: "grey" },
      ],
      turnOrder: ["P1", "P2"],
    });
    s.players.P1.resources = { T: 10, O: 10, F: 0, Rel: 0, S: 10 };
    s.players.P2.resources = { T: 10, O: 10, F: 0, Rel: 0, S: 10 };
    // Pre-existing carry-over bead (not from a trade this round).
    s.players.P1.beads = 3;
    s.players.P2.beads = 0;
    s.pendingOffers.push({
      id: "o1",
      offerer: "P1",
      recipient: "P2",
      offered: { T: 1 },
      requested: { O: 1 },
      createdTurn: 1,
      status: "pending",
    });
    resolveTrade(s, s.pendingOffers[0]!);
    // Mid-round: conversion is deferred. P1 has 3 real beads + 1 pending.
    expect(s.players.P1.vp).toBe(0);
    expect(s.players.P1.beads).toBe(3);
    expect(s.players.P1.pendingBeads).toBe(1);

    // End-of-round with no ambush hits: pending flows into beads, 4 beads
    // convert to 2 VP.
    runEndOfRound(s);
    expect(s.players.P1.pendingBeads).toBe(0);
    expect(s.players.P1.beads).toBe(0);
    expect(s.players.P1.vp).toBe(2);
  });
});

describe("ambush", () => {
  test("watchtower absorbs; scout clears ambushes without yield", () => {
    let s = initMatch({
      seed: 1,
      seats: [
        { playerId: "P1", tribe: "orange" },
        { playerId: "P2", tribe: "grey" },
      ],
      turnOrder: ["P2", "P1"],
    });
    const now = new Date(0);
    s.players.P2.resources.S = 5;
    const a1 = applyCommand(s, "P2", { kind: "take_action", action: { kind: "ambush", region: "plains" } }, now);
    expect("error" in a1).toBe(false);
    s = (a1 as { newState: MatchState }).newState;

    s.players.P1.buildings = ["watchtower"];
    s.players.P1.resources.T = 0;
    s.players.P1.resources.S = 0;
    const g = applyCommand(s, "P1", { kind: "take_action", action: { kind: "gather", region: "plains" } }, now);
    expect("error" in g).toBe(false);
    const evs = (g as { events: { type: string }[] }).events;
    expect(evs.some((e) => e.type === "ambush_triggered")).toBe(true);

    let s2 = initMatch({
      seed: 2,
      seats: [
        { playerId: "P1", tribe: "orange" },
        { playerId: "P2", tribe: "grey" },
      ],
      turnOrder: ["P2", "P1"],
    });
    s2.players.P2.resources.S = 5;
    const a2 = applyCommand(s2, "P2", { kind: "take_action", action: { kind: "ambush", region: "mountains" } }, now);
    s2 = (a2 as { newState: MatchState }).newState;
    const sc = applyCommand(s2, "P1", { kind: "take_action", action: { kind: "scout", region: "mountains" } }, now);
    expect("error" in sc).toBe(false);
    const turn = (sc as { events: Record<string, unknown>[] }).events.find((e) => e.type === "turn");
    expect((turn?.action as Record<string, unknown>)?.yield).toEqual({});
  });

  test("v0.7.4 ambush persists AMBUSH_PERSIST_ROUNDS end-of-round ticks", () => {
    expect(AMBUSH_PERSIST_ROUNDS).toBe(2);
    let s = initMatch({
      seed: 1,
      seats: [
        { playerId: "P1", tribe: "orange" },
        { playerId: "P2", tribe: "grey" },
      ],
      turnOrder: ["P2", "P1"],
    });
    const now = new Date(0);
    s.players.P2.resources.S = 5;
    const a1 = applyCommand(s, "P2", { kind: "take_action", action: { kind: "ambush", region: "plains" } }, now);
    expect("error" in a1).toBe(false);
    s = (a1 as { newState: MatchState }).newState;

    expect(s.players.P2.activeAmbushRegion).toBe("plains");
    expect(s.players.P2.ambushRoundsRemaining).toBe(AMBUSH_PERSIST_ROUNDS);

    const ev1 = runEndOfRound(s);
    expect(s.players.P2.activeAmbushRegion).toBe("plains");
    expect(s.players.P2.ambushRoundsRemaining).toBe(AMBUSH_PERSIST_ROUNDS - 1);
    expect(ev1.some((e) => e.type === "ambush_expired")).toBe(false);

    const ev2 = runEndOfRound(s);
    expect(s.players.P2.activeAmbushRegion).toBeNull();
    expect(s.players.P2.ambushRoundsRemaining).toBe(0);
    expect(ev2.some((e) => e.type === "ambush_expired")).toBe(true);
  });

  test("v0.7.4 triggered ambush clears TTL immediately (no delayed expire)", () => {
    let s = initMatch({
      seed: 3,
      seats: [
        { playerId: "P1", tribe: "orange" },
        { playerId: "P2", tribe: "grey" },
      ],
      turnOrder: ["P2", "P1"],
    });
    const now = new Date(0);
    s.players.P2.resources.S = 5;
    const a1 = applyCommand(s, "P2", { kind: "take_action", action: { kind: "ambush", region: "plains" } }, now);
    s = (a1 as { newState: MatchState }).newState;
    expect(s.players.P2.ambushRoundsRemaining).toBe(AMBUSH_PERSIST_ROUNDS);

    const g = applyCommand(s, "P1", { kind: "take_action", action: { kind: "gather", region: "plains" } }, now);
    expect("error" in g).toBe(false);
    const evs = (g as { events: { type: string }[] }).events;
    expect(evs.some((e) => e.type === "ambush_triggered")).toBe(true);
    s = (g as { newState: MatchState }).newState;
    expect(s.players.P2.activeAmbushRegion).toBeNull();
    expect(s.players.P2.ambushRoundsRemaining).toBe(0);

    const evEOR = runEndOfRound(s);
    expect(evEOR.some((e) => e.type === "ambush_expired")).toBe(false);
  });

  test("v0.8 successful ambush on a trading victim steals their pending beads", () => {
    // Scenario: P1 has been trading this round (pending bead for a bead-earned
    // trade). P2 ambushes P1's home plains region, P1 subsequently gathers
    // there -> ambush triggers. End-of-round (auto-fired after the final
    // turn in the round) transfers the pending bead to P2 and converts it
    // against P2's existing bead into 1 VP.
    let s = initMatch({
      seed: 11,
      seats: [
        { playerId: "P1", tribe: "orange" },
        { playerId: "P2", tribe: "grey" },
      ],
      turnOrder: ["P2", "P1"],
    });
    const now = new Date(0);
    // P1 enters this turn with 1 pending bead (emulating a trade earlier this
    // round) and 0 real beads; P2 already holds 1 real bead (from trading).
    s.players.P1.pendingBeads = 1;
    s.players.P1.beadsEarnedThisRound = 1;
    s.players.P1.beads = 0;
    s.players.P2.beads = 1;
    // P2 pays for an ambush on plains.
    s.players.P2.resources.S = 5;
    const setAmbush = applyCommand(s, "P2", { kind: "take_action", action: { kind: "ambush", region: "plains" } }, now);
    s = (setAmbush as { newState: MatchState }).newState;
    // P1 gathers at home (plains) -> ambush triggers; this is also the last
    // turn of the round, so runEndOfRound fires automatically.
    const gather = applyCommand(s, "P1", { kind: "take_action", action: { kind: "gather", region: "plains" } }, now);
    expect("error" in gather).toBe(false);
    const gevs = (gather as { events: Array<Record<string, unknown>> }).events;
    const triggered = gevs.find((e) => e.type === "ambush_triggered");
    expect(triggered?.victim_id).toBe("P1");
    expect(triggered?.watchtower_absorbed).toBe(false);
    const stolen = gevs.find((e) => e.type === "bead_stolen");
    expect(stolen).toBeDefined();
    expect(stolen?.victim_id).toBe("P1");
    expect(stolen?.ambusher_id).toBe("P2");
    expect(stolen?.beads).toBe(1);
    // Exactly 1 VP conversion fires for P2 (stole 1 + had 1 = 2 → 1 VP).
    const converts = gevs.filter((e) => e.type === "bead_converted");
    expect(converts.length).toBe(1);
    expect(converts[0]?.player_id).toBe("P2");

    s = (gather as { newState: MatchState }).newState;
    // Final state after EOR.
    expect(s.players.P1.pendingBeads).toBe(0);
    expect(s.players.P1.beads).toBe(0);
    expect(s.players.P2.beads).toBe(0);
    expect(s.players.P2.vp).toBe(1);
    // Per-round hit bookkeeping is cleared by runEndOfRound.
    expect(s.players.P1.hitsThisRound).toBe(0);
    expect(s.players.P1.hitByThisRound).toEqual([]);
  });

  test("v0.8 watchtower-absorbed ambush does NOT steal the victim's pending beads", () => {
    // Regression: watchtower prevents loot theft AND must prevent bead theft.
    let s = initMatch({
      seed: 13,
      seats: [
        { playerId: "P1", tribe: "orange" },
        { playerId: "P2", tribe: "grey" },
      ],
      turnOrder: ["P2", "P1"],
    });
    const now = new Date(0);
    s.players.P1.pendingBeads = 1;
    s.players.P1.beadsEarnedThisRound = 1;
    s.players.P1.buildings = ["watchtower"];
    s.players.P2.resources.S = 5;
    const setAmbush = applyCommand(s, "P2", { kind: "take_action", action: { kind: "ambush", region: "plains" } }, now);
    s = (setAmbush as { newState: MatchState }).newState;
    const gather = applyCommand(s, "P1", { kind: "take_action", action: { kind: "gather", region: "plains" } }, now);
    const gevs = (gather as { events: Array<Record<string, unknown>> }).events;
    const triggered = gevs.find((e) => e.type === "ambush_triggered");
    expect(triggered?.watchtower_absorbed).toBe(true);
    expect(gevs.some((e) => e.type === "bead_stolen")).toBe(false);
    expect(gevs.some((e) => e.type === "bead_denied")).toBe(false);

    s = (gather as { newState: MatchState }).newState;
    // Pending bead survives the round intact -> banked into `beads` at EOR.
    expect(s.players.P1.pendingBeads).toBe(0);
    expect(s.players.P1.beads).toBe(1);
    expect(s.players.P2.beads).toBe(0);
  });
});

describe("forge lex order", () => {
  test("matches Python cand.sort() on triples", () => {
    const ps = initMatch({
      seed: 1,
      seats: [
        { playerId: "P1", tribe: "orange" },
        { playerId: "P2", tribe: "grey" },
      ],
      turnOrder: ["P1", "P2"],
    }).players.P1;
    ps.resources = { T: 1, O: 1, F: 1, Rel: 1, S: 2 };
    expect(forgeTriple(ps)).toEqual(["F", "Rel", "S"]);
    ps.resources.S = 3;
    ps.resources.Rel = 0;
    expect(forgeTriple(ps)).toEqual(["O", "F", "S"]);
  });
});

describe("match end ordering", () => {
  test("VP threshold same turn as Great Hall build: vp_threshold wins", () => {
    let s = initMatch({
      seed: 1,
      seats: [
        { playerId: "P1", tribe: "orange" },
        { playerId: "P2", tribe: "grey" },
      ],
      turnOrder: ["P1", "P2"],
    });
    const now = new Date(0);
    s.players.P1.vp = 4;
    s.players.P1.resources = { T: 1, O: 1, F: 1, Rel: 1, S: 10 };
    const out = applyCommand(s, "P1", { kind: "take_action", action: { kind: "build", building: "great_hall" } }, now);
    expect("error" in out).toBe(false);
    s = (out as { newState: MatchState }).newState;
    expect(s.players.P1.vp).toBeGreaterThanOrEqual(VP_WIN_THRESHOLD);
    expect(s.matchEnded).toBe(true);
    expect(s.endTrigger).toBe("vp_threshold");
  });
});

describe("tiebreakers", () => {
  test("buildings then partners then shared", () => {
    const s = initMatch({
      seed: 1,
      seats: [
        { playerId: "P1", tribe: "orange" },
        { playerId: "P2", tribe: "grey" },
      ],
      turnOrder: ["P1", "P2"],
    });
    s.matchEnded = true;
    s.endTrigger = "round_limit";
    s.players.P1.vp = 5;
    s.players.P2.vp = 5;
    s.players.P1.buildings = ["shack", "den"];
    s.players.P2.buildings = ["shack"];
    let o = computeMatchOutcome(s);
    expect(o.winner_ids).toEqual(["P1"]);

    s.players.P1.buildings = ["shack"];
    s.players.P2.buildings = ["shack"];
    s.players.P1.partnersTraded = ["P2"];
    s.players.P2.partnersTraded = [];
    o = computeMatchOutcome(s);
    expect(o.winner_ids).toEqual(["P1"]);

    s.players.P1.partnersTraded = [];
    s.players.P2.partnersTraded = [];
    o = computeMatchOutcome(s);
    expect(o.shared_victory).toBe(true);
    expect(o.winner_ids).toEqual(["P1", "P2"]);
  });
});

describe("determinism", () => {
  test("same seed and commands → identical JSON state", () => {
    const now = new Date(0);
    function run(): MatchState {
      let st = initMatch({
        seed: 99,
        seats: [
          { playerId: "P1", tribe: "orange" },
          { playerId: "P2", tribe: "grey" },
        ],
        turnOrder: ["P1", "P2"],
      });
      const cmd = { kind: "take_action" as const, action: { kind: "gather" as const, region: "ruins" as const } };
      const o1 = applyCommand(st, "P1", cmd, now);
      st = (o1 as { newState: MatchState }).newState;
      const o2 = applyCommand(st, "P2", cmd, now);
      return (o2 as { newState: MatchState }).newState;
    }
    const a = JSON.stringify(run());
    const b = JSON.stringify(run());
    expect(a).toBe(b);
  });

  test("clone is deep; apply does not mutate input", () => {
    const s0 = initMatch({
      seed: 1,
      seats: [
        { playerId: "P1", tribe: "orange" },
        { playerId: "P2", tribe: "grey" },
      ],
      turnOrder: ["P1", "P2"],
    });
    const before = cloneMatchState(s0);
    const out = applyCommand(s0, "P1", { kind: "take_action", action: { kind: "gather", region: "ruins" } }, new Date(0));
    expect("error" in out).toBe(false);
    expect(s0.players.P1.resources.S).toBe(before.players.P1.resources.S);
  });
});
