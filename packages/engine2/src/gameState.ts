import type {
  Announcement,
  Caravan,
  CaravanId,
  Force,
  ForceId,
  Pact,
  PlayerState,
  ProjectedView,
  Region,
  RegionId,
  ResolutionEvent,
  Scout,
  ScoutId,
  Trail,
  Tribe,
  VictoryCounters,
} from "@rr/shared";

/** The authoritative match state. Deterministic given seed + packet history. */
export interface GameState {
  readonly seed: number;
  readonly rulesVersion: "v2.0";
  tick: number;
  tribesAlive: Tribe[];

  regions: Record<RegionId, Region>;
  trails: Trail[];
  forces: Record<ForceId, Force>;
  scouts: Record<ScoutId, Scout>;
  caravans: Record<CaravanId, Caravan>;

  players: Record<Tribe, PlayerState>;
  pacts: Pact[];

  announcements: Announcement[];
  victoryCounters: VictoryCounters;

  /** null until a winning condition fires; a Tribe on solo win, an array on shared. */
  winner: Tribe | Tribe[] | null;

  /**
   * Monotonic ID counters for runtime-generated entities (mirrors Python
   * `GameState.next_*`). Omitted from {@link hashState} (parity JSON matches
   * Python subset only).
   */
  nextForceIdx: number;
  nextScoutIdx: number;
  nextCaravanIdx: number;
  nextProposalIdx: number;
}

/** Result of resolving one tick (§5.1–§5.10). */
export interface TickResult {
  /** Mutated-in-place GameState (same reference as input). */
  readonly state: GameState;
  readonly events: readonly ResolutionEvent[];
  readonly projectedViews: Readonly<Record<Tribe, ProjectedView>>;
  /** Stable hash of `state` post-resolution, for conformance tests. */
  readonly stateHash: string;
}
