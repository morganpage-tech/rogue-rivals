import type {
  Caravan,
  Force,
  PlayerState,
  Scout,
  Tribe,
} from "@rr/shared";
import type { SpectatorView, SpectatorPlayerState } from "@rr/shared";

import type { ParsedReplayState } from "./parseReplayStateSnapshot.js";

function playerStateFromSpectator(
  tribe: Tribe,
  sp: SpectatorPlayerState | undefined,
): PlayerState {
  return {
    tribe: sp?.tribe ?? tribe,
    influence: sp?.influence ?? 0,
    reputationPenaltyExpiresTick: sp?.reputationPenaltyExpiresTick ?? 0,
    inbox: [],
    outstandingProposals: [],
  };
}

/**
 * Convert a server `SpectatorView` into `ParsedReplayState` so replay helpers
 * (`buildOmniscientProjectedViewFromState`, `trailBaseTicksMap`, `V2Map`) apply.
 */
export function spectatorViewToParsedReplayState(v: SpectatorView): ParsedReplayState {
  const forces = { ...v.forces } as Record<string, Force>;
  const scouts: Record<string, Scout> = {};
  for (const s of v.scouts) {
    scouts[s.id] = s as Scout;
  }
  const caravans: Record<string, Caravan> = {};
  for (const c of v.caravans) {
    caravans[c.id] = c as Caravan;
  }

  const players = {} as Record<Tribe, PlayerState>;
  for (const t of Object.keys(v.players) as Tribe[]) {
    players[t] = playerStateFromSpectator(t, v.players[t]);
  }

  return {
    tick: v.tick,
    tickLimit: v.tickLimit,
    tribesAlive: [...v.tribesAlive],
    winner: v.winner,
    regions: { ...v.regions },
    trails: [...(v.trails ?? [])],
    forces,
    scouts,
    caravans,
    players,
    pacts: [...v.pacts],
  };
}
