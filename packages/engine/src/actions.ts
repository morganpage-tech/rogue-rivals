/**
 * Resolution for take_action kinds: gather, build, ambush, scout, pass.
 * Mutates the provided `MatchState` in place.
 */

import type { MatchState, PlayerState } from "./state.js";
import type { BuildingType, Region, Resource, Resources } from "./rules.js";
import {
  AMBUSH_COST_S,
  AMBUSH_PERSIST_ROUNDS,
  AMBUSH_YIELD_MULT,
  BUILD_ORDER,
  REGION_TO_RES,
  RES_KEYS,
  TRIBE_HOME,
} from "./rules.js";
import { insertBuildingSorted } from "./state.js";
import type { LogEvent } from "./log.js";

// ---- gather ----------------------------------------------------------------

export function computeBaseYield(state: MatchState, pid: string, region: Region): number {
  if (region === "ruins") {
    return Math.min(1, state.scrapPool);
  }
  const homeReg = TRIBE_HOME[state.players[pid].tribe].region;
  return region === homeReg ? 2 : 1;
}

export function computeGatherYield(state: MatchState, pid: string, region: Region): number {
  const ps = state.players[pid];
  let amt = computeBaseYield(state, pid, region);
  if (region !== "ruins") {
    const homeReg = TRIBE_HOME[ps.tribe].region;
    if (region === homeReg) {
      if (ps.buildings.includes("shack")) amt += 1;
      if (ps.buildings.includes("den")) amt += 1;
    }
    if (ps.buildings.includes("forge")) amt += 1;
    if (ps.trailingBonusActive) amt += 1;
  } else {
    if (ps.buildings.includes("forge")) amt += 1;
    if (ps.trailingBonusActive) amt += 1;
    amt = Math.min(amt, state.scrapPool);
  }
  return amt;
}

export interface GatherResult {
  action: Record<string, unknown>;
  events: LogEvent[];
}

export function applyGather(state: MatchState, pid: string, region: Region): GatherResult {
  const events: LogEvent[] = [];
  const ps = state.players[pid];
  let amt = computeGatherYield(state, pid, region);
  const rk = REGION_TO_RES[region];

  const ambushers = state.turnOrder.filter(
    (p) => p !== pid && state.players[p].activeAmbushRegion === region,
  );
  ambushers.sort((a, b) => state.turnOrder.indexOf(a) - state.turnOrder.indexOf(b));

  if (!ambushers.length) {
    if (region === "ruins") {
      const take = Math.min(amt, state.scrapPool);
      state.scrapPool -= take;
      ps.resources.S += take;
      return {
        action: {
          type: "gather",
          region,
          yield: { S: take },
          intercepted_by: null,
        },
        events,
      };
    }
    ps.resources[rk] += amt;
    return {
      action: {
        type: "gather",
        region,
        yield: { [rk]: amt },
        intercepted_by: null,
      },
      events,
    };
  }

  const amb = ambushers[0]!;
  const rest = ambushers.slice(1);
  const ap = state.players[amb];

  if (ps.buildings.includes("watchtower") && !ps.watchtowerUsedThisRound) {
    ps.watchtowerUsedThisRound = true;
    let yv: Record<string, number>;
    if (region === "ruins") {
      const take = Math.min(amt, state.scrapPool);
      state.scrapPool -= take;
      ps.resources.S += take;
      yv = { S: take };
    } else {
      ps.resources[rk] += amt;
      yv = { [rk]: amt };
    }
    const stDict = region === "ruins" ? { S: 0 } : { [rk]: 0 };
    events.push({
      type: "ambush_triggered",
      round: state.round,
      ambusher_id: amb,
      victim_id: pid,
      region,
      stolen: stDict,
      watchtower_absorbed: true,
    });
    ap.activeAmbushRegion = null;
    ap.ambushRoundsRemaining = 0;
    for (const x of rest) {
      state.players[x].activeAmbushRegion = null;
      state.players[x].ambushRoundsRemaining = 0;
    }
    return {
      action: {
        type: "gather",
        region,
        yield: yv,
        intercepted_by: null,
      },
      events,
    };
  }

  const stolen = amt * AMBUSH_YIELD_MULT;
  const rtype = rk;
  if (rtype === "S") {
    const take = Math.min(stolen, state.scrapPool);
    state.scrapPool -= take;
    ap.resources.S += take;
  } else {
    ap.resources[rtype] += stolen;
  }
  events.push({
    type: "ambush_triggered",
    round: state.round,
    ambusher_id: amb,
    victim_id: pid,
    region,
    stolen: { [rtype]: stolen },
    watchtower_absorbed: false,
  });
  ap.activeAmbushRegion = null;
  ap.ambushRoundsRemaining = 0;
  for (const x of rest) {
    state.players[x].activeAmbushRegion = null;
    state.players[x].ambushRoundsRemaining = 0;
  }

  return {
    action: {
      type: "gather",
      region,
      yield: {},
      intercepted_by: amb,
    },
    events,
  };
}

