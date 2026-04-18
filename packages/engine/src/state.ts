import type {
  BuildingType,
  Region,
  Resource,
  Resources,
  Tribe,
} from "./rules.js";
import { BUILD_ORDER, emptyResources, RES_KEYS, TRIBE_HOME } from "./rules.js";
import type { RngState } from "./rng.js";

export interface PlayerState {
  id: string;
  tribe: Tribe;
  vp: number;
  resources: Resources;
  beads: number;
  beadsEarnedThisRound: number;
  partnersTraded: string[];
  buildings: BuildingType[];
  activeAmbushRegion: Region | null;
  /**
   * v0.7.4: end-of-round ticks remaining before the active ambush expires.
   * Set to AMBUSH_PERSIST_ROUNDS on applyAmbushSet; decremented in
   * runEndOfRound; reset to 0 when ambush is triggered, absorbed, or scouted.
   * When 0 with activeAmbushRegion !== null, the next end-of-round fires the
   * ambush_expired event.
   */
  ambushRoundsRemaining: number;
  /**
   * v0.8: beads awarded from trades in the current round live here until
   * `runEndOfRound` settles them. Under BEAD_VULN_MODE === "steal" (canonical),
   * if the earner suffered any successful ambush this round these beads are
   * transferred to the first ambusher; otherwise they flow into `beads` and
   * the normal 2-bead -> 1-VP conversion runs. Under "deny" they are
   * destroyed. Under "off" this field is unused and stays 0.
   */
  pendingBeads: number;
  /**
   * v0.8: hits suffered this round (any ambush_triggered where this player
   * was the victim, excluding watchtower_absorbed). Reset in runEndOfRound
   * after pending-bead settlement.
   */
  hitsThisRound: number;
  /**
   * v0.8: ordered list of ambushers who successfully hit this player this
   * round (same exclusions as hitsThisRound). Used by the "steal" path to
   * pick the primary ambusher deterministically (first hitter wins the
   * pending beads). Reset in runEndOfRound.
   */
  hitByThisRound: string[];
  watchtowerUsedThisRound: boolean;
  trailingBonusActive: boolean;
  tributeRouteWith: string | null;
  tributeRouteRoundsLeft: number;
}

export interface TradeOffer {
  id: string;
  offerer: string;
  recipient: string;
  offered: Partial<Resources>;
  requested: Partial<Resources>;
  createdTurn: number;
  status: "pending" | "accepted" | "rejected" | "expired" | "countered";
  /** Simulation extension for tribute-route payments as trades */
  tributeRoutePayment?: boolean;
}

export type EndTrigger = "round_limit" | "vp_threshold" | "great_hall";

export interface MatchState {
  rulesVersion: "v0.8";
  seed: number;
  /** Mulberry32 PRNG state; all randomness goes through this. */
  rng: RngState;
  /** Player ids in seat order (e.g. P1..Pn as configured). */
  seatPlayerIds: string[];
  turnOrder: string[];
  round: number;
  /** Player whose turn it is (free phase + action). */
  currentPlayerId: string;
  scrapPool: number;
  players: Record<string, PlayerState>;
  pendingOffers: TradeOffer[];
  matchEnded: boolean;
  endTrigger: EndTrigger | null;
  offerSeq: number;
  greatHallBuiltThisRound: boolean;
  /** After advancing turn, next player needs expire-my-offers on first interaction */
  needsTurnOpenExpire: boolean;
}

export type Action =
  | { kind: "gather"; region: Region }
  | {
      kind: "build";
      building: BuildingType;
      forgePickedResources?: Resource[];
    }
  | { kind: "ambush"; region: Region }
  | { kind: "scout"; region: Region }
  | { kind: "pass" };

export type CounterPayload = {
  offered: Partial<Resources>;
  requested: Partial<Resources>;
};

export type Command =
  | {
      kind: "propose_trade";
      offer: Omit<TradeOffer, "id" | "status" | "createdTurn"> & {
        id?: string;
        tributeRoutePayment?: boolean;
      };
    }
  | { kind: "accept_trade"; offerId: string }
  | { kind: "reject_trade"; offerId: string }
  | { kind: "counter_trade"; offerId: string; counter: CounterPayload }
  | { kind: "take_action"; action: Action };

export function insertBuildingSorted(buildings: BuildingType[], bt: BuildingType): BuildingType[] {
  const next = [...buildings, bt];
  next.sort((a, b) => BUILD_ORDER.indexOf(a) - BUILD_ORDER.indexOf(b));
  return next;
}

export function cloneResources(r: Resources): Resources {
  return { ...r };
}

export function clonePlayer(ps: PlayerState): PlayerState {
  return {
    ...ps,
    resources: cloneResources(ps.resources),
    partnersTraded: [...ps.partnersTraded],
    buildings: [...ps.buildings],
    hitByThisRound: [...ps.hitByThisRound],
  };
}

export function cloneMatchState(s: MatchState): MatchState {
  return {
    ...s,
    rng: { ...s.rng },
    seatPlayerIds: [...s.seatPlayerIds],
    turnOrder: [...s.turnOrder],
    players: Object.fromEntries(
      Object.entries(s.players).map(([k, v]) => [k, clonePlayer(v)]),
    ),
    pendingOffers: s.pendingOffers.map((o) => ({
      ...o,
      offered: { ...o.offered },
      requested: { ...o.requested },
    })),
  };
}

export function createInitialPlayer(id: string, tribe: Tribe): PlayerState {
  const resources = emptyResources();
  const home = TRIBE_HOME[tribe].resource;
  resources[home] = 2;
  return {
    id,
    tribe,
    vp: 0,
    resources,
    beads: 0,
    beadsEarnedThisRound: 0,
    partnersTraded: [],
    buildings: [],
    activeAmbushRegion: null,
    ambushRoundsRemaining: 0,
    pendingBeads: 0,
    hitsThisRound: 0,
    hitByThisRound: [],
    watchtowerUsedThisRound: false,
    trailingBonusActive: false,
    tributeRouteWith: null,
    tributeRouteRoundsLeft: 0,
  };
}

/** Snapshot shape matching simulation logs `state_before` / `state_after` */
export function snapshotPrivate(ps: PlayerState): Record<string, unknown> {
  return {
    vp: ps.vp,
    resources: Object.fromEntries(RES_KEYS.map((k) => [k, ps.resources[k]])),
    beads: ps.beads,
    partners_traded: [...ps.partnersTraded],
    buildings: [...ps.buildings],
    active_ambush_region: ps.activeAmbushRegion,
    trailing_bonus_active: ps.trailingBonusActive,
    tribute_route:
      ps.tributeRouteWith && ps.tributeRouteRoundsLeft > 0
        ? {
            as: "requester",
            partner_id: ps.tributeRouteWith,
            rounds_remaining: ps.tributeRouteRoundsLeft,
          }
        : null,
    beads_earned_this_round: ps.beadsEarnedThisRound,
  };
}
