/**
 * Serialize GameState to the same JSON shape as offline replay `_state_snapshot`
 * (Python asdict / snake_case).
 */

import type {
  Caravan,
  Force,
  Pact,
  PlayerState,
  Proposal,
  Region,
  Scout,
  Trail,
} from "@rr/shared";

import type { ParsedReplayState } from "./parseReplayStateSnapshot.js";

function serializeTrail(t: Trail): Record<string, unknown> {
  return {
    index: t.index,
    a: t.a,
    b: t.b,
    base_length_ticks: t.baseLengthTicks,
  };
}

function serializeRegion(r: Region): Record<string, unknown> {
  const road_targets: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.roadTargets)) {
    road_targets[k] = v;
  }
  return {
    id: r.id,
    type: r.type,
    owner: r.owner,
    structures: [...r.structures],
    road_targets,
    garrison_force_id: r.garrisonForceId,
  };
}

function serializeForce(f: Force): Record<string, unknown> {
  if (f.location.kind === "garrison") {
    return {
      id: f.id,
      owner: f.owner,
      tier: f.tier,
      location_kind: "garrison",
      location_region_id: f.location.regionId,
      location_transit: null,
    };
  }
  return {
    id: f.id,
    owner: f.owner,
    tier: f.tier,
    location_kind: "transit",
    location_region_id: null,
    location_transit: {
      trail_index: f.location.trailIndex,
      direction_from: f.location.directionFrom,
      direction_to: f.location.directionTo,
      ticks_remaining: f.location.ticksRemaining,
    },
  };
}

function serializeScout(s: Scout): Record<string, unknown> {
  if (s.location.kind === "transit") {
    return {
      id: s.id,
      owner: s.owner,
      target_region_id: s.targetRegionId,
      location_kind: "transit",
      location_region_id: null,
      expires_tick: null,
      transit: {
        trail_index: s.location.trailIndex,
        direction_from: s.location.directionFrom,
        direction_to: s.location.directionTo,
        ticks_remaining: s.location.ticksRemaining,
      },
    };
  }
  return {
    id: s.id,
    owner: s.owner,
    target_region_id: s.targetRegionId,
    location_kind: "arrived",
    location_region_id: s.location.regionId,
    expires_tick: s.location.expiresTick,
    transit: null,
  };
}

function serializeCaravan(c: Caravan): Record<string, unknown> {
  return {
    id: c.id,
    owner: c.owner,
    recipient: c.recipient,
    amount_influence: c.amountInfluence,
    path: [...c.path],
    current_index: c.currentIndex,
    ticks_to_next_region: c.ticksToNextRegion,
  };
}

function serializeProposal(p: Proposal): Record<string, unknown> {
  return {
    id: p.id,
    kind: p.kind,
    from_tribe: p.from,
    to_tribe: p.to,
    length_ticks: p.lengthTicks,
    amount_influence: p.amountInfluence,
    expires_tick: p.expiresTick,
  };
}

function serializePlayer(ps: PlayerState): Record<string, unknown> {
  return {
    tribe: ps.tribe,
    influence: ps.influence,
    reputation_penalty_expires_tick: ps.reputationPenaltyExpiresTick,
    inbox: ps.inbox.map((m) => {
      const row: Record<string, unknown> = {
        tick: m.tick,
        kind: m.kind,
      };
      if (m.from !== undefined) row.from_tribe = m.from;
      if (m.text !== undefined) row.text = m.text;
      if (m.proposal) row.proposal = serializeProposal(m.proposal);
      if (m.reputationPenalty !== undefined) row.reputation_penalty = m.reputationPenalty;
      if (m.payload && Object.keys(m.payload).length) row.payload = { ...m.payload };
      return row;
    }),
    outstanding_proposals: ps.outstandingProposals.map(serializeProposal),
  };
}

function serializePact(p: Pact): Record<string, unknown> {
  return {
    kind: p.kind,
    parties: [...p.parties],
    formed_tick: p.formedTick,
    expires_tick: p.expiresTick,
  };
}

export function serializeGameStateForReplay(state: ParsedReplayState): Record<string, unknown> {
  const regions: Record<string, unknown> = {};
  for (const rid of Object.keys(state.regions).sort()) {
    regions[rid] = serializeRegion(state.regions[rid]!);
  }
  const forces: Record<string, unknown> = {};
  for (const fid of Object.keys(state.forces).sort()) {
    forces[fid] = serializeForce(state.forces[fid]!);
  }
  const scouts: Record<string, unknown> = {};
  for (const sid of Object.keys(state.scouts).sort()) {
    scouts[sid] = serializeScout(state.scouts[sid]!);
  }
  const caravans: Record<string, unknown> = {};
  for (const cid of Object.keys(state.caravans).sort()) {
    caravans[cid] = serializeCaravan(state.caravans[cid]!);
  }
  const players: Record<string, unknown> = {};
  for (const tribe of Object.keys(state.players).sort()) {
    players[tribe] = serializePlayer(state.players[tribe as keyof typeof state.players]!);
  }

  return {
    tick: state.tick,
    tribes_alive: [...state.tribesAlive],
    winner: state.winner,
    regions,
    trails: state.trails.map(serializeTrail),
    forces,
    scouts,
    caravans,
    players,
    pacts: state.pacts.map(serializePact),
  };
}
