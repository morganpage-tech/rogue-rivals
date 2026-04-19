"""Dataclasses mirroring the TypeScript `GameState` surface.

Intentional parity with `packages/engine2/src/types.ts`. When adding fields,
update both files in the same commit.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional, Tuple, Union

Tribe = str  # "orange" | "grey" | "brown" | "red"
RegionType = str
StructureKind = str
RegionId = str
ForceId = str
ScoutId = str
CaravanId = str
ProposalId = str


@dataclass
class Trail:
    index: int
    a: RegionId
    b: RegionId
    base_length_ticks: int


@dataclass
class Region:
    id: RegionId
    type: RegionType
    owner: Optional[Tribe] = None
    structures: List[StructureKind] = field(default_factory=list)
    road_targets: Dict[int, RegionId] = field(default_factory=dict)
    garrison_force_id: Optional[ForceId] = None


@dataclass
class ForceTransit:
    trail_index: int
    direction_from: RegionId
    direction_to: RegionId
    ticks_remaining: int


@dataclass
class Force:
    id: ForceId
    owner: Tribe
    tier: int
    # Either ("garrison", region_id) or ("transit", ForceTransit)
    location_kind: Literal["garrison", "transit"]
    location_region_id: Optional[RegionId] = None
    location_transit: Optional[ForceTransit] = None


@dataclass
class ScoutTransit:
    trail_index: int
    direction_from: RegionId
    direction_to: RegionId
    ticks_remaining: int


@dataclass
class Scout:
    id: ScoutId
    owner: Tribe
    target_region_id: RegionId
    location_kind: Literal["transit", "arrived"]
    location_region_id: Optional[RegionId] = None  # when arrived
    expires_tick: Optional[int] = None  # when arrived
    transit: Optional[ScoutTransit] = None  # when transit


@dataclass
class Caravan:
    id: CaravanId
    owner: Tribe
    recipient: Tribe
    amount_influence: int
    path: List[RegionId] = field(default_factory=list)
    current_index: int = 0
    ticks_to_next_region: int = 0


@dataclass
class Proposal:
    id: ProposalId
    kind: str  # "nap" | "trade_offer" | "shared_vision" | "declare_war" | "break_pact"
    from_tribe: Tribe
    to_tribe: Tribe
    length_ticks: int = 0
    amount_influence: int = 0
    expires_tick: int = 0


@dataclass
class Pact:
    kind: str  # "nap" | "shared_vision" | "war"
    parties: Tuple[Tribe, Tribe]
    formed_tick: int
    expires_tick: int


@dataclass
class InboxMessage:
    tick: int
    kind: str
    from_tribe: Optional[Tribe] = None
    text: Optional[str] = None
    proposal: Optional[Proposal] = None
    reputation_penalty: bool = False
    payload: Dict[str, Any] = field(default_factory=dict)


@dataclass
class PlayerState:
    tribe: Tribe
    influence: int = 0
    reputation_penalty_expires_tick: int = 0
    inbox: List[InboxMessage] = field(default_factory=list)
    outstanding_proposals: List[Proposal] = field(default_factory=list)


@dataclass
class Announcement:
    tick: int
    kind: str
    parties: List[Tribe] = field(default_factory=list)
    detail: Optional[str] = None
    breaker: Optional[Tribe] = None
    interceptor: Optional[Tribe] = None
    amount: Optional[int] = None
    condition: Optional[str] = None


@dataclass
class GameState:
    seed: int
    rules_version: str = "v2.0"
    tick: int = 0
    tribes_alive: List[Tribe] = field(default_factory=list)

    regions: Dict[RegionId, Region] = field(default_factory=dict)
    trails: List[Trail] = field(default_factory=list)
    forces: Dict[ForceId, Force] = field(default_factory=dict)
    scouts: Dict[ScoutId, Scout] = field(default_factory=dict)
    caravans: Dict[CaravanId, Caravan] = field(default_factory=dict)

    players: Dict[Tribe, PlayerState] = field(default_factory=dict)
    pacts: List[Pact] = field(default_factory=list)

    announcements: List[Announcement] = field(default_factory=list)
    victory_counters: Dict[Tribe, Dict[str, int]] = field(default_factory=dict)

    winner: Union[None, Tribe, List[Tribe]] = None

    # Engine-internal monotonic counters for id generation
    next_force_idx: int = 0
    next_scout_idx: int = 0
    next_caravan_idx: int = 0
    next_proposal_idx: int = 0


# Orders
OrderKind = Literal[
    "move", "recruit", "build", "scout", "propose", "respond", "message"
]


@dataclass
class Order:
    kind: OrderKind
    payload: Dict[str, Any] = field(default_factory=dict)


@dataclass
class OrderPacket:
    tribe: Tribe
    tick: int
    orders: List[Order] = field(default_factory=list)


# Helpers used during combat resolution
def trail_between(state: GameState, a: RegionId, b: RegionId) -> Optional[Trail]:
    for t in state.trails:
        if (t.a == a and t.b == b) or (t.a == b and t.b == a):
            return t
    return None


def adjacent_regions(state: GameState, region_id: RegionId) -> List[RegionId]:
    result = []
    for t in state.trails:
        if t.a == region_id:
            result.append(t.b)
        elif t.b == region_id:
            result.append(t.a)
    return sorted(set(result))
