import {
  CARAVAN_INTERCEPT_MIN_TIER,
  COMBAT_DEFENDER_OWN_REGION_BONUS,
  COMBAT_FORT_BONUS,
  COMBAT_REINFORCEMENT_BONUS_CAP,
  COMBAT_REINFORCEMENT_BONUS_PER_ALLY,
  COMBAT_SCOUT_REVEAL_PENALTY,
  DEFAULT_NAP_LENGTH,
  DEFAULT_SHARED_VISION_LENGTH,
  DEFAULT_TICK_LIMIT,
  FINAL_SCORE_WEIGHTS,
  FORCE_RECRUIT_COST,
  FORCE_TRAVEL_PENALTY,
  FORGE_REQUIRED_FOR_TIER,
  MAX_STRUCTURES_PER_REGION,
  REGION_PRODUCTION,
  REPUTATION_EARLY_BREAK_THRESHOLD_TICKS,
  REPUTATION_PENALTY_DURATION_EARLY_BREAK,
  REPUTATION_PENALTY_DURATION_LATE_BREAK,
  SCOUT_COST,
  SCOUT_DWELL_TICKS,
  STRUCTURE_COST,
  STRUCTURE_PRODUCTION_BONUS,
  roadModifiedLength,
} from "./constants.js";
import { adjacentRegions, trailBetween } from "./graph.js";
import { hashState } from "./hashState.js";
import { projectForPlayer } from "./projectForPlayer.js";
import type {
  Caravan,
  Force,
  GameState,
  Order,
  OrderPacket,
  Pact,
  Proposal,
  Region,
  RegionId,
  ResolutionEvent,
  TickResult,
  Tribe,
} from "./types.js";

function findPact(
  state: GameState,
  kind: Pact["kind"],
  a: Tribe,
  b: Tribe,
): Pact | undefined {
  const want = new Set<Tribe>([a, b]);
  for (const p of state.pacts) {
    if (p.kind !== kind) continue;
    if (new Set(p.parties).size === want.size && p.parties.every((t) => want.has(t))) {
      return p;
    }
  }
  return undefined;
}

function destroyForce(state: GameState, f: Force): void {
  if (f.location.kind === "garrison") {
    const r = state.regions[f.location.regionId];
    if (r?.garrisonForceId === f.id) {
      r.garrisonForceId = null;
    }
  }
  delete state.forces[f.id];
}

function caravanPath(state: GameState, sender: Tribe, recipient: Tribe): RegionId[] {
  const senderRegions = Object.keys(state.regions)
    .filter((rid) => state.regions[rid]!.owner === sender)
    .sort((a, b) => a.localeCompare(b));
  const recipientRegions = new Set(
    Object.keys(state.regions).filter((rid) => state.regions[rid]!.owner === recipient),
  );
  if (senderRegions.length === 0 || recipientRegions.size === 0) return [];
  const start = senderRegions[0]!;
  const queue: { node: RegionId; path: RegionId[] }[] = [{ node: start, path: [start] }];
  const seen = new Set<RegionId>([start]);
  while (queue.length > 0) {
    const { node, path } = queue.shift()!;
    if (recipientRegions.has(node)) return path;
    for (const nb of adjacentRegions(state, node)) {
      if (seen.has(nb)) continue;
      seen.add(nb);
      queue.push({ node: nb, path: [...path, nb] });
    }
  }
  return [start];
}

function deliverCaravan(state: GameState, c: Caravan, events: ResolutionEvent[]): void {
  let interceptor: Tribe | undefined;
  for (const rid of c.path) {
    const r = state.regions[rid];
    if (!r?.garrisonForceId) continue;
    const f = state.forces[r.garrisonForceId]!;
    if (f.owner === c.owner || f.owner === c.recipient) continue;
    if (f.tier >= CARAVAN_INTERCEPT_MIN_TIER) {
      interceptor = f.owner;
      break;
    }
  }
  if (interceptor !== undefined) {
    state.players[interceptor]!.influence += c.amountInfluence;
    state.announcements.push({
      tick: state.tick + 1,
      kind: "caravan_intercepted",
      parties: [c.owner, c.recipient],
      interceptor,
      amount: c.amountInfluence,
    });
    events.push({
      kind: "caravan_intercepted",
      id: c.id,
      from: c.owner,
      to: c.recipient,
      interceptor,
      amount: c.amountInfluence,
    });
  } else {
    state.players[c.recipient]!.influence += c.amountInfluence;
    state.players[c.recipient]!.inbox.push({
      tick: state.tick + 1,
      kind: "caravan_delivered",
      from: c.owner,
      payload: { amount: c.amountInfluence },
    });
    events.push({
      kind: "caravan_delivered",
      id: c.id,
      from: c.owner,
      to: c.recipient,
      amount: c.amountInfluence,
    });
  }
  delete state.caravans[c.id];
}

