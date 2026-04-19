"""Fog-of-war projection (RULES_v2.md \u00a79).

Takes a fully-resolved GameState and a tribe; returns the data structure
that tribe may see this tick. Never returns state beyond the rules of \u00a79.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Set

from .constants import FUZZY_TIER
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
        "tribes_alive": list(state.tribes_alive),
    }