// ---- build -----------------------------------------------------------------

export function forgeTriple(ps: PlayerState): [Resource, Resource, Resource] | null {
  const keys = [...RES_KEYS];
  const cand: [Resource, Resource, Resource][] = [];
  for (let i = 0; i < 5; i++) {
    for (let j = i + 1; j < 5; j++) {
      for (let k = j + 1; k < 5; k++) {
        const a = keys[i]!;
        const b = keys[j]!;
        const c = keys[k]!;
        const needS = 1 + (a === "S" || b === "S" || c === "S" ? 1 : 0);
        if (
          ps.resources[a] < 1 ||
          ps.resources[b] < 1 ||
          ps.resources[c] < 1 ||
          ps.resources.S < needS
        ) {
          continue;
        }
        cand.push([a, b, c]);
      }
    }
  }
  if (!cand.length) return null;
  cand.sort((x, y) =>
    x[0] !== y[0]
      ? x[0].localeCompare(y[0])
      : x[1] !== y[1]
        ? x[1].localeCompare(y[1])
        : x[2].localeCompare(y[2]),
  );
  return cand[0]!;
}

/** Validate explicit forge triple + return cost, or null if illegal. */
export function costForForgePick(
  ps: PlayerState,
  pick: Resource[],
): Partial<Resources> | null {
  if (pick.length !== 3) return null;
  const uniq = new Set(pick);
  if (uniq.size !== 3) return null;
  for (const r of pick) {
    if (!RES_KEYS.includes(r)) return null;
    if (ps.resources[r] < 1) return null;
  }
  const needS = 1 + (pick.includes("S") ? 1 : 0);
  if (ps.resources.S < needS) return null;
  const cost: Partial<Resources> = {};
  for (const r of pick) {
    cost[r] = (cost[r] ?? 0) + 1;
  }
  cost.S = (cost.S ?? 0) + 1;
  return cost;
}

export function computeBuildCost(
  state: MatchState,
  pid: string,
  bt: BuildingType,
  forgePick?: Resource[],
): Partial<Resources> | null {
  const ps = state.players[pid];
  const tribe = ps.tribe;
  const home = TRIBE_HOME[tribe].resource;

  const canPay = (cost: Partial<Resources>): boolean =>
    RES_KEYS.every((k) => ps.resources[k] >= (cost[k] ?? 0));

  if (bt === "shack") {
    const c: Partial<Resources> = { [home]: 1, S: 1 };
    return canPay(c) ? c : null;
  }
  if (bt === "den") {
    const nonHomes = RES_KEYS.filter((k) => k !== "S" && k !== home).sort();
    for (const nh of nonHomes) {
      const c: Partial<Resources> = { [home]: 1, [nh]: 1, S: 1 };
      if (canPay(c)) return c;
    }
    return null;
  }
  if (bt === "watchtower") {
    // "2 of any single resource + 1 Scrap". For k === "S" the object literal
    // { [k]: 2, S: 1 } key-collides to { S: 1 }; construct the S case explicitly
    // so the cost is the full 3 Scrap (2 + 1).
    for (const k of RES_KEYS) {
      const c: Partial<Resources> = k === "S" ? { S: 3 } : { [k]: 2, S: 1 };
      if (canPay(c)) return c;
    }
    return null;
  }
  if (bt === "forge") {
    if (forgePick && forgePick.length) {
      const c = costForForgePick(ps, forgePick);
      return c && canPay(c) ? c : null;
    }
    const t = forgeTriple(ps);
    if (!t) return null;
    const cost: Partial<Resources> = { [t[0]]: 1, [t[1]]: 1, [t[2]]: 1 };
    cost.S = (cost.S ?? 0) + 1;
    return cost;
  }
  if (bt === "great_hall") {
    const c: Partial<Resources> = { T: 1, O: 1, F: 1, Rel: 1, S: 2 };
    return canPay(c) ? c : null;
  }
  return null;
}

