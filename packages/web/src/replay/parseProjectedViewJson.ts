/**
 * Convert Python/JSON `project_for_player` shape (snake_case) to engine2 ProjectedView.
 */

import type {
  Announcement,
  Caravan,
  Force,
  FuzzyTier,
  InboxMessage,
  LegalOrderOption,
  Pact,
  ProjectedView,
  Proposal,
  Region,
  RegionType,
  Scout,
  StructureKind,
  Tribe,
  VisibleForce,
  VisibleScout,
  VisibleTransit,
} from "@rr/shared";
import { DEFAULT_TICK_LIMIT } from "./replayConstants.js";

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function tribe(x: unknown): Tribe {
  return String(x ?? "") as Tribe;
}

function parseRegion(j: Record<string, unknown>): Region {
  const roadTargets: Record<number, string> = {};
  const rawRt = j.road_targets ?? j.roadTargets;
  if (isRecord(rawRt)) {
    for (const [k, v] of Object.entries(rawRt)) {
      roadTargets[Number(k)] = String(v);
    }
  }
  const structures = Array.isArray(j.structures)
    ? (j.structures as unknown[]).map((s) => String(s) as StructureKind)
    : [];
  return {
    id: String(j.id ?? ""),
    type: String(j.type ?? "plains") as RegionType,
    owner: j.owner == null ? null : (String(j.owner) as Tribe),
    structures,
    roadTargets,
    garrisonForceId: j.garrison_force_id != null ? String(j.garrison_force_id) : null,
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

function parseInboxMessage(j: Record<string, unknown>): InboxMessage {
  const row: InboxMessage = {
    tick: Number(j.tick ?? 0),
    kind: j.kind as InboxMessage["kind"],
  };
  const from = j.from_tribe ?? j.from;
  if (from != null) (row as { from?: Tribe }).from = tribe(from);
  if (j.text != null) (row as { text?: string }).text = String(j.text);
  if (j.reputation_penalty != null)
    (row as { reputationPenalty?: boolean }).reputationPenalty = Boolean(j.reputation_penalty);
  if (isRecord(j.proposal)) (row as { proposal?: Proposal }).proposal = parseProposal(j.proposal);
  if (isRecord(j.payload)) (row as { payload?: Record<string, unknown> }).payload = j.payload;
  return row;
}

function parsePlayerState(j: Record<string, unknown> | null | undefined): ProjectedView["myPlayerState"] {
  if (!j) {
    return {
      tribe: "orange",
      influence: 0,
      reputationPenaltyExpiresTick: 0,
      inbox: [],
      outstandingProposals: [],
    };
  }
  const inboxRaw = Array.isArray(j.inbox) ? j.inbox : [];
  const outRaw = Array.isArray(j.outstanding_proposals) ? j.outstanding_proposals : [];
  return {
    tribe: tribe(j.tribe),
    influence: Number(j.influence ?? 0),
    reputationPenaltyExpiresTick: Number(
      j.reputation_penalty_expires_tick ?? j.reputationPenaltyExpiresTick ?? 0,
    ),
    inbox: inboxRaw.map((x) => parseInboxMessage(isRecord(x) ? x : {})),
    outstandingProposals: outRaw.map((x) =>
      isRecord(x) ? parseProposal(x) : parseProposal({}),
    ),
  };
}

function parseForce(j: Record<string, unknown>): Force {
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
  const tr = isRecord(j.location_transit ?? j.locationTransit) ? (j.location_transit ?? j.locationTransit) : null;
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

function parseScout(j: Record<string, unknown>): Scout {
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

function parseCaravan(j: Record<string, unknown>): Caravan {
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

function parseLegalOption(j: Record<string, unknown>): LegalOrderOption {
  return {
    id: String(j.id ?? ""),
    kind: j.kind as LegalOrderOption["kind"],
    summary: String(j.summary ?? ""),
    payload: isRecord(j.payload) ? j.payload : {},
  };
}

function parseVisibleForce(j: Record<string, unknown>): VisibleForce {
  return {
    regionId: String(j.region_id ?? j.regionId ?? ""),
    owner: tribe(j.owner),
    fuzzyTier: String(j.fuzzy_tier ?? j.fuzzyTier ?? "warband") as FuzzyTier,
  };
}

function parseVisibleTransit(j: Record<string, unknown>): VisibleTransit {
  return {
    trailIndex: Number(j.trail_index ?? j.trailIndex ?? 0),
    observedInRegionId: String(j.observed_in_region_id ?? j.observedInRegionId ?? ""),
    owner: tribe(j.owner),
    fuzzyTier: String(j.fuzzy_tier ?? j.fuzzyTier ?? "warband") as FuzzyTier,
    directionFrom: String(j.direction_from ?? j.directionFrom ?? ""),
    directionTo: String(j.direction_to ?? j.directionTo ?? ""),
  };
}

function parseVisibleScout(j: Record<string, unknown>): VisibleScout {
  return {
    regionId: String(j.region_id ?? j.regionId ?? ""),
    owner: tribe(j.owner),
  };
}

/**
 * Parse JSON from `frame.projected_views[tribe]` (Python or TS-serialized).
 */
export function parseProjectedViewJson(raw: unknown): ProjectedView | null {
  if (!isRecord(raw)) return null;

  const visibleRegions: Record<string, Region> = {};
  const vr = raw.visible_regions ?? raw.visibleRegions;
  if (isRecord(vr)) {
    for (const [rid, rv] of Object.entries(vr)) {
      if (isRecord(rv)) visibleRegions[rid] = parseRegion(rv);
    }
  }

  const vfRaw = raw.visible_forces ?? raw.visibleForces;
  const vf: unknown[] = Array.isArray(vfRaw) ? vfRaw : [];
  const visibleForces: VisibleForce[] = vf
    .filter(isRecord)
    .map((x: Record<string, unknown>) => parseVisibleForce(x));

  const vtRaw = raw.visible_transits ?? raw.visibleTransits;
  const vt: unknown[] = Array.isArray(vtRaw) ? vtRaw : [];
  const visibleTransits: VisibleTransit[] = vt
    .filter(isRecord)
    .map((x: Record<string, unknown>) => parseVisibleTransit(x));

  const vsRaw = raw.visible_scouts ?? raw.visibleScouts;
  const vs: unknown[] = Array.isArray(vsRaw) ? vsRaw : [];
  const visibleScouts: VisibleScout[] = vs
    .filter(isRecord)
    .map((x: Record<string, unknown>) => parseVisibleScout(x));

  const myPs = raw.my_player_state ?? raw.myPlayerState;
  const myPlayerState = parsePlayerState(isRecord(myPs) ? myPs : null);

  const mfRaw = raw.my_forces ?? raw.myForces;
  const mf: unknown[] = Array.isArray(mfRaw) ? mfRaw : [];
  const myForces: Force[] = mf
    .filter(isRecord)
    .map((x: Record<string, unknown>) => parseForce(x));

  const msRaw = raw.my_scouts ?? raw.myScouts;
  const ms: unknown[] = Array.isArray(msRaw) ? msRaw : [];
  const myScouts: Scout[] = ms
    .filter(isRecord)
    .map((x: Record<string, unknown>) => parseScout(x));

  const mcRaw = raw.my_caravans ?? raw.myCaravans;
  const mc: unknown[] = Array.isArray(mcRaw) ? mcRaw : [];
  const myCaravans: Caravan[] = mc
    .filter(isRecord)
    .map((x: Record<string, unknown>) => parseCaravan(x));

  const inboxNewRawUnknown = raw.inbox_new ?? raw.inboxNew;
  const inboxNewRaw: unknown[] = Array.isArray(inboxNewRawUnknown)
    ? inboxNewRawUnknown
    : [];
  const inboxNew = inboxNewRaw.filter(isRecord).map((x: Record<string, unknown>) =>
    parseInboxMessage(x),
  );

  const annRaw = raw.announcements_new ?? raw.announcementsNew;
  const ann: unknown[] = Array.isArray(annRaw) ? annRaw : [];
  const announcementsNew: Announcement[] = ann.filter(isRecord).map(
    (x: Record<string, unknown>) => ({
      tick: Number(x.tick ?? 0),
      kind: x.kind as Announcement["kind"],
      parties: Array.isArray(x.parties) ? (x.parties as unknown[]).map(tribe) : undefined,
      detail: x.detail != null ? String(x.detail) : undefined,
      breaker: x.breaker != null ? tribe(x.breaker) : undefined,
      interceptor: x.interceptor != null ? tribe(x.interceptor) : undefined,
      amount: x.amount != null ? Number(x.amount) : undefined,
      condition: x.condition != null ? String(x.condition) : undefined,
    }),
  );

  const pactsRawUnknown = raw.pacts_involving_me ?? raw.pactsInvolvingMe;
  const pactsRaw: unknown[] = Array.isArray(pactsRawUnknown) ? pactsRawUnknown : [];
  const pactsInvolvingMe: Pact[] = pactsRaw
    .filter(isRecord)
    .map((x: Record<string, unknown>) => parsePact(x));

  const legalRawUnknown = raw.legal_order_options ?? raw.legalOrderOptions;
  const legalRaw: unknown[] = Array.isArray(legalRawUnknown) ? legalRawUnknown : [];
  const legalOrderOptions: LegalOrderOption[] = legalRaw
    .filter(isRecord)
    .map((x: Record<string, unknown>) => parseLegalOption(x));

  const tribesAlive = Array.isArray(raw.tribes_alive ?? raw.tribesAlive)
    ? ((raw.tribes_alive ?? raw.tribesAlive) as unknown[]).map(tribe)
    : [];

  const tickLimit = Number(raw.tick_limit ?? raw.tickLimit ?? DEFAULT_TICK_LIMIT);

  return {
    tick: Number(raw.tick ?? 0),
    forTribe: tribe(raw.for_tribe ?? raw.forTribe),
    visibleRegions,
    visibleForces,
    visibleTransits,
    visibleScouts,
    myPlayerState,
    myForces,
    myScouts,
    myCaravans,
    inboxNew,
    announcementsNew,
    pactsInvolvingMe,
    legalOrderOptions,
    tribesAlive,
    tickLimit,
  };
}