function transferRegion(region: Region, newGarrison: Force, events: ResolutionEvent[]): void {
  const oldOwner = region.owner;
  region.owner = newGarrison.owner;
  region.garrisonForceId = newGarrison.id;
  newGarrison.location = { kind: "garrison", regionId: region.id };
  events.push({
    kind: "region_transferred",
    region_id: region.id,
    from: oldOwner,
    to: newGarrison.owner,
  });
}

function retreatOrDestroy(state: GameState, f: Force, events: ResolutionEvent[]): void {
  if (f.location.kind !== "garrison") {
    destroyForce(state, f);
    return;
  }
  const originRegionId = f.location.regionId;
  for (const cand of adjacentRegions(state, originRegionId)) {
    const r = state.regions[cand]!;
    if (r.owner === f.owner && r.garrisonForceId === null) {
      const old = state.regions[originRegionId];
      if (old?.garrisonForceId === f.id) {
        old.garrisonForceId = null;
      }
      f.location = { kind: "garrison", regionId: cand };
      r.garrisonForceId = f.id;
      events.push({ kind: "force_retreated", force_id: f.id, to: cand });
      return;
    }
  }
  events.push({ kind: "force_destroyed_no_retreat", force_id: f.id });
  destroyForce(state, f);
}

function resolveCombatAt(
  state: GameState,
  regionId: RegionId,
  forcesHere: Force[],
  events: ResolutionEvent[],
  scoutReveal: Map<RegionId, Tribe[]>,
): void {
  const region = state.regions[regionId]!;
  let defender: Force | undefined;
  const attackers: Force[] = [];
  for (const f of forcesHere) {
    if (region.owner === f.owner) {
      defender = f;
    } else {
      attackers.push(f);
    }
  }
  attackers.sort((a, b) => a.owner.localeCompare(b.owner));

  for (const attacker of attackers) {
    if (defender === undefined) {
      transferRegion(region, attacker, events);
      defender = attacker;
      continue;
    }

    let dEff = defender.tier;
    dEff += COMBAT_DEFENDER_OWN_REGION_BONUS;
    if (region.structures.includes("fort")) {
      dEff += COMBAT_FORT_BONUS;
    }
    let reinf = 0;
    for (const adjId of adjacentRegions(state, regionId)) {
      const adj = state.regions[adjId]!;
      if (adj.owner === null || adj.owner === defender.owner) continue;
      if (!findPact(state, "shared_vision", defender.owner, adj.owner)) continue;
      if (adj.garrisonForceId === null) continue;
      const allyForce = state.forces[adj.garrisonForceId]!;
      if (allyForce.tier >= 2) {
        reinf += COMBAT_REINFORCEMENT_BONUS_PER_ALLY;
      }
    }
    dEff += Math.min(reinf, COMBAT_REINFORCEMENT_BONUS_CAP);

    let aEff = attacker.tier;
    const revealedBy = scoutReveal.get(regionId) ?? [];
    if (revealedBy.includes(defender.owner)) {
      aEff += COMBAT_SCOUT_REVEAL_PENALTY;
    }

    if (aEff > dEff) {
      defender.tier -= 1;
      events.push({
        kind: "combat",
        region: regionId,
        result: "attacker_wins",
        attacker: attacker.owner,
        defender: defender.owner,
        a_eff: aEff,
        d_eff: dEff,
      });
      if (defender.tier < 1) {
        destroyForce(state, defender);
        transferRegion(region, attacker, events);
        defender = attacker;
      } else {
        retreatOrDestroy(state, defender, events);
        transferRegion(region, attacker, events);
        defender = attacker;
      }
    } else if (aEff < dEff) {
      attacker.tier -= 1;
      events.push({
        kind: "combat",
        region: regionId,
        result: "defender_wins",
        attacker: attacker.owner,
        defender: defender.owner,
        a_eff: aEff,
        d_eff: dEff,
      });
      if (attacker.tier < 1) {
        destroyForce(state, attacker);
      } else {
        retreatOrDestroy(state, attacker, events);
      }
    } else {
      defender.tier -= 1;
      attacker.tier -= 1;
      events.push({
        kind: "combat",
        region: regionId,
        result: "tie",
        attacker: attacker.owner,
        defender: defender.owner,
        a_eff: aEff,
        d_eff: dEff,
      });
      if (defender.tier < 1) {
        destroyForce(state, defender);
        defender = undefined;
      } else {
        retreatOrDestroy(state, defender, events);
        defender = undefined;
      }
      if (attacker.tier < 1) {
        destroyForce(state, attacker);
      } else {
        retreatOrDestroy(state, attacker, events);
      }
    }
  }
}