export function vpForBuilding(bt: BuildingType): number {
  switch (bt) {
    case "shack":
    case "den":
      return 1;
    case "watchtower":
    case "forge":
      return 2;
    case "great_hall":
      return 4;
    default: {
      const _x: never = bt;
      return _x;
    }
  }
}

export function applyBuildPay(ps: PlayerState, cost: Partial<Resources>): void {
  for (const k of RES_KEYS) {
    const v = cost[k] ?? 0;
    ps.resources[k] -= v;
  }
}

export function applyBuild(
  state: MatchState,
  pid: string,
  bt: BuildingType,
  cost: Partial<Resources>,
): number {
  const ps = state.players[pid];
  applyBuildPay(ps, cost);
  ps.buildings = insertBuildingSorted(ps.buildings, bt);
  const vpGain = vpForBuilding(bt);
  ps.vp += vpGain;
  if (bt === "great_hall") {
    state.greatHallBuiltThisRound = true;
  }
  return vpGain;
}

export function listPurchasableBuildTypes(state: MatchState, pid: string): BuildingType[] {
  const ps = state.players[pid];
  const out: BuildingType[] = [];
  for (const bt of BUILD_ORDER) {
    if (ps.buildings.includes(bt)) continue;
    const c = computeBuildCost(state, pid, bt);
    if (c) out.push(bt);
  }
  return out;
}

// ---- ambush / scout / pass -------------------------------------------------

export function applyAmbushSet(
  state: MatchState,
  pid: string,
  region: Region,
): { ok: boolean; costPaid?: Partial<Record<"S", number>> } {
  const ps = state.players[pid];
  if (ps.resources.S < AMBUSH_COST_S || ps.activeAmbushRegion !== null) {
    return { ok: false };
  }
  ps.resources.S -= AMBUSH_COST_S;
  ps.activeAmbushRegion = region;
  ps.ambushRoundsRemaining = AMBUSH_PERSIST_ROUNDS;
  return { ok: true, costPaid: { S: AMBUSH_COST_S } };
}

export function applyScout(
  state: MatchState,
  pid: string,
  region: Region,
): { action: Record<string, unknown>; events: LogEvent[] } {
  const ps = state.players[pid];
  const events: LogEvent[] = [];
  let ambushers = state.turnOrder.filter(
    (p) => p !== pid && state.players[p].activeAmbushRegion === region,
  );
  ambushers.sort((a, b) => state.turnOrder.indexOf(a) - state.turnOrder.indexOf(b));

  if (ambushers.length) {
    for (const a of ambushers) {
      state.players[a].activeAmbushRegion = null;
      state.players[a].ambushRoundsRemaining = 0;
    }
    events.push({
      type: "ambush_scouted",
      round: state.round,
      scout_id: pid,
      ambusher_ids: ambushers,
      region,
    });
    return {
      action: {
        type: "scout",
        region,
        revealed_ambushers: ambushers,
        yield: {},
      },
      events,
    };
  }

  const rk = REGION_TO_RES[region];
  if (region === "ruins") {
    const take = Math.min(1, state.scrapPool);
    state.scrapPool -= take;
    ps.resources.S += take;
    return {
      action: {
        type: "scout",
        region,
        revealed_ambushers: [],
        yield: { S: take },
      },
      events,
    };
  }
  ps.resources[rk] += 1;
  return {
    action: {
      type: "scout",
      region,
      revealed_ambushers: [],
      yield: { [rk]: 1 },
    },
    events,
  };
}

export const passActionPayload = { type: "pass" };
