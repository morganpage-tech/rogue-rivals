/**
 * Parse `frame.state` JSON (Python _state_snapshot / TS serialize) into typed
 * engine shapes for map rendering and scoreboard.
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
  Tribe,
} from "@rr/shared";
import type { ProjectedView } from "@rr/shared";
import { DEFAULT_TICK_LIMIT } from "./replayConstants.js";

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function tribe(x: unknown): Tribe {
  return String(x ?? "") as Tribe;
}

export function parseRegion(j: Record<string, unknown>): Region {
  const roadTargets: Record<number, string> = {};
  const rawRt = j.road_targets ?? j.roadTargets;
  if (isRecord(rawRt)) {
    for (const [k, v] of Object.entries(rawRt)) {
      roadTargets[Number(k)] = String(v);
    }
  }
  const structures = Array.isArray(j.structures)
    ? (j.structures as string[]).map((s) => s as Region["structures"][number])
    : [];
  return {
    id: String(j.id ?? ""),
    type: String(j.type ?? "plains") as Region["type"],
    owner: j.owner == null ? null : tribe(j.owner),
    structures,
    roadTargets,
    garrisonForceId: j.garrison_force_id != null ? String(j.garrison_force_id) : null,
  };
}

export function parseTrail(j: Record<string, unknown>): Trail {
  return {
    index: Number(j.index ?? 0),
    a: String(j.a ?? ""),
    b: String(j.b ?? ""),
    baseLengthTicks: Number(j.base_length_ticks ?? j.baseLengthTicks ?? 0),
  };
}

export function parseForce(j: Record<string, unknown>): Force {
  const kind = String(j.location_kind ?? "");
  if (kind === "garrison") {
    return {
      id: String(j.id ?? ""),
      owner: tribe(j.owner),
      tier: Number(j.tier ?? 1) as Force["tier"],
      location: {
        kind: "garrison",
        regionId: String(j.location_region_id ?? j.locationRegionId ?? ""),
      },
    };
  }
  const tr = isRecord(j.location_transit ?? j.locationTransit)
    ? (j.location_transit ?? j.locationTransit)
    : {};
  const t = isRecord(tr) ? tr : {};
  return {
    id: String(j.id ?? ""),
    owner: tribe(j.owner),
    tier: Number(j.tier ?? 1) as Force["tier"],
    location: {
      kind: "transit",
      trailIndex: Number(t.trail_index ?? t.trailIndex ?? 0),
      directionFrom: String(t.direction_from ?? t.directionFrom ?? ""),
      directionTo: String(t.direction_to ?? t.directionTo ?? ""),
      ticksRemaining: Number(t.ticks_remaining ?? t.ticksRemaining ?? 0),
    },
  };
}

export function parseScout(j: Record<string, unknown>): Scout {
  const kind = String(j.location_kind ?? "");
  if (kind === "arrived") {
    return {
      id: String(j.id ?? ""),
      owner: tribe(j.owner),
      targetRegionId: String(j.target_region_id ?? j.targetRegionId ?? ""),
      location: {
        kind: "arrived",
        regionId: String(j.location_region_id ?? j.locationRegionId ?? ""),
        expiresTick: Number(j.expires_tick ?? j.expiresTick ?? 0),
      },
    };
  }
  const tr = isRecord(j.transit) ? j.transit : {};
  return {
    id: String(j.id ?? ""),
    owner: tribe(j.owner),
    targetRegionId: String(j.target_region_id ?? j.targetRegionId ?? ""),
    location: {
      kind: "transit",
      trailIndex: Number(tr.trail_index ?? tr.trailIndex ?? 0),
      directionFrom: String(tr.direction_from ?? tr.directionFrom ?? ""),
      directionTo: String(tr.direction_to ?? tr.directionTo ?? ""),
      ticksRemaining: Number(tr.ticks_remaining ?? tr.ticksRemaining ?? 0),
    },
  };
}

export function parseCaravan(j: Record<string, unknown>): Caravan {
  return {
    id: String(j.id ?? ""),
    owner: tribe(j.owner),
    recipient: tribe(j.recipient),
    amountInfluence: Number(j.amount_influence ?? j.amountInfluence ?? 0),
    path: Array.isArray(j.path) ? (j.path as unknown[]).map(String) : [],
    currentIndex: Number(j.current_index ?? j.currentIndex ?? 0),
    ticksToNextRegion: Number(j.ticks_to_next_region ?? j.ticksToNextRegion ?? 0),
  };
}

function parseProposal(j: Record<string, unknown>): Proposal {
  return {
    id: String(j.id ?? ""),
    kind: j.kind as Proposal["kind"],
    from: tribe(j.from_tribe ?? j.from),
    to: tribe(j.to_tribe ?? j.to),
    lengthTicks: Number(j.length_ticks ?? j.lengthTicks ?? 0),
    amountInfluence: Number(j.amount_influence ?? j.amountInfluence ?? 0),
    expiresTick: Number(j.expires_tick ?? j.expiresTick ?? 0),
  };
}

function parsePlayerState(j: Record<string, unknown>): PlayerState {
  const inboxRaw = Array.isArray(j.inbox) ? j.inbox : [];
  const outRaw = Array.isArray(j.outstanding_proposals) ? j.outstanding_proposals : [];
  return {
    tribe: tribe(j.tribe),
    influence: Number(j.influence ?? 0),
    reputationPenaltyExpiresTick: Number(
      j.reputation_penalty_expires_tick ?? j.reputationPenaltyExpiresTick ?? 0,
    ),
    inbox: inboxRaw.filter(isRecord).map((m) => ({
      tick: Number(m.tick ?? 0),
      kind: m.kind as PlayerState["inbox"][0]["kind"],
      from: m.from_tribe != null ? tribe(m.from_tribe) : m.from != null ? tribe(m.from) : undefined,
      text: m.text != null ? String(m.text) : undefined,
      proposal: isRecord(m.proposal) ? parseProposal(m.proposal) : undefined,
      reputationPenalty: m.reputation_penalty != null ? Boolean(m.reputation_penalty) : undefined,
      payload: isRecord(m.payload) ? m.payload : undefined,
    })),
    outstandingProposals: outRaw.filter(isRecord).map((p) => parseProposal(p)),
  };
}

function parsePact(j: Record<string, unknown>): Pact {
  const parties = Array.isArray(j.parties) ? (j.parties as unknown[]).map(tribe) : [];
  const p0 = parties[0] ?? "orange";
  const p1 = parties[1] ?? "grey";
  return {
    kind: j.kind as Pact["kind"],
    parties: [p0, p1] as [Tribe, Tribe],
    formedTick: Number(j.formed_tick ?? j.formedTick ?? 0),
    expiresTick: Number(j.expires_tick ?? j.expiresTick ?? 0),
  };
}

export interface ParsedReplayState {
  readonly tick: number;
  /** When set (e.g. spectator or replay meta), overrides default tick cap in omniscient views. */
  readonly tickLimit?: number;
  readonly tribesAlive: Tribe[];
  readonly winner: Tribe | Tribe[] | null;
  readonly regions: Record<string, Region>;
  readonly trails: Trail[];
  readonly forces: Record<string, Force>;
  readonly scouts: Record<string, Scout>;
  readonly caravans: Record<string, Caravan>;
  readonly players: Record<Tribe, PlayerState>;
  readonly pacts: Pact[];
}