function resolveCombats(
  state: GameState,
  events: ResolutionEvent[],
  scoutReveal: Map<RegionId, Tribe[]>,
): void {
  for (const regionId of Object.keys(state.regions).sort()) {
    const forcesHere = Object.values(state.forces).filter(
      (f) => f.location.kind === "garrison" && f.location.regionId === regionId,
    );
    const owners = new Set(forcesHere.map((f) => f.owner));
    if (owners.size < 2) continue;
    resolveCombatAt(state, regionId, forcesHere, events, scoutReveal);
  }
}

function applyBuild(
  state: GameState,
  tribe: Tribe,
  order: Order & { kind: "build" },
  events: ResolutionEvent[],
): void {
  const regionId = order.regionId;
  const structure = order.structure;
  const roadTarget = order.roadTarget;
  const region = state.regions[regionId];
  const ps = state.players[tribe]!;
  if (!region || region.owner !== tribe) {
    events.push({ kind: "build_failed", tribe, reason: "not_owned" });
    return;
  }
  if (region.structures.length >= MAX_STRUCTURES_PER_REGION) {
    events.push({ kind: "build_failed", tribe, reason: "full" });
    return;
  }
  if (region.structures.includes(structure)) {
    events.push({ kind: "build_failed", tribe, reason: "duplicate" });
    return;
  }
  const cost = STRUCTURE_COST[structure];
  if (ps.influence < cost) {
    events.push({ kind: "build_failed", tribe, reason: "no_influence" });
    return;
  }
  ps.influence -= cost;
  region.structures.push(structure);
  if (structure === "road" && roadTarget) {
    region.roadTargets[region.structures.length - 1] = roadTarget;
  }
  events.push({ kind: "built", tribe, region_id: regionId, structure });
}

function applyRecruit(
  state: GameState,
  tribe: Tribe,
  order: Order & { kind: "recruit" },
  events: ResolutionEvent[],
): void {
  const regionId = order.regionId;
  const tier = order.tier;
  const region = state.regions[regionId];
  const ps = state.players[tribe]!;
  if (!region || region.owner !== tribe) {
    events.push({ kind: "recruit_failed", reason: "not_owned" });
    return;
  }
  if (region.garrisonForceId !== null) {
    events.push({ kind: "recruit_failed", reason: "garrison_present" });
    return;
  }
  if (tier === FORGE_REQUIRED_FOR_TIER && !region.structures.includes("forge")) {
    events.push({ kind: "recruit_failed", reason: "no_forge" });
    return;
  }
  const cost = FORCE_RECRUIT_COST[tier];
  if (ps.influence < cost) {
    events.push({ kind: "recruit_failed", reason: "no_influence" });
    return;
  }
  ps.influence -= cost;
  const forceId = `f_${tribe}_${String(state.nextForceIdx).padStart(3, "0")}`;
  state.nextForceIdx += 1;
  state.forces[forceId] = {
    id: forceId,
    owner: tribe,
    tier,
    location: { kind: "garrison", regionId },
  };
  region.garrisonForceId = forceId;
  events.push({
    kind: "recruited",
    tribe,
    region_id: regionId,
    tier,
    force_id: forceId,
  });
}

