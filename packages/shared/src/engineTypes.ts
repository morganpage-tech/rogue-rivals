/**
 * @rr/shared — Wire-facing types for Rogue Rivals v2 (shared by engine, server, web).
 * `GameState` and `TickResult` live in `@rr/engine2` only.
 *
 * Companion spec: `RULES.md` in the repo root.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Identity primitives
// ─────────────────────────────────────────────────────────────────────────────

/** Canonical roster for authored v2 maps (continent / expanded / hand). */
export type Tribe =
  | "orange"
  | "grey"
  | "brown"
  | "red"
  | "tricoloured"
  | "arctic";

/** Terrain types, as per RULES.md §4.1. */
export type RegionType =
  | "plains"
  | "mountains"
  | "swamps"
  | "desert"
  | "ruins"
  | "forest"
  | "river_crossing";

/** Structures buildable in regions, per RULES.md §4.3. */
export type StructureKind =
  | "granary"
  | "fort"
  | "road"
  | "watchtower"
  | "shrine"
  | "forge";

/** Force strength (any positive integer; tiers 1–4 are the recruitable building blocks). */
export type ForceTier = number;

/**
 * Fuzzy tier string shown to observers under fog of war.
 * Mapping (§9):
 *   1 → "raiding_party"
 *   2 → "warband"
 *   3 → "large_host"
 *   4 → "massive_army"
 */
export type FuzzyTier =
  | "raiding_party"
  | "warband"
  | "large_host"
  | "massive_army";

/** String IDs keep trace files and LLM prompts diff-friendly. */
export type RegionId = string;
export type ForceId = string;
export type ScoutId = string;
export type CaravanId = string;
export type ProposalId = string;

// ─────────────────────────────────────────────────────────────────────────────
// World structure
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A map edge. Trail length (in ticks) depends on endpoint terrains and is
 * computed once at match init per RULES.md §4.4. Road structures reduce
 * the *effective* length for their specific edge; the base length here is
 * terrain-derived and immutable.
 */
export interface Trail {
  /** Index into `GameState.trails`; used as a stable handle from transits. */
  readonly index: number;
  readonly a: RegionId;
  readonly b: RegionId;
  readonly baseLengthTicks: number;
}

/**
 * A region. Structures are a list of 0–2 entries. If a `road` structure is
 * present, `roadTargets[index]` names the adjacent region that road shortens.
 */