export function parseReplayStateSnapshot(raw: unknown): ParsedReplayState | null {
  if (!isRecord(raw)) return null;

  const regions: Record<string, Region> = {};
  const regIn = raw.regions;
  if (isRecord(regIn)) {
    for (const [rid, rv] of Object.entries(regIn)) {
      if (isRecord(rv)) regions[rid] = parseRegion(rv);
    }
  }

  const trails: Trail[] = Array.isArray(raw.trails)
    ? (raw.trails as unknown[]).filter(isRecord).map((t) => parseTrail(t))
    : [];

  const forces: Record<string, Force> = {};
  const fIn = raw.forces;
  if (isRecord(fIn)) {
    for (const [fid, fv] of Object.entries(fIn)) {
      if (isRecord(fv)) forces[fid] = parseForce(fv);
    }
  }

  const scouts: Record<string, Scout> = {};
  const sIn = raw.scouts;
  if (isRecord(sIn)) {
    for (const [sid, sv] of Object.entries(sIn)) {
      if (isRecord(sv)) scouts[sid] = parseScout(sv);
    }
  }

  const caravans: Record<string, Caravan> = {};
  const cIn = raw.caravans;
  if (isRecord(cIn)) {
    for (const [cid, cv] of Object.entries(cIn)) {
      if (isRecord(cv)) caravans[cid] = parseCaravan(cv);
    }
  }

  const players: Record<Tribe, PlayerState> = {} as Record<Tribe, PlayerState>;
  const pIn = raw.players;
  if (isRecord(pIn)) {
    for (const [t, pv] of Object.entries(pIn)) {
      if (isRecord(pv)) players[tribe(t)] = parsePlayerState(pv);
    }
  }

  const pacts: Pact[] = Array.isArray(raw.pacts)
    ? (raw.pacts as unknown[]).filter(isRecord).map((p) => parsePact(p))
    : [];

  const tribesAlive = Array.isArray(raw.tribes_alive ?? raw.tribesAlive)
    ? ((raw.tribes_alive ?? raw.tribesAlive) as unknown[]).map(tribe)
    : [];

  let winner: Tribe | Tribe[] | null = null;
  const w = raw.winner;
  if (w == null) winner = null;
  else if (Array.isArray(w)) winner = (w as unknown[]).map(tribe) as Tribe[];
  else winner = tribe(w);

  const tlRaw = raw.tick_limit ?? raw.tickLimit;
  const tickLimitParsed =
    tlRaw != null && tlRaw !== "" ? Number(tlRaw) : undefined;
  const tickLimit =
    tickLimitParsed != null && Number.isFinite(tickLimitParsed) ? tickLimitParsed : undefined;

  return {
    tick: Number(raw.tick ?? 0),
    tickLimit,
    tribesAlive,
    winner,
    regions,
    trails,
    forces,
    scouts,
    caravans,
    players,
    pacts,
  };
}