function resolveUnilateralDiplomacy(
  state: GameState,
  prop: Proposal,
  events: ResolutionEvent[],
): void {
  if (prop.kind === "declare_war") {
    const parties = [prop.from, prop.to].sort((a, b) => a.localeCompare(b)) as [Tribe, Tribe];
    const pair = new Set<Tribe>([prop.from, prop.to]);
    state.pacts = state.pacts.filter((p) => {
      const pset = new Set(p.parties);
      const samePair = pset.size === pair.size && [...pair].every((t) => pset.has(t));
      return !samePair || p.kind === "war";
    });
    state.pacts.push({
      kind: "war",
      parties,
      formedTick: state.tick,
      expiresTick: 10 ** 9,
    });
    state.announcements.push({
      tick: state.tick + 1,
      kind: "war_declared",
      parties: [prop.from, prop.to],
    });
    events.push({ kind: "war_declared", parties: [prop.from, prop.to] });
  } else if (prop.kind === "break_pact") {
    const parties = [prop.from, prop.to].sort((a, b) => a.localeCompare(b)) as [Tribe, Tribe];
    const breaking = state.pacts.find(
      (p) =>
        p.kind === "nap" &&
        new Set(p.parties).has(prop.from) &&
        new Set(p.parties).has(prop.to),
    );
    if (!breaking) {
      events.push({ kind: "break_pact_noop" });
      return;
    }
    const age = state.tick - breaking.formedTick;
    const penaltyDuration =
      age < REPUTATION_EARLY_BREAK_THRESHOLD_TICKS
        ? REPUTATION_PENALTY_DURATION_EARLY_BREAK
        : REPUTATION_PENALTY_DURATION_LATE_BREAK;
    state.players[prop.from]!.reputationPenaltyExpiresTick = state.tick + penaltyDuration;
    state.pacts = state.pacts.filter((p) => p !== breaking);
    state.announcements.push({
      tick: state.tick + 1,
      kind: "pact_broken",
      parties: [parties[0], parties[1]],
      breaker: prop.from,
      detail: "nap",
    });
    events.push({ kind: "pact_broken", breaker: prop.from, parties: [parties[0], parties[1]] });
  }
}

function applyPropose(
  state: GameState,
  tribe: Tribe,
  order: Order & { kind: "propose" },
  events: ResolutionEvent[],
): void {
  const prop = order.proposal;
  const kind = prop.kind;
  const toTribe = prop.to;
  if (!state.tribesAlive.includes(toTribe) || toTribe === tribe) {
    events.push({ kind: "proposal_failed", reason: "invalid_target" });
    return;
  }
  const pid = `p_${String(state.nextProposalIdx).padStart(4, "0")}`;
  state.nextProposalIdx += 1;
  const length =
    kind === "nap"
      ? (prop.lengthTicks || DEFAULT_NAP_LENGTH)
      : kind === "shared_vision"
        ? (prop.lengthTicks || DEFAULT_SHARED_VISION_LENGTH)
        : prop.lengthTicks ?? 0;
  const amount = prop.amountInfluence ?? 0;

  const proposal: Proposal = {
    id: pid,
    kind,
    from: tribe,
    to: toTribe,
    lengthTicks: length,
    amountInfluence: amount,
    expiresTick: state.tick + 3,
  };

  if (kind === "declare_war" || kind === "break_pact") {
    resolveUnilateralDiplomacy(state, proposal, events);
    return;
  }

  state.players[toTribe]!.outstandingProposals.push(proposal);
  state.players[toTribe]!.inbox.push({
    tick: state.tick + 1,
    kind: "proposal",
    from: tribe,
    proposal,
    reputationPenalty: state.players[tribe]!.reputationPenaltyExpiresTick > state.tick,
  });
  events.push({
    kind: "proposal_sent",
    from: tribe,
    to: toTribe,
    proposal_kind: kind,
    id: pid,
  });
}

