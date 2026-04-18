import type { MatchState } from "./state.js";
import type { LogEvent } from "./log.js";

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

  for (const p of state.seatPlayerIds) {
    state.players[p].beadsEarnedThisRound = 0;
  }

  for (const p of state.seatPlayerIds) {
    const ps = state.players[p];
    if (ps.activeAmbushRegion) {
      events.push({
        type: "ambush_expired",
        round: state.round,
        ambusher_id: p,
        region: ps.activeAmbushRegion,
      });
      ps.activeAmbushRegion = null;
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