/** Build a synthetic ProjectedView that exposes every region (omniscient map). */
export function buildOmniscientProjectedViewFromState(
  state: ParsedReplayState,
  forTribe: Tribe,
): ProjectedView {
  const visibleRegions = { ...state.regions };
  const myPlayerState = state.players[forTribe] ?? {
    tribe: forTribe,
    influence: 0,
    reputationPenaltyExpiresTick: 0,
    inbox: [],
    outstandingProposals: [],
  };

  const myForces = Object.values(state.forces).filter((f) => f.owner === forTribe);
  const myScouts = Object.values(state.scouts).filter((s) => s.owner === forTribe);
  const myCaravans = Object.values(state.caravans).filter((c) => c.owner === forTribe);

  return {
    tick: state.tick,
    forTribe,
    visibleRegions,
    visibleForces: [],
    visibleTransits: [],
    visibleScouts: [],
    myPlayerState,
    myForces,
    myScouts,
    myCaravans,
    inboxNew: [],
    announcementsNew: [],
    pactsInvolvingMe: state.pacts.filter((p) => p.parties.includes(forTribe)),
    legalOrderOptions: [],
    tribesAlive: state.tribesAlive,
    tickLimit: state.tickLimit ?? DEFAULT_TICK_LIMIT,
  };
}

/** Minimal GameState-like object for components that need full state (scoreboard). */
export function parsedStateToGameStateSnapshot(state: ParsedReplayState): Pick<
  ParsedReplayState,
  | "tick"
  | "tribesAlive"
  | "winner"
  | "regions"
  | "trails"
  | "forces"
  | "scouts"
  | "caravans"
  | "players"
  | "pacts"
> {
  return {
    tick: state.tick,
    tribesAlive: [...state.tribesAlive],
    winner: state.winner,
    regions: state.regions,
    trails: state.trails,
    forces: state.forces,
    scouts: state.scouts,
    caravans: state.caravans,
    players: state.players,
    pacts: state.pacts,
  };
}

/** Build ParsedReplayState from a replay snapshot (same shape as engine state for these fields). */
export function parsedReplayStateFromGameState(state: ParsedReplayState): ParsedReplayState {
  const regions: Record<string, Region> = { ...state.regions };
  const forces: Record<string, Force> = { ...state.forces };
  const scouts: Record<string, Scout> = { ...state.scouts };
  const caravans: Record<string, Caravan> = { ...state.caravans };
  const players: Record<Tribe, PlayerState> = { ...state.players };
  return {
    tick: state.tick,
    tickLimit: state.tickLimit,
    tribesAlive: [...state.tribesAlive],
    winner: state.winner,
    regions,
    trails: [...state.trails],
    forces,
    scouts,
    caravans,
    players,
    pacts: [...state.pacts],
  };
}