function applyRespond(
  state: GameState,
  tribe: Tribe,
  order: Order & { kind: "respond" },
  events: ResolutionEvent[],
): void {
  const proposalId = order.proposalId;
  const response = order.response;
  const ps = state.players[tribe]!;
  const idx = ps.outstandingProposals.findIndex((p) => p.id === proposalId);
  if (idx === -1) {
    events.push({ kind: "respond_failed", reason: "no_such_proposal" });
    return;
  }
  const match = ps.outstandingProposals[idx]!;
  ps.outstandingProposals.splice(idx, 1);

  if (match.expiresTick <= state.tick) {
    events.push({ kind: "respond_failed", reason: "proposal_expired", id: proposalId });
    return;
  }

  if (response !== "accept") {
    events.push({ kind: "proposal_declined", id: proposalId });
    return;
  }

  if (match.kind === "nap") {
    const parties = [match.from, match.to].sort((a, b) => a.localeCompare(b)) as [Tribe, Tribe];
    const pact: Pact = {
      kind: "nap",
      parties,
      formedTick: state.tick,
      expiresTick: state.tick + match.lengthTicks,
    };
    state.pacts.push(pact);
    state.announcements.push({
      tick: state.tick + 1,
      kind: "pact_formed",
      parties: [parties[0], parties[1]],
      detail: "nap",
    });
    events.push({ kind: "pact_formed", parties: [parties[0], parties[1]], pact: "nap" });
  } else if (match.kind === "shared_vision") {
    const parties = [match.from, match.to].sort((a, b) => a.localeCompare(b)) as [Tribe, Tribe];
    const pact: Pact = {
      kind: "shared_vision",
      parties,
      formedTick: state.tick,
      expiresTick: state.tick + match.lengthTicks,
    };
    state.pacts.push(pact);
    state.announcements.push({
      tick: state.tick + 1,
      kind: "pact_formed",
      parties: [parties[0], parties[1]],
      detail: "shared_vision",
    });
    events.push({
      kind: "pact_formed",
      parties: [parties[0], parties[1]],
      pact: "shared_vision",
    });
  } else if (match.kind === "trade_offer") {
    const sender = state.players[match.from]!;
    if (sender.influence < match.amountInfluence + 1) {
      events.push({ kind: "trade_accept_failed", reason: "sender_insolvent" });
      return;
    }
    sender.influence -= match.amountInfluence + 1;
    const path = caravanPath(state, match.from, match.to);
    const cid = `c_${String(state.nextCaravanIdx).padStart(4, "0")}`;
    state.nextCaravanIdx += 1;
    state.caravans[cid] = {
      id: cid,
      owner: match.from,
      recipient: match.to,
      amountInfluence: match.amountInfluence,
      path,
      currentIndex: 0,
      ticksToNextRegion: 1,
    };
    events.push({
      kind: "caravan_dispatched",
      id: cid,
      amount: match.amountInfluence,
      path,
    });
  }
}

function applyMessage(
  state: GameState,
  tribe: Tribe,
  order: Order & { kind: "message" },
  events: ResolutionEvent[],
): void {
  const to = order.to;
  const text = order.text;
  if (!state.tribesAlive.includes(to) || to === tribe) {
    return;
  }
  state.players[to]!.inbox.push({
    tick: state.tick + 1,
    kind: "message",
    from: tribe,
    text,
  });
  events.push({ kind: "message_sent", from: tribe, to });
}

function applyDispatchMove(
  state: GameState,
  tribe: Tribe,
  order: Order & { kind: "move" },
  events: ResolutionEvent[],
): void {
  const forceId = order.forceId;
  const dest = order.destinationRegionId;
  const f = state.forces[forceId];
  if (!f || f.owner !== tribe || f.location.kind !== "garrison") {
    events.push({ kind: "move_failed", reason: "invalid_force" });
    return;
  }
  const origin = f.location.regionId;
  const trail = trailBetween(state, origin, dest);
  if (!trail) {
    events.push({ kind: "move_failed", reason: "no_trail" });
    return;
  }

  let length = trail.baseLengthTicks;
  const originRegion = state.regions[origin]!;
  for (const [idxStr, target] of Object.entries(originRegion.roadTargets)) {
    const idx = Number(idxStr);
    if (
      target === dest &&
      idx < originRegion.structures.length &&
      originRegion.structures[idx] === "road"
    ) {
      length = roadModifiedLength(length);
      break;
    }
  }
  length += FORCE_TRAVEL_PENALTY[f.tier];

  const destOwner = state.regions[dest]!.owner;
  if (destOwner !== null && destOwner !== tribe) {
    const nap = findPact(state, "nap", tribe, destOwner);
    if (nap) {
      const age = state.tick - nap.formedTick;
      const penalty =
        age < REPUTATION_EARLY_BREAK_THRESHOLD_TICKS
          ? REPUTATION_PENALTY_DURATION_EARLY_BREAK
          : REPUTATION_PENALTY_DURATION_LATE_BREAK;
      state.players[tribe]!.reputationPenaltyExpiresTick = state.tick + penalty;
      state.pacts = state.pacts.filter((p) => p !== nap);
      state.announcements.push({
        tick: state.tick + 1,
        kind: "pact_broken",
        parties: [...nap.parties],
        breaker: tribe,
        detail: "nap-violated-by-move",
      });
      events.push({ kind: "pact_broken_by_move", breaker: tribe, parties: [...nap.parties] });
    }
  }

  f.location = {
    kind: "transit",
    trailIndex: trail.index,
    directionFrom: origin,
    directionTo: dest,
    ticksRemaining: length,
  };
  originRegion.garrisonForceId = null;
  events.push({
    kind: "dispatch_move",
    tribe,
    force_id: forceId,
    from: origin,
    to: dest,
    ticks: length,
  });
}

