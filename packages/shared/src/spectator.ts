import type {
  Announcement,
  CaravanId,
  ForceId,
  ForceTier,
  ForceLocation,
  Pact,
  Region,
  RegionId,
  ResolutionEvent,
  ScoutId,
  ScoutLocation,
  Trail,
  Tribe,
} from "./engineTypes.js";

/** God-mode view — output of `projectForSpectator` on the server only. */
export interface SpectatorView {
  readonly tick: number;
  readonly tickLimit: number;
  readonly tribesAlive: Tribe[];
  readonly winner: Tribe | Tribe[] | null;

  readonly regions: Record<RegionId, Region>;
  /** Trail graph (needed for V2 map edge timings). */
  readonly trails: readonly Trail[];
  readonly forces: Record<ForceId, SpectatorForce>;
  readonly transits: SpectatorTransit[];
  readonly scouts: SpectatorScoutInfo[];
  readonly caravans: SpectatorCaravanInfo[];
  readonly pacts: Pact[];
  readonly announcements: Announcement[];
  readonly players: Record<Tribe, SpectatorPlayerState>;
  readonly resolutionEvents: ResolutionEvent[];
}

export interface SpectatorForce {
  readonly id: ForceId;
  readonly owner: Tribe;
  readonly tier: ForceTier;
  readonly location: ForceLocation;
}

export interface SpectatorTransit {
  readonly forceId: ForceId;
  readonly owner: Tribe;
  readonly tier: ForceTier;
  readonly trailIndex: number;
  readonly directionFrom: RegionId;
  readonly directionTo: RegionId;
  readonly ticksRemaining: number;
}

export interface SpectatorScoutInfo {
  readonly id: ScoutId;
  readonly owner: Tribe;
  readonly targetRegionId: RegionId;
  readonly location: ScoutLocation;
}

export interface SpectatorCaravanInfo {
  readonly id: CaravanId;
  readonly owner: Tribe;
  readonly recipient: Tribe;
  readonly amountInfluence: number;
  readonly path: RegionId[];
  readonly currentIndex: number;
  readonly ticksToNextRegion: number;
}

export interface SpectatorPlayerState {
  readonly tribe: Tribe;
  readonly influence: number;
  readonly reputationPenaltyExpiresTick: number;
}