export interface Region {
  readonly id: RegionId;
  readonly type: RegionType;
  owner: Tribe | null;
  structures: StructureKind[];
  /** Keyed by position in `structures`; only present for `road` entries. */
  roadTargets: Record<number, RegionId>;
  garrisonForceId: ForceId | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Forces, scouts, caravans (anything that can be "in transit")
// ─────────────────────────────────────────────────────────────────────────────

/** A force is either garrisoning a region or moving along a trail. */
export type ForceLocation =
  | { kind: "garrison"; regionId: RegionId }
  | {
      kind: "transit";
      trailIndex: number;
      directionFrom: RegionId;
      directionTo: RegionId;
      ticksRemaining: number;
    };

export interface Force {
  readonly id: ForceId;
  readonly owner: Tribe;
  tier: ForceTier;
  location: ForceLocation;
}

/**
 * Scouts have no combat tier. Once arrived they persist for one further tick
 * revealing the target + its adjacent ring, then expire.
 */
export type ScoutLocation =
  | {
      kind: "transit";
      trailIndex: number;
      directionFrom: RegionId;
      directionTo: RegionId;
      ticksRemaining: number;
    }
  | { kind: "arrived"; regionId: RegionId; expiresTick: number };

export interface Scout {
  readonly id: ScoutId;
  readonly owner: Tribe;
  readonly targetRegionId: RegionId;
  location: ScoutLocation;
}

/**
 * A caravan is a structured-trade delivery. Path is frozen at dispatch
 * (RULES.md §4.7). Caravans are invisible to observers — visibility is a
 * diplomatic-privacy choice, not a bug.
 */
export interface Caravan {
  readonly id: CaravanId;
  readonly owner: Tribe;
  readonly recipient: Tribe;
  readonly amountInfluence: number;
  readonly path: RegionId[];
  currentIndex: number;
  ticksToNextRegion: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Diplomacy
// ─────────────────────────────────────────────────────────────────────────────

/** Structured proposal kinds, per RULES.md §3.11 and §7. */
export type ProposalKind =
  | "nap"
  | "trade_offer"
  | "shared_vision"
  | "declare_war"
  | "break_pact";

/**
 * A proposal is valid until `expiresTick`. Recipients use a `respond` order
 * with `accept` | `decline`. Unanswered proposals silently expire.
 */
export interface Proposal {
  readonly id: ProposalId;
  readonly kind: ProposalKind;
  readonly from: Tribe;
  readonly to: Tribe;
  /** Duration in ticks once accepted (NAP, shared_vision). */
  readonly lengthTicks: number;
  /** Influence to transfer on acceptance (trade_offer only). */
  readonly amountInfluence: number;
  readonly expiresTick: number;
  /** Influence debited at propose-time for trade_offer escrow (amount + caravan fee). */
  readonly escrowedInfluence?: number;
}

/**
 * Active mechanical diplomacy state. Wars are represented as a separate
 * `Pact` with kind === "war"; absence of any entry between two tribes means
 * they are at peace but uncommitted.
 */
export type PactKind = "nap" | "shared_vision" | "war";

export interface Pact {
  readonly kind: PactKind;
  /** Exactly two tribes, sorted alphabetically for stable hashing. */
  readonly parties: readonly [Tribe, Tribe];
  readonly formedTick: number;
  /** For NAP and shared_vision; omitted / Infinity for "war". */
  readonly expiresTick: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orders (what a player submits each tick)
// ─────────────────────────────────────────────────────────────────────────────

export type Order =
  | MoveOrder
  | RecruitOrder
  | BuildOrder
  | ScoutOrder
  | ProposeOrder
  | RespondOrder
  | MessageOrder;

export interface MoveOrder {
  readonly kind: "move";
  readonly forceId: ForceId;
  readonly destinationRegionId: RegionId;
}

export interface RecruitOrder {
  readonly kind: "recruit";
  readonly regionId: RegionId;
  readonly tier: ForceTier;
}

export interface BuildOrder {
  readonly kind: "build";
  readonly regionId: RegionId;
  readonly structure: StructureKind;
  /** Required for `road`; the adjacent region the road shortens. */
  readonly roadTarget?: RegionId;
}

export interface ScoutOrder {
  readonly kind: "scout";
  readonly fromRegionId: RegionId;
  readonly targetRegionId: RegionId;
}

export interface ProposeOrder {
  readonly kind: "propose";
  readonly proposal: Proposal;
}

export interface RespondOrder {
  readonly kind: "respond";
  readonly proposalId: ProposalId;
  readonly response: "accept" | "decline";
}

export interface MessageOrder {
  readonly kind: "message";
  readonly to: Tribe;
  readonly text: string;
}

/** One tribe's full submission for one tick. */
export interface OrderPacket {
  readonly tribe: Tribe;
  /** The tick this packet is for. Engine rejects stale or ahead packets. */
  readonly tick: number;
  readonly orders: readonly Order[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Player & match state (wire; full GameState is engine-internal)
// ─────────────────────────────────────────────────────────────────────────────

export interface InboxMessage {
  readonly tick: number;
  readonly kind:
    | "proposal"
    | "message"
    | "scout_report"
    | "arrival_report"
    | "combat_report"
    | "caravan_delivered"
    | "caravan_intercepted";
  readonly from?: Tribe;
  readonly text?: string;
  readonly proposal?: Proposal;
  readonly reputationPenalty?: boolean;
  /** Kind-specific payload kept deliberately loose for trace interchange. */
  readonly payload?: Readonly<Record<string, unknown>>;
}

export interface PlayerState {
  readonly tribe: Tribe;
  influence: number;
  /**
   * Tick at which the reputation tag stops being applied. 0 = no penalty.
   * See RULES.md §4.8.
   */
  reputationPenaltyExpiresTick: number;
  inbox: InboxMessage[];
  outstandingProposals: Proposal[];
}

/**
 * Per-condition counters used to sustain territorial / economic / diplomatic
 * victories. Reset to 0 when the condition lapses.
 */
export type VictoryConditionKey =
  | "territorial_dominance"
  | "economic_supremacy"
  | "diplomatic_hegemony";

export type VictoryCounters = Record<
  Tribe,
  Partial<Record<VictoryConditionKey, number>>
>;

/** Public event record, flushed at end-of-tick. */
export interface Announcement {
  readonly tick: number;
  readonly kind:
    | "starting_adjacent_unavailable"
    | "pact_formed"
    | "pact_broken"
    | "war_declared"
    | "tribe_eliminated"
    | "caravan_intercepted"
    | "victory";
  readonly parties?: readonly Tribe[];
  readonly detail?: string;
  readonly breaker?: Tribe;
  readonly interceptor?: Tribe;
  readonly amount?: number;
  readonly condition?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Projected view (what a player actually sees after fog of war)
// ─────────────────────────────────────────────────────────────────────────────

/** An observed enemy/neutral force with its precise tier hidden. */
export interface VisibleForce {
  readonly regionId: RegionId;
  readonly owner: Tribe;
  readonly fuzzyTier: FuzzyTier;
}

/**
 * An observed transit. The observer does not know the precise tier nor how
 * many ticks remain until arrival (`ticksRemaining` is omitted on purpose).
 */
export interface VisibleTransit {
  readonly trailIndex: number;
  readonly observedInRegionId: RegionId;
  readonly owner: Tribe;
  readonly fuzzyTier: FuzzyTier;
  readonly directionFrom: RegionId;
  readonly directionTo: RegionId;
}

/** A visible scout (always rendered as "a scout" regardless of observer). */
export interface VisibleScout {
  readonly regionId: RegionId;
  readonly owner: Tribe;
}

/** A precomputed, currently legal structured action option for the player. */
export interface LegalOrderOption {
  readonly id: string;
  readonly kind: Order["kind"];
  readonly summary: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * Per-player, per-tick projection. The ONLY object an LLM or human player
 * should ever see. Contains no field that leaks information outside their
 * fog-of-war (RULES.md §9).
 */
export interface ProjectedView {
  readonly tick: number;
  readonly forTribe: Tribe;
  readonly visibleRegions: Record<RegionId, Region>;
  readonly visibleForces: readonly VisibleForce[];
  readonly visibleTransits: readonly VisibleTransit[];
  readonly visibleScouts: readonly VisibleScout[];
  readonly myPlayerState: PlayerState;
  readonly myForces: readonly Force[];
  readonly myScouts: readonly Scout[];
  readonly myCaravans: readonly Caravan[];
  readonly inboxNew: readonly InboxMessage[];
  readonly announcementsNew: readonly Announcement[];
  readonly pactsInvolvingMe: readonly Pact[];
  readonly legalOrderOptions: readonly LegalOrderOption[];
  readonly tribesAlive: readonly Tribe[];
  readonly tickLimit: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Map preset (match config details live in @rr/engine2)
// ─────────────────────────────────────────────────────────────────────────────

/** Procedural §11 generation is not implemented yet; use hand-built presets. */
export type MapPreset =
  | "procedural"
  | "hand_minimal"
  | "expanded"
  | "continent6p";

// ─────────────────────────────────────────────────────────────────────────────
// Trace records (what the batch runner writes to JSONL)
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolutionEvent {
  readonly kind: string;
  readonly [field: string]: unknown;
}

export interface TickTraceRecord {
  readonly tick: number;
  readonly stateHash: string;
  readonly ordersByTribe: Record<Tribe, OrderPacket>;
  readonly resolutionEvents: readonly ResolutionEvent[];
  readonly projectedViews: Record<Tribe, ProjectedView>;
}

export interface MatchSummaryRecord {
  readonly kind: "match_summary";
  readonly finalHash: string;
  readonly winner: Tribe | Tribe[] | null;
  readonly tickFinal: number;
  readonly tribesAliveAtEnd: readonly Tribe[];
}