function applyDispatchScout(
  state: GameState,
  tribe: Tribe,
  order: Order & { kind: "scout" },
  events: ResolutionEvent[],
): void {
  const origin = order.fromRegionId;
  const target = order.targetRegionId;
  const region = state.regions[origin];
  const ps = state.players[tribe]!;
  if (!region || region.owner !== tribe) {
    events.push({ kind: "scout_failed", reason: "not_owned_origin" });
    return;
  }
  if (ps.influence < SCOUT_COST) {
    events.push({ kind: "scout_failed", reason: "no_influence" });
    return;
  }
  const trail = trailBetween(state, origin, target);
  if (!trail) {
    events.push({ kind: "scout_failed", reason: "no_trail" });
    return;
  }
  ps.influence -= SCOUT_COST;
  const sid = `s_${tribe}_${String(state.nextScoutIdx).padStart(3, "0")}`;
  state.nextScoutIdx += 1;
  state.scouts[sid] = {
    id: sid,
    owner: tribe,
    targetRegionId: target,
    location: {
      kind: "transit",
      trailIndex: trail.index,
      directionFrom: origin,
      directionTo: target,
      ticksRemaining: trail.baseLengthTicks,
    },
  };
  events.push({
    kind: "dispatch_scout",
    tribe,
    scout_id: sid,
    from: origin,
    to: target,
  });
}

function weightedScoreWinner(state: GameState): Tribe | Tribe[] | null {
  const scores: Partial<Record<Tribe, number>> = {};
  const totalRegions = Math.max(1, Object.keys(state.regions).length);
  let totalProduction = 0;
  for (const region of Object.values(state.regions)) {
    if (region.owner === null) continue;
    let base = REGION_PRODUCTION[region.type] ?? 0;
    if (region.owner === "orange" && region.type === "plains") base += 1;
    for (const st of region.structures) {
      base += STRUCTURE_PRODUCTION_BONUS[st] ?? 0;
    }
    totalProduction += base;
  }
  totalProduction = Math.max(1, totalProduction);

  for (const tribe of state.tribesAlive) {
    const owned = Object.values(state.regions).filter((r) => r.owner === tribe).length;
    let ownProd = 0;
    for (const region of Object.values(state.regions)) {
      if (region.owner !== tribe) continue;
      let base = REGION_PRODUCTION[region.type] ?? 0;
      if (tribe === "orange" && region.type === "plains") base += 1;
      for (const st of region.structures) {
        base += STRUCTURE_PRODUCTION_BONUS[st] ?? 0;
      }
      ownProd += base;
    }
    const shrines = Object.values(state.regions).filter(
      (r) => r.owner === tribe && r.structures.includes("shrine"),
    ).length;
    const naps = state.pacts.filter((p) => p.kind === "nap" && p.parties.includes(tribe)).length;
    scores[tribe] =
      FINAL_SCORE_WEIGHTS.regionsOwned * (owned / totalRegions) +
      FINAL_SCORE_WEIGHTS.influenceShare * (ownProd / totalProduction) +
      FINAL_SCORE_WEIGHTS.shrinesOwned * (shrines / 4.0) +
      FINAL_SCORE_WEIGHTS.activeNaps * (naps / Math.max(1, state.tribesAlive.length - 1));
  }
  const entries = Object.entries(scores).filter((x): x is [Tribe, number] => x[1] !== undefined);
  if (entries.length === 0) return null;
  const top = Math.max(...entries.map(([, s]) => s));
  const winners = entries.filter(([, s]) => s === top).map(([t]) => t as Tribe);
  return winners.length === 1 ? winners[0]! : winners;
}

