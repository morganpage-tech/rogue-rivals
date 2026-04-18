import { describe, expect, test } from "vitest";
import { VP_WIN_THRESHOLD } from "../src/rules.js";
import { forgeTriple, computeBuildCost } from "../src/actions.js";
import { initMatch } from "../src/init.js";
import { applyCommand } from "../src/commands.js";
import type { MatchState } from "../src/state.js";
import { cloneMatchState } from "../src/state.js";
import { resolveTrade } from "../src/trade.js";
import { computeMatchOutcome } from "../src/matchEnd.js";

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
    expect(s.players.P1.beads).toBe(0);
    expect(s.players.P2.beads).toBe(0);
  });

  test("4 beads convert to 2 VP in one resolution chain", () => {
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
    expect(s.players.P1.vp).toBe(2);
    expect(s.players.P1.beads).toBe(0);
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
