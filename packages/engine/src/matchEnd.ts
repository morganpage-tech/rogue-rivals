import type { MatchState } from "./state.js";
import { MAX_ROUNDS, VP_WIN_THRESHOLD } from "./rules.js";
import type { LogEvent } from "./log.js";
import { runEndOfRound } from "./endOfRound.js";

export function anyPlayerReachedVp(state: MatchState): boolean {
  return state.seatPlayerIds.some((p) => state.players[p].vp >= VP_WIN_THRESHOLD);
}

/**
 * After a successful `take_action`: advance turn and possibly end the match.
 * Mutates `state`; appends to `events`.
 */
export function advanceAfterTakeAction(state: MatchState, events: LogEvent[]): void {
  if (anyPlayerReachedVp(state)) {
    state.matchEnded = true;
    state.endTrigger = "vp_threshold";
    events.push(...runEndOfRound(state));
    return;
  }

  const idx = state.turnOrder.indexOf(state.currentPlayerId);
  const nextIdx = idx + 1;
  if (nextIdx < state.turnOrder.length) {
    state.currentPlayerId = state.turnOrder[nextIdx]!;
    state.needsTurnOpenExpire = true;
    return;
  }

  events.push(...runEndOfRound(state));

  if (state.greatHallBuiltThisRound) {
    state.matchEnded = true;
    state.endTrigger = "great_hall";
    return;
  }

  if (state.round >= MAX_ROUNDS) {
    state.matchEnded = true;
    state.endTrigger = "round_limit";
    return;
  }

  state.round += 1;
  state.greatHallBuiltThisRound = false;
  state.needsTurnOpenExpire = true;
  state.currentPlayerId = state.turnOrder[0]!;
}

export function computeMatchOutcome(state: MatchState): {
  winner_ids: string[];
  end_trigger: string;
  tiebreaker_used: string | null;
  shared_victory: boolean;
} {
  const ids = [...state.seatPlayerIds];
  ids.sort((a, b) => {
    const pa = state.players[a];
    const pb = state.players[b];
    if (pb.vp !== pa.vp) return pb.vp - pa.vp;
    if (pb.buildings.length !== pa.buildings.length) {
      return pb.buildings.length - pa.buildings.length;
    }
    if (pb.partnersTraded.length !== pa.partnersTraded.length) {
      return pb.partnersTraded.length - pa.partnersTraded.length;
    }
    return a.localeCompare(b);
  });
  const top = ids[0]!;
  const topVp = state.players[top].vp;
  const tied = ids.filter((p) => state.players[p].vp === topVp);
  let tb: string | null = null;
  let shared = false;
  let winners: string[];
  if (tied.length === 1) {
    winners = [tied[0]!];
  } else {
    const mb = Math.max(...tied.map((p) => state.players[p].buildings.length));
    const t2 = tied.filter((p) => state.players[p].buildings.length === mb);
    if (t2.length === 1) {
      winners = [t2[0]!];
      tb = "buildings";
    } else {
      const mp = Math.max(...t2.map((p) => state.players[p].partnersTraded.length));
      const t3 = t2.filter((p) => state.players[p].partnersTraded.length === mp);
      if (t3.length === 1) {
        winners = [t3[0]!];
        tb = "trade_partners";
      } else {
        winners = [...t3].sort();
        shared = true;
      }
    }
  }
  return {
    winner_ids: winners,
    end_trigger: state.endTrigger ?? "round_limit",
    tiebreaker_used: tb,
    shared_victory: shared,
  };
}