export function checkVictory(state: GameState): string | null {
  const events: ResolutionEvent[] = [];
  checkVictoryInternal(state, events);
  const ev = events.find((e) => e.kind === "victory");
  if (!ev) return null;
  return (ev.condition as string) ?? null;
}

function checkVictoryInternal(state: GameState, events: ResolutionEvent[]): void {
  const ownersWithRegions = new Set(
    Object.values(state.regions)
      .map((r) => r.owner)
      .filter((o): o is Tribe => o !== null),
  );
  const aliveWithRegions = new Set(
    [...ownersWithRegions].filter((t) => state.tribesAlive.includes(t)),
  );
  if (aliveWithRegions.size === 1) {
    const winner = [...aliveWithRegions][0]!;
    state.winner = winner;
    state.announcements.push({
      tick: state.tick,
      kind: "victory",
      parties: [winner],
      condition: "last_standing",
    });
    events.push({ kind: "victory", tribe: winner, condition: "last_standing" });
    return;
  }

  for (const tribe of [...state.tribesAlive]) {
    const owned = Object.values(state.regions).some((r) => r.owner === tribe);
    const forced = Object.values(state.forces).some((f) => f.owner === tribe);
    if (!owned && !forced) {
      state.tribesAlive = state.tribesAlive.filter((t) => t !== tribe);
      state.announcements.push({
        tick: state.tick,
        kind: "tribe_eliminated",
        parties: [tribe],
      });
      events.push({ kind: "tribe_eliminated", tribe });
    }
  }

  if (state.tick >= DEFAULT_TICK_LIMIT) {
    const winner = weightedScoreWinner(state);
    state.winner = winner;
    state.announcements.push({
      tick: state.tick,
      kind: "victory",
      parties: Array.isArray(winner) ? winner : winner ? [winner] : [],
      condition: "tick_limit",
    });
    events.push({ kind: "victory", tribes: winner, condition: "tick_limit" });
  }
}

