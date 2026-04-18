import type { MatchState, PlayerState, TradeOffer } from "./state.js";
import { BEAD_VULN_MODE, RES_KEYS } from "./rules.js";
import type { LogEvent } from "./log.js";

export function canPayResources(ps: PlayerState, cost: Partial<Record<string, number>>): boolean {
  for (const k of RES_KEYS) {
    const v = cost[k as keyof typeof cost];
    if (v && ps.resources[k] < v) return false;
  }
  return true;
}

export function applyBeadConversions(state: MatchState, pid: string): LogEvent[] {
  const ps = state.players[pid];
  const out: LogEvent[] = [];
  while (ps.beads >= 2) {
    ps.beads -= 2;
    ps.vp += 1;
    out.push({
      type: "bead_converted",
      round: state.round,
      player_id: pid,
      vp_gained: 1,
    });
  }
  return out;
}

/**
 * Resolve a trade if both sides can pay. Mutates `state`.
 * Mirrors `GameEngine.resolve_trade` in tools/sim.py.
 */
export function resolveTrade(
  state: MatchState,
  offer: TradeOffer,
): { ok: true; resolved: Record<string, unknown>; events: LogEvent[] } | { ok: false } {
  const oid = offer.id;
  const a = offer.offerer;
  const b = offer.recipient;
  const pa = state.players[a];
  const pb = state.players[b];
  const off = { ...offer.offered };
  const req = { ...offer.requested };

  if (!canPayResources(pa, off) || !canPayResources(pb, req)) {
    return { ok: false };
  }

  const first = !pa.partnersTraded.includes(b);

  for (const k of RES_KEYS) {
    pa.resources[k] -= off[k] ?? 0;
    pa.resources[k] += req[k] ?? 0;
    pb.resources[k] -= req[k] ?? 0;
    pb.resources[k] += off[k] ?? 0;
  }

  if (!pa.partnersTraded.includes(b)) pa.partnersTraded.push(b);
  if (!pb.partnersTraded.includes(a)) pb.partnersTraded.push(a);

  const beadsAwarded: Record<string, number> = { [a]: 0, [b]: 0 };
  const extra: LogEvent[] = [];

  for (const [pid, partner] of [
    [a, b] as const,
    [b, a] as const,
  ]) {
    const ps = state.players[pid];
    if (ps.beadsEarnedThisRound < 2) {
      // v0.8 canonical: park the bead in pendingBeads so runEndOfRound can
      // divert it if the earner is ambushed this round. Legacy "off" mode
      // awards + converts immediately (for pre-v0.8 replay determinism).
      if (BEAD_VULN_MODE === "off") {
        ps.beads += 1;
      } else {
        ps.pendingBeads += 1;
      }
      ps.beadsEarnedThisRound += 1;
      beadsAwarded[pid] = 1;
      extra.push({
        type: "bead_earned",
        round: state.round,
        player_id: pid,
        partner,
      });
    } else {
      beadsAwarded[pid] = 0;
      extra.push({
        type: "bead_capped",
        round: state.round,
        player_id: pid,
        partner,
      });
    }
  }

  // v0.8: 2-bead -> 1-VP conversion is deferred to runEndOfRound so pending
  // beads are actually at risk. Only the legacy "off" mode converts here.
  if (BEAD_VULN_MODE === "off") {
    for (const pid of [a, b].sort()) {
      extra.push(...applyBeadConversions(state, pid));
    }
  }

  const resolved = {
    type: "trade_resolved",
    round: state.round,
    offer_id: oid,
    offerer_id: a,
    acceptor_id: b,
    offered: off,
    requested: req,
    beads_awarded: beadsAwarded,
    first_trade_between_pair: first,
  };

  return { ok: true, resolved, events: extra };
}

export function expireOffersFromOfferer(state: MatchState, pid: string): LogEvent[] {
  const out: LogEvent[] = [];
  const remain: TradeOffer[] = [];
  for (const o of state.pendingOffers) {
    if (o.offerer === pid) {
      out.push({
        type: "trade_expired",
        round: state.round,
        offer_id: o.id,
      });
    } else {
      remain.push(o);
    }
  }
  state.pendingOffers = remain;
  return out;
}

export function findOffer(state: MatchState, offerId: string): TradeOffer | undefined {
  return state.pendingOffers.find((o) => o.id === offerId);
}

export function removeOffer(state: MatchState, offerId: string): TradeOffer | undefined {
  const idx = state.pendingOffers.findIndex((o) => o.id === offerId);
  if (idx < 0) return undefined;
  const [o] = state.pendingOffers.splice(idx, 1);
  return o;
}
