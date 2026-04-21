import { DEFAULT_TICK_LIMIT } from "./constants.js";
import type { GameState } from "./gameState.js";
import type {
  Caravan,
  Force,
  ResolutionEvent,
  Scout,
  Tribe,
} from "./types.js";
import type {
  SpectatorCaravanInfo,
  SpectatorForce,
  SpectatorPlayerState,
  SpectatorScoutInfo,
  SpectatorTransit,
  SpectatorView,
} from "@rr/shared";

/** Optional overrides when building a spectator snapshot (e.g. match tick cap). */
export interface ProjectForSpectatorOptions {
  readonly tickLimit?: number;
}

function toSpectatorForce(f: Force): SpectatorForce {
  return {
    id: f.id,
    owner: f.owner,
    tier: f.tier,
    location: f.location,
  };
}

function toSpectatorTransit(f: Force): SpectatorTransit | null {
  if (f.location.kind !== "transit") return null;
  const tr = f.location;
  return {
    forceId: f.id,
    owner: f.owner,
    tier: f.tier,
    trailIndex: tr.trailIndex,
    directionFrom: tr.directionFrom,
    directionTo: tr.directionTo,
    ticksRemaining: tr.ticksRemaining,
  };
}

function toSpectatorScout(s: Scout): SpectatorScoutInfo {
  return {
    id: s.id,
    owner: s.owner,
    targetRegionId: s.targetRegionId,
    location: s.location,
  };
}

function toSpectatorCaravan(c: Caravan): SpectatorCaravanInfo {
  return {
    id: c.id,
    owner: c.owner,
    recipient: c.recipient,
    amountInfluence: c.amountInfluence,
    path: [...c.path],
    currentIndex: c.currentIndex,
    ticksToNextRegion: c.ticksToNextRegion,
  };
}

function spectatorPlayers(
  state: GameState,
): Record<Tribe, SpectatorPlayerState> {
  const out = {} as Record<Tribe, SpectatorPlayerState>;
  for (const t of Object.keys(state.players) as Tribe[]) {
    const p = state.players[t]!;
    out[t] = {
      tribe: t,
      influence: p.influence,
      reputationPenaltyExpiresTick: p.reputationPenaltyExpiresTick,
    };
  }
  return out;
}

/**
 * God-mode projection: full map, exact tiers, all diplomacy. No RNG, no mutation.
 * Pass `resolutionEvents` from the tick result for combat/diplomacy lines on this tick.
 */
export function projectForSpectator(
  state: GameState,
  resolutionEvents: readonly ResolutionEvent[] = [],
  options?: ProjectForSpectatorOptions,
): SpectatorView {
  const tickLimit = options?.tickLimit ?? DEFAULT_TICK_LIMIT;
  const forces: Record<string, SpectatorForce> = {};
  const transits: SpectatorTransit[] = [];
  for (const f of Object.values(state.forces)) {
    forces[f.id] = toSpectatorForce(f);
    const tr = toSpectatorTransit(f);
    if (tr) transits.push(tr);
  }

  const scouts: SpectatorScoutInfo[] = Object.values(state.scouts).map(
    toSpectatorScout,
  );
  const caravans: SpectatorCaravanInfo[] = Object.values(state.caravans).map(
    toSpectatorCaravan,
  );

  return {
    tick: state.tick,
    tickLimit,
    tribesAlive: [...state.tribesAlive],
    winner: state.winner,
    regions: { ...state.regions },
    trails: [...state.trails],
    forces,
    transits,
    scouts,
    caravans,
    pacts: [...state.pacts],
    announcements: [...state.announcements],
    players: spectatorPlayers(state),
    resolutionEvents: [...resolutionEvents],
  };
}