export function tick(
  state: GameState,
  packetsByTribe: Readonly<Record<Tribe, OrderPacket>>,
): TickResult {
  const events: ResolutionEvent[] = [];

  for (const tribe of state.tribesAlive) {
    const packet = packetsByTribe[tribe];
    if (!packet) {
      throw new Error(`missing OrderPacket for ${tribe}`);
    }
    if (packet.tick !== state.tick) {
      throw new Error(
        `packet tick mismatch for ${tribe}: expected ${state.tick}, got ${packet.tick}`,
      );
    }
  }

  const tribeOrder = [...state.tribesAlive].sort((a, b) => a.localeCompare(b));

  for (const tribe of tribeOrder) {
    const packet = packetsByTribe[tribe]!;
    for (const order of packet.orders) {
      if (order.kind === "build") applyBuild(state, tribe, order, events);
      else if (order.kind === "recruit") applyRecruit(state, tribe, order, events);
      else if (order.kind === "propose") applyPropose(state, tribe, order, events);
      else if (order.kind === "respond") applyRespond(state, tribe, order, events);
      else if (order.kind === "message") applyMessage(state, tribe, order, events);
    }
  }

  for (const tribe of tribeOrder) {
    const packet = packetsByTribe[tribe]!;
    for (const order of packet.orders) {
      if (order.kind === "move") applyDispatchMove(state, tribe, order, events);
      else if (order.kind === "scout") applyDispatchScout(state, tribe, order, events);
    }
  }

  for (const f of Object.values(state.forces)) {
    if (f.location.kind === "transit") {
      f.location.ticksRemaining -= 1;
    }
  }
  for (const s of Object.values(state.scouts)) {
    if (s.location.kind === "transit") {
      s.location.ticksRemaining -= 1;
    }
  }
  for (const c of Object.values(state.caravans)) {
    c.ticksToNextRegion -= 1;
    if (c.ticksToNextRegion <= 0 && c.currentIndex < c.path.length - 1) {
      c.currentIndex += 1;
      c.ticksToNextRegion = 1;
    }
  }

  const scoutRevealThisTick = new Map<RegionId, Tribe[]>();
  const arrivalsByDest = new Map<RegionId, Force[]>();
  for (const f of Object.values(state.forces)) {
    if (f.location.kind !== "transit") continue;
    if (f.location.ticksRemaining > 0) continue;
    const dest = f.location.directionTo;
    const list = arrivalsByDest.get(dest) ?? [];
    list.push(f);
    arrivalsByDest.set(dest, list);
  }

  for (const dest of [...arrivalsByDest.keys()].sort()) {
    const region = state.regions[dest]!;
    const arrivals = arrivalsByDest.get(dest)!.sort((a, b) => a.id.localeCompare(b.id));
    const ownersPresent = new Set<Tribe>();
    if (region.garrisonForceId) {
      ownersPresent.add(state.forces[region.garrisonForceId]!.owner);
    }
    for (const f of arrivals) {
      f.location = { kind: "garrison", regionId: dest };
      events.push({ kind: "force_arrived", force_id: f.id, region_id: dest });
      if (ownersPresent.has(f.owner)) {
        events.push({
          kind: "arrival_rejected_garrison_cap",
          force_id: f.id,
          region_id: dest,
        });
        destroyForce(state, f);
        continue;
      }
      ownersPresent.add(f.owner);
      if (region.garrisonForceId === null) {
        region.garrisonForceId = f.id;
        if (region.owner !== f.owner) {
          const previousOwner = region.owner;
          region.owner = f.owner;
          events.push({
            kind: previousOwner === null ? "region_claimed" : "region_captured",
            tribe: f.owner,
            region_id: dest,
            previous_owner: previousOwner,
          });
        }
      }
    }
  }

  for (const s of [...Object.values(state.scouts)]) {
    if (s.location.kind !== "transit") continue;
    if (s.location.ticksRemaining > 0) continue;
    const dest = s.location.directionTo;
    s.location = {
      kind: "arrived",
      regionId: dest,
      expiresTick: state.tick + SCOUT_DWELL_TICKS + 1,
    };
    const list = scoutRevealThisTick.get(dest) ?? [];
    list.push(s.owner);
    scoutRevealThisTick.set(dest, list);
    events.push({ kind: "scout_arrived", scout_id: s.id, region_id: dest });
    state.players[s.owner]!.inbox.push({
      tick: state.tick + 1,
      kind: "scout_report",
      payload: { region_id: dest, reveal_tick: state.tick },
    });
  }

  for (const c of [...Object.values(state.caravans)]) {
    if (c.currentIndex >= c.path.length - 1 && c.ticksToNextRegion <= 0) {
      deliverCaravan(state, c, events);
    }
  }

  resolveCombats(state, events, scoutRevealThisTick);

  state.pacts = state.pacts.filter((p) => p.kind === "war" || p.expiresTick > state.tick);

  for (const tribe of state.tribesAlive) {
    const ps = state.players[tribe]!;
    if (ps.reputationPenaltyExpiresTick <= state.tick) {
      ps.reputationPenaltyExpiresTick = 0;
    }
    const fresh: Proposal[] = [];
    for (const p of ps.outstandingProposals) {
      if (p.expiresTick > state.tick) {
        fresh.push(p);
      } else {
        events.push({
          kind: "proposal_expired",
          id: p.id,
          proposal_kind: p.kind,
          from: p.from,
          to: p.to,
        });
      }
    }
    ps.outstandingProposals = fresh;
  }

  for (const tribe of state.tribesAlive) {
    let total = 0;
    for (const region of Object.values(state.regions)) {
      if (region.owner !== tribe) continue;
      let base = REGION_PRODUCTION[region.type] ?? 0;
      if (tribe === "orange" && region.type === "plains") base += 1;
      for (const st of region.structures) {
        base += STRUCTURE_PRODUCTION_BONUS[st] ?? 0;
      }
      total += base;
    }
    state.players[tribe]!.influence += total;
    events.push({ kind: "influence_credited", tribe, amount: total });
  }

  for (const sid of Object.keys(state.scouts)) {
    const s = state.scouts[sid]!;
    if (s.location.kind === "arrived" && s.location.expiresTick <= state.tick + 1) {
      delete state.scouts[sid];
      events.push({ kind: "scout_expired", scout_id: sid });
    }
  }

  state.tick += 1;

  checkVictoryInternal(state, events);

  const projectedViews = Object.fromEntries(
    state.tribesAlive.map((t) => [t, projectForPlayer(state, t)]),
  ) as Readonly<Record<Tribe, ReturnType<typeof projectForPlayer>>>;

  const stateHash = hashState(state);

  return {
    state,
    events,
    projectedViews,
    stateHash,
  };
}
