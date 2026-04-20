"""Fog-of-war projection (RULES.md \u00a79).

Takes a fully-resolved GameState and a tribe; returns the data structure
that tribe may see this tick. Never returns state beyond the rules of \u00a79.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Set

from .constants import (
    DEFAULT_NAP_LENGTH,
    DEFAULT_SHARED_VISION_LENGTH,
    FORCE_RECRUIT_COST,
    FORGE_REQUIRED_FOR_TIER,
    FUZZY_TIER,
    MAX_STRUCTURES_PER_REGION,
    SCOUT_COST,
    STRUCTURE_COST,
)
from .state import (
    Announcement,
    Caravan,
    Force,
    GameState,
    InboxMessage,
    Pact,
    PlayerState,
    Region,
    RegionId,
    Scout,
    Tribe,
    adjacent_regions,
    trail_between,
)


def _visible_region_set(state: GameState, tribe: Tribe) -> Set[RegionId]:
    visible: Set[RegionId] = set()
    owned = [rid for rid, r in state.regions.items() if r.owner == tribe]
    for rid in owned:
        visible.add(rid)
        for adj in adjacent_regions(state, rid):
            visible.add(adj)
            # Watchtower extends visibility by one additional hop (\u00a79.1)
            if "watchtower" in state.regions[rid].structures:
                for adj2 in adjacent_regions(state, adj):
                    visible.add(adj2)

    # Scouted regions (\u00a79.1)
    for scout in state.scouts.values():
        if scout.owner != tribe or scout.location_kind != "arrived":
            continue
        assert scout.location_region_id is not None
        visible.add(scout.location_region_id)
        for adj in adjacent_regions(state, scout.location_region_id):
            visible.add(adj)

    # Shared-vision pacts (\u00a79.1)
    for pact in state.pacts:
        if pact.kind != "shared_vision":
            continue
        if tribe not in pact.parties:
            continue
        other = pact.parties[0] if pact.parties[1] == tribe else pact.parties[1]
        # Directly visible to other (one level only; not transitive per RULES \u00a79.1)
        other_owned = [rid for rid, r in state.regions.items() if r.owner == other]
        for rid in other_owned:
            visible.add(rid)
            for adj in adjacent_regions(state, rid):
                visible.add(adj)

    return visible


def _has_pact(state: GameState, kind: str, a: Tribe, b: Tribe) -> bool:
    parties = {a, b}
    for pact in state.pacts:
        if pact.kind == kind and set(pact.parties) == parties:
            return True
    return False


def _legal_order_options(state: GameState, tribe: Tribe) -> List[Dict[str, Any]]:
    ps = state.players.get(tribe)
    if ps is None:
        return []

    options: List[Dict[str, Any]] = []

    def add_option(
        option_id: str,
        kind: str,
        summary: str,
        payload: Dict[str, Any],
    ) -> None:
        options.append(
            {
                "id": option_id,
                "kind": kind,
                "summary": summary,
                "payload": payload,
            }
        )

    # Moves from currently garrisoned owned forces.
    for force in sorted(
        (f for f in state.forces.values() if f.owner == tribe and f.location_kind == "garrison"),
        key=lambda f: f.id,
    ):
        origin = force.location_region_id
        if origin is None:
            continue
        for dest in adjacent_regions(state, origin):
            add_option(
                f"move:{force.id}:{dest}",
                "move",
                f"Move {force.id} (Tier {force.tier}) from {origin} to {dest}",
                {"force_id": force.id, "destination_region_id": dest},
            )

    # Region-local actions on owned regions.
    for region_id in sorted(rid for rid, r in state.regions.items() if r.owner == tribe):
        region = state.regions[region_id]

        # Recruit options.
        if region.garrison_force_id is None:
            for tier in sorted(FORCE_RECRUIT_COST.keys()):
                if tier == FORGE_REQUIRED_FOR_TIER and "forge" not in region.structures:
                    continue
                cost = FORCE_RECRUIT_COST[tier]
                if ps.influence < cost:
                    continue
                add_option(
                    f"recruit:{region_id}:t{tier}",
                    "recruit",
                    f"Recruit Tier {tier} at {region_id} (cost {cost})",
                    {"region_id": region_id, "tier": tier},
                )

        # Build options.
        if len(region.structures) < MAX_STRUCTURES_PER_REGION:
            for structure in sorted(STRUCTURE_COST.keys()):
                if structure in region.structures:
                    continue
                cost = STRUCTURE_COST[structure]
                if ps.influence < cost:
                    continue
                if structure == "road":
                    for road_target in adjacent_regions(state, region_id):
                        add_option(
                            f"build:{region_id}:road:{road_target}",
                            "build",
                            f"Build road at {region_id} toward {road_target} (cost {cost})",
                            {
                                "region_id": region_id,
                                "structure": "road",
                                "road_target": road_target,
                            },
                        )
                else:
                    add_option(
                        f"build:{region_id}:{structure}",
                        "build",
                        f"Build {structure} at {region_id} (cost {cost})",
                        {"region_id": region_id, "structure": structure},
                    )

        # Scout options.
        if ps.influence >= SCOUT_COST:
            for target in adjacent_regions(state, region_id):
                if trail_between(state, region_id, target) is None:
                    continue
                add_option(
                    f"scout:{region_id}:{target}",
                    "scout",
                    f"Scout from {region_id} to {target} (cost {SCOUT_COST})",
                    {"from_region_id": region_id, "target_region_id": target},
                )

    # Respond options.
    for proposal in sorted(ps.outstanding_proposals, key=lambda p: p.id):
        add_option(
            f"respond:{proposal.id}:accept",
            "respond",
            f"Accept {proposal.kind} proposal {proposal.id} from {proposal.from_tribe}",
            {"proposal_id": proposal.id, "response": "accept"},
        )
        add_option(
            f"respond:{proposal.id}:decline",
            "respond",
            f"Decline {proposal.kind} proposal {proposal.id} from {proposal.from_tribe}",
            {"proposal_id": proposal.id, "response": "decline"},
        )

    # Proposal options.
    for other in sorted(t for t in state.tribes_alive if t != tribe):
        has_nap = _has_pact(state, "nap", tribe, other)
        has_shared_vision = _has_pact(state, "shared_vision", tribe, other)
        has_war = _has_pact(state, "war", tribe, other)

        if not has_nap and not has_war:
            add_option(
                f"propose:nap:{other}",
                "propose",
                f"Propose NAP to {other} ({DEFAULT_NAP_LENGTH} ticks)",
                {
                    "proposal": {
                        "kind": "nap",
                        "to": other,
                        "length_ticks": DEFAULT_NAP_LENGTH,
                    }
                },
            )
        if not has_shared_vision and not has_war:
            add_option(
                f"propose:shared_vision:{other}",
                "propose",
                f"Propose Shared Vision to {other} ({DEFAULT_SHARED_VISION_LENGTH} ticks)",
                {
                    "proposal": {
                        "kind": "shared_vision",
                        "to": other,
                        "length_ticks": DEFAULT_SHARED_VISION_LENGTH,
                    }
                },
            )
        if ps.influence >= 6:
            add_option(
                f"propose:trade_offer:{other}:5",
                "propose",
                f"Propose 5-Influence trade caravan to {other}",
                {
                    "proposal": {
                        "kind": "trade_offer",
                        "to": other,
                        "amount_influence": 5,
                    }
                },
            )
        if has_nap:
            add_option(
                f"propose:break_pact:{other}",
                "propose",
                f"Break NAP with {other}",
                {"proposal": {"kind": "break_pact", "to": other}},
            )
        if not has_war:
            add_option(
                f"propose:declare_war:{other}",
                "propose",
                f"Declare war on {other}",
                {"proposal": {"kind": "declare_war", "to": other}},
            )

    return options


def project_for_player(state: GameState, tribe: Tribe) -> Dict[str, Any]:
    """Return a plain-dict ProjectedView (JSON-serialisable)."""
    visible = _visible_region_set(state, tribe)

    visible_regions: Dict[RegionId, Dict[str, Any]] = {}
    for rid in sorted(visible):
        r = state.regions.get(rid)
        if r is None:
            continue
        visible_regions[rid] = asdict(r)

    # Visible forces (foreign garrisons in visible regions, fuzzy tier)
    visible_forces: List[Dict[str, Any]] = []
    for f in state.forces.values():
        if f.location_kind != "garrison":
            continue
        assert f.location_region_id is not None
        if f.location_region_id not in visible:
            continue
        if f.owner == tribe:
            continue
        visible_forces.append(
            {
                "region_id": f.location_region_id,
                "owner": f.owner,
                "fuzzy_tier": FUZZY_TIER[f.tier],
            }
        )

    # Visible transits
    visible_transits: List[Dict[str, Any]] = []
    for f in state.forces.values():
        if f.location_kind != "transit":
            continue
        if f.owner == tribe:
            continue
        assert f.location_transit is not None
        tr = f.location_transit
        observed_in = None
        if tr.direction_from in visible:
            observed_in = tr.direction_from
        elif tr.direction_to in visible:
            observed_in = tr.direction_to
        if observed_in is None:
            continue
        visible_transits.append(
            {
                "trail_index": tr.trail_index,
                "observed_in_region_id": observed_in,
                "owner": f.owner,
                "fuzzy_tier": FUZZY_TIER[f.tier],
                "direction_from": tr.direction_from,
                "direction_to": tr.direction_to,
            }
        )

    # Visible scouts (always rendered as "a scout" when seen)
    visible_scouts: List[Dict[str, Any]] = []
    for s in state.scouts.values():
        if s.owner == tribe:
            continue
        # Arrived scouts
        if s.location_kind == "arrived" and s.location_region_id in visible:
            visible_scouts.append(
                {"region_id": s.location_region_id, "owner": s.owner}
            )

    my_state = state.players.get(tribe)
    my_forces = [f for f in state.forces.values() if f.owner == tribe]
    my_scouts = [s for s in state.scouts.values() if s.owner == tribe]
    my_caravans = [c for c in state.caravans.values() if c.owner == tribe]

    inbox_new = []
    if my_state is not None:
        for msg in my_state.inbox:
            if msg.tick == state.tick:
                inbox_new.append(asdict(msg))

    announcements_new = [asdict(a) for a in state.announcements if a.tick == state.tick]
    pacts_involving_me = [asdict(p) for p in state.pacts if tribe in p.parties]
    legal_order_options = _legal_order_options(state, tribe)

    return {
        "tick": state.tick,
        "for_tribe": tribe,
        "visible_regions": visible_regions,
        "visible_forces": visible_forces,
        "visible_transits": visible_transits,
        "visible_scouts": visible_scouts,
        "my_player_state": asdict(my_state) if my_state else None,
        "my_forces": [asdict(f) for f in my_forces],
        "my_scouts": [asdict(s) for s in my_scouts],
        "my_caravans": [asdict(c) for c in my_caravans],
        "inbox_new": inbox_new,
        "announcements_new": announcements_new,
        "pacts_involving_me": pacts_involving_me,
        "legal_order_options": legal_order_options,
        "tribes_alive": list(state.tribes_alive),
    }
