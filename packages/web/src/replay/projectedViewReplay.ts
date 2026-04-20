/**
 * Convert TS ProjectedView to Python project_for_player-shaped JSON (snake_case).
 */

import type {
  Announcement,
  Caravan,
  Force,
  LegalOrderOption,
  Pact,
  ProjectedView,
  Region,
  Scout,
} from "@rr/engine2";

function serializeRegionForView(r: Region): Record<string, unknown> {
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

function serializeForceView(f: Force): Record<string, unknown> {
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

function serializeScoutView(s: Scout): Record<string, unknown> {
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

function serializeCaravanView(c: Caravan): Record<string, unknown> {
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

function serializeLegalOption(o: LegalOrderOption): Record<string, unknown> {
  return {
    id: o.id,
    kind: o.kind,
    summary: o.summary,
    payload: { ...o.payload },
  };
}

function serializeAnnouncement(a: Announcement): Record<string, unknown> {
  const row: Record<string, unknown> = { tick: a.tick, kind: a.kind };
  if (a.parties) row.parties = [...a.parties];
  if (a.detail !== undefined) row.detail = a.detail;
  if (a.breaker !== undefined) row.breaker = a.breaker;
  if (a.interceptor !== undefined) row.interceptor = a.interceptor;
  if (a.amount !== undefined) row.amount = a.amount;
  if (a.condition !== undefined) row.condition = a.condition;
  return row;
}

function serializePactView(p: Pact): Record<string, unknown> {
  return {
    kind: p.kind,
    parties: [...p.parties],
    formed_tick: p.formedTick,
    expires_tick: p.expiresTick,
  };
}

/** Import cycle guard: re-export serializeRegion only used internally above — duplicate id */
export function serializeProjectedViewForReplay(view: ProjectedView): Record<string, unknown> {
  const visible_regions: Record<string, unknown> = {};
  for (const rid of Object.keys(view.visibleRegions).sort()) {
    visible_regions[rid] = serializeRegionForView(view.visibleRegions[rid]!);
  }

  const my_ps = view.myPlayerState;
  const my_player_state = {
    tribe: my_ps.tribe,
    influence: my_ps.influence,
    reputation_penalty_expires_tick: my_ps.reputationPenaltyExpiresTick,
    inbox: my_ps.inbox.map((m) => {
      const row: Record<string, unknown> = { tick: m.tick, kind: m.kind };
      if (m.from !== undefined) row.from_tribe = m.from;
      if (m.text !== undefined) row.text = m.text;
      if (m.proposal) {
        const p = m.proposal;
        row.proposal = {
          id: p.id,
          kind: p.kind,
          from_tribe: p.from,
          to_tribe: p.to,
          length_ticks: p.lengthTicks,
          amount_influence: p.amountInfluence,
          expires_tick: p.expiresTick,
        };
      }
      if (m.reputationPenalty !== undefined) row.reputation_penalty = m.reputationPenalty;
      if (m.payload && Object.keys(m.payload).length) row.payload = { ...m.payload };
      return row;
    }),
    outstanding_proposals: my_ps.outstandingProposals.map((p) => ({
      id: p.id,
      kind: p.kind,
      from_tribe: p.from,
      to_tribe: p.to,
      length_ticks: p.lengthTicks,
      amount_influence: p.amountInfluence,
      expires_tick: p.expiresTick,
    })),
  };

  return {
    tick: view.tick,
    for_tribe: view.forTribe,
    visible_regions,
    visible_forces: view.visibleForces.map((vf) => ({
      region_id: vf.regionId,
      owner: vf.owner,
      fuzzy_tier: vf.fuzzyTier,
    })),
    visible_transits: view.visibleTransits.map((vt) => ({
      trail_index: vt.trailIndex,
      observed_in_region_id: vt.observedInRegionId,
      owner: vt.owner,
      fuzzy_tier: vt.fuzzyTier,
      direction_from: vt.directionFrom,
      direction_to: vt.directionTo,
    })),
    visible_scouts: view.visibleScouts.map((vs) => ({
      region_id: vs.regionId,
      owner: vs.owner,
    })),
    my_player_state,
    my_forces: view.myForces.map(serializeForceView),
    my_scouts: view.myScouts.map(serializeScoutView),
    my_caravans: view.myCaravans.map(serializeCaravanView),
    inbox_new: view.inboxNew.map((m) => {
      const row: Record<string, unknown> = { tick: m.tick, kind: m.kind };
      if (m.from !== undefined) row.from_tribe = m.from;
      if (m.text !== undefined) row.text = m.text;
      if (m.proposal) {
        const p = m.proposal;
        row.proposal = {
          id: p.id,
          kind: p.kind,
          from_tribe: p.from,
          to_tribe: p.to,
          length_ticks: p.lengthTicks,
          amount_influence: p.amountInfluence,
          expires_tick: p.expiresTick,
        };
      }
      if (m.reputationPenalty !== undefined) row.reputation_penalty = m.reputationPenalty;
      if (m.payload && Object.keys(m.payload).length) row.payload = { ...m.payload };
      return row;
    }),
    announcements_new: view.announcementsNew.map(serializeAnnouncement),
    pacts_involving_me: view.pactsInvolvingMe.map(serializePactView),
    legal_order_options: view.legalOrderOptions.map(serializeLegalOption),
    tribes_alive: [...view.tribesAlive],
    tick_limit: view.tickLimit,
  };
}
