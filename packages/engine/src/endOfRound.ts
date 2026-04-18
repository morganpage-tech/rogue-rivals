import type { MatchState } from "./state.js";
import { BEAD_VULN_MODE } from "./rules.js";
import type { LogEvent } from "./log.js";
import { applyBeadConversions } from "./trade.js";

export interface StandingsEntry {
  vp: number;
  rank: number;
  beads: number;
}

export function computeStandings(state: MatchState): Record<string, StandingsEntry> {
  const ids = [...state.seatPlayerIds];
  ids.sort((a, b) => {
    const pa = state.players[a];
    const pb = state.players[b];
    if (pb.vp !== pa.vp) return pb.vp - pa.vp;
    if (pb.buildings.length !== pa.buildings.length) {
      return pb.buildings.length - pa.buildings.length;
    }
    return a.localeCompare(b);
  });
  const out: Record<string, StandingsEntry> = {};
  let rank = 0;
  let lastVp: number | null = null;
  let pos = 0;
  for (const p of ids) {
    const vp = state.players[p].vp;
    pos += 1;
    if (vp !== lastVp) {
      rank = pos;
      lastVp = vp;
    }
    out[p] = {
      vp,
      rank,
      beads: state.players[p].beads,
    };
  }
  return out;
}

/** Clears ambushes, resets beads-earned counters, trailing bonus; emits round metadata. Mutates `state`. */
export function runEndOfRound(state: MatchState): LogEvent[] {
  const events: LogEvent[] = [];

  // v0.8 canonical: settle pending trade beads before resetting the per-round
  // bead cap and per-round hit bookkeeping. Legacy "off" mode is a no-op here
  // because pendingBeads is always 0 in that mode.
  if (BEAD_VULN_MODE !== "off") {
    for (const p of state.turnOrder) {
      const ps = state.players[p];
      const pending = ps.pendingBeads;
      if (pending <= 0) continue;
      ps.pendingBeads = 0;
      if (ps.hitsThisRound > 0) {
        const primary = ps.hitByThisRound[0] ?? null;
        if (BEAD_VULN_MODE === "deny" || primary === null) {
          events.push({
            type: "bead_denied",
            round: state.round,
            victim_id: p,
            beads: pending,
            cause: "ambushed",
          });
        } else {
          // "steal": transfer pending to first successful ambusher, who
          // banks them (bypassing the victim's 2/round earn cap) and then
          // runs the standard 2-bead -> 1-VP conversion.
          const ap = state.players[primary];
          ap.beads += pending;
          events.push({
            type: "bead_stolen",
            round: state.round,
            victim_id: p,
            ambusher_id: primary,
            beads: pending,
          });
          events.push(...applyBeadConversions(state, primary));
        }
      } else {
        // Safe -> bank and convert.
        ps.beads += pending;
        events.push(...applyBeadConversions(state, p));
      }
    }
  }

  for (const p of state.seatPlayerIds) {
    state.players[p].beadsEarnedThisRound = 0;
    state.players[p].hitsThisRound = 0;
    state.players[p].hitByThisRound = [];
  }

  for (const p of state.seatPlayerIds) {
    const ps = state.players[p];
    if (ps.activeAmbushRegion) {
      // v0.7.4: ambushes persist AMBUSH_PERSIST_ROUNDS end-of-round ticks
      // (2 by default) before expiring. Decrement TTL; only fire the
      // expired event and clear the region when it reaches zero.
      ps.ambushRoundsRemaining = Math.max(0, ps.ambushRoundsRemaining - 1);
      if (ps.ambushRoundsRemaining <= 0) {
        events.push({
          type: "ambush_expired",
          round: state.round,
          ambusher_id: p,
          region: ps.activeAmbushRegion,
        });
        ps.activeAmbushRegion = null;
      }
    }
    ps.watchtowerUsedThisRound = false;
  }

  const mv = Math.max(...state.seatPlayerIds.map((x) => state.players[x].vp));
  const mi = Math.min(...state.seatPlayerIds.map((x) => state.players[x].vp));
  const gap = mv - mi;

  for (const p of state.seatPlayerIds) {
    const ps = state.players[p];
    ps.trailingBonusActive = ps.vp === mi && gap >= 3;
  }

  const st = computeStandings(state);
  events.push({
    type: "round_end",
    round: state.round,
    standings_snapshot: st,
    vp_gap: gap,
  });

  return events;
}
