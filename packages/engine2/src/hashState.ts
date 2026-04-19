import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type {
  Caravan,
  Force,
  GameState,
  Pact,
  Region,
  Scout,
} from "./types.js";

/** Recursive key sort for stable JSON comparisons (tests, traces). */
export function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeysDeep(obj[key]);
  }
  return sorted;
}

function regionForHash(r: Region): Record<string, unknown> {
  const road_targets: Record<string, unknown> = {};
  for (const k of Object.keys(r.roadTargets).sort((a, b) => Number(a) - Number(b))) {
    const idx = Number(k) as keyof typeof r.roadTargets;
    road_targets[String(k)] = r.roadTargets[idx];
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

function forceForHash(f: Force): Record<string, unknown> {
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

function scoutForHash(s: Scout): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: s.id,
    owner: s.owner,
    target_region_id: s.targetRegionId,
  };
  if (s.location.kind === "transit") {
    return {
      ...base,
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
    ...base,
    location_kind: "arrived",
    location_region_id: s.location.regionId,
    expires_tick: s.location.expiresTick,
    transit: null,
  };
}

function caravanForHash(c: Caravan): Record<string, unknown> {
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

function pactForHash(p: Pact): Record<string, unknown> {
  return {
    kind: p.kind,
    parties: [p.parties[0], p.parties[1]],
    formed_tick: p.formedTick,
    expires_tick: p.expiresTick,
  };
}

/**
 * SHA-256 over canonical JSON matching `tools/v2/engine.py` `_hash_state`.
 */
export function hashState(state: GameState): string {
  const canonicalObj: Record<string, unknown> = {
    tick: state.tick,
    tribes_alive: [...state.tribesAlive].sort((a, b) => a.localeCompare(b)),
    regions: Object.fromEntries(
      Object.keys(state.regions)
        .sort((a, b) => a.localeCompare(b))
        .map((k) => [k, regionForHash(state.regions[k]!)]),
    ),
    forces: Object.fromEntries(
      Object.keys(state.forces)
        .sort((a, b) => a.localeCompare(b))
        .map((k) => [k, forceForHash(state.forces[k]!)]),
    ),
    scouts: Object.fromEntries(
      Object.keys(state.scouts)
        .sort((a, b) => a.localeCompare(b))
        .map((k) => [k, scoutForHash(state.scouts[k]!)]),
    ),
    caravans: Object.fromEntries(
      Object.keys(state.caravans)
        .sort((a, b) => a.localeCompare(b))
        .map((k) => [k, caravanForHash(state.caravans[k]!)]),
    ),
    players: Object.fromEntries(
      Object.keys(state.players)
        .sort((a, b) => a.localeCompare(b))
        .map((k) => {
          const p = state.players[k as keyof typeof state.players];
          return [
            k,
            {
              influence: p.influence,
              reputation_penalty_expires_tick: p.reputationPenaltyExpiresTick,
            },
          ];
        }),
    ),
    pacts: [...state.pacts]
      .sort((a, b) => {
        const ck = a.kind.localeCompare(b.kind);
        if (ck !== 0) return ck;
        const aKey = `${a.parties[0]},${a.parties[1]}`;
        const bKey = `${b.parties[0]},${b.parties[1]}`;
        return aKey.localeCompare(bKey);
      })
      .map(pactForHash),
    winner: state.winner,
  };
  const blob = JSON.stringify(sortKeysDeep(canonicalObj));
  const digest = bytesToHex(sha256(new TextEncoder().encode(blob)));
  return `sha256:${digest}`;
}
