"""Tick resolution engine (RULES.md \u00a75).

Deterministic. No PRNG draws during tick resolution (\u00a71, \u00a710). All
tie-breaks use stable tribe-alphabetical ordering.

Scope for v2.0 minimal oracle:
  - Supports move, recruit, build, scout, propose, respond, message.
  - Deterministic 1-v-1 combat; reinforcement bonus handled.
  - NAP + shared_vision + declare_war + break_pact (mechanical).
  - trade_offer: accept spawns caravan; intercept only when a hostile tier-II+
    force garrisons the caravan's current path region on the delivery tick.
  - Victory: last_standing and tick_limit fallback only.
    Sustained conditions (territorial/economic/diplomatic/cultural) TODO(v2.1).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict
from typing import Any, Dict, List, Optional, Tuple

from .constants import (
    CARAVAN_DECLINE_REFUND_FRACTION,
    CARAVAN_INTERCEPT_MIN_TIER,
    COMBAT_DEFENDER_OWN_REGION_BONUS,
    COMBAT_FORT_BONUS,
    COMBAT_REINFORCEMENT_BONUS_CAP,
    COMBAT_REINFORCEMENT_BONUS_PER_ALLY,
    COMBAT_SCOUT_REVEAL_PENALTY,
    DEFAULT_NAP_LENGTH,
    DEFAULT_SHARED_VISION_LENGTH,
    DEFAULT_TICK_LIMIT,
    FINAL_SCORE_WEIGHTS,
    FORCE_RECRUIT_COST,
    FORCE_TRAVEL_PENALTY,
    FORGE_REQUIRED_FOR_TIER,
    MAX_STRUCTURES_PER_REGION,
    REGION_PRODUCTION,
    REPUTATION_EARLY_BREAK_THRESHOLD_TICKS,
    REPUTATION_PENALTY_DURATION_EARLY_BREAK,
    REPUTATION_PENALTY_DURATION_LATE_BREAK,
    SCOUT_COST,
    SCOUT_DWELL_TICKS,
    STRUCTURE_COST,
    STRUCTURE_PRODUCTION_BONUS,
    road_modified_length,
)
from .fog import project_for_player
from .state import (
    Announcement,
    Caravan,
    Force,
    ForceTransit,
    GameState,
    InboxMessage,
    Order,
    OrderPacket,
    Pact,
    Proposal,
    Region,
    RegionId,
    Scout,
    ScoutTransit,
    Tribe,
    adjacent_regions,
    trail_between,
)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def tick(
    state: GameState, packets_by_tribe: Dict[Tribe, OrderPacket]
) -> Dict[str, Any]:
    """Resolve one tick. Returns a TickResult dict with events & views."""
    events: List[Dict[str, Any]] = []

    # Validate packets
    for tribe in state.tribes_alive:
        packet = packets_by_tribe.get(tribe)
        if packet is None:
            raise ValueError(f"missing OrderPacket for {tribe}")
        if packet.tick != state.tick:
            raise ValueError(
                f"packet tick mismatch for {tribe}: expected {state.tick}, got {packet.tick}"
            )

    # Stable alphabetical ordering for cross-tribe sub-phases
    tribe_order = sorted(state.tribes_alive)

    # ---- 5.1 Immediate orders ------------------------------------------------
    for tribe in tribe_order:
        packet = packets_by_tribe[tribe]
        for order in packet.orders:
            if order.kind == "build":
                _apply_build(state, tribe, order, events)
            elif order.kind == "recruit":
                _apply_recruit(state, tribe, order, events)
            elif order.kind == "propose":
                _apply_propose(state, tribe, order, events)
            elif order.kind == "respond":
                _apply_respond(state, tribe, order, events)
            elif order.kind == "message":
                _apply_message(state, tribe, order, events)

    # ---- 5.2 Dispatch orders -------------------------------------------------
    for tribe in tribe_order:
        packet = packets_by_tribe[tribe]
        for order in packet.orders:
            if order.kind == "move":
                _apply_dispatch_move(state, tribe, order, events)
            elif order.kind == "scout":
                _apply_dispatch_scout(state, tribe, order, events)

    # ---- 5.3 Advance transits ------------------------------------------------
    for f in state.forces.values():
        if f.location_kind == "transit" and f.location_transit is not None:
            f.location_transit.ticks_remaining -= 1
    for s in state.scouts.values():
        if s.location_kind == "transit" and s.transit is not None:
            s.transit.ticks_remaining -= 1
    for c in state.caravans.values():
        c.ticks_to_next_region -= 1
        if c.ticks_to_next_region <= 0 and c.current_index < len(c.path) - 1:
            c.current_index += 1
            # TODO(v2.1): derive per-hop length from path terrain; for minimal
            # scope treat every caravan hop as 1 tick.
            c.ticks_to_next_region = 1

    # ---- 5.4 Resolve arrivals ------------------------------------------------
    # Group arrivals by destination and process deterministically so that
    # simultaneous arrivals at the same region do not leave ghost garrisons
    # (\u00a75.4 + garrison cap from \u00a74.2). Within a destination, arrivals are
    # ordered by force_id. Cross-tribe collisions still fall through to
    # _resolve_combats; same-tribe collisions violate \u00a74.2's "at most one
    # force per owned region" and the later arrival is destroyed.
    scout_reveal_this_tick: Dict[RegionId, List[Tribe]] = {}
    arrivals_by_dest: Dict[RegionId, List[Force]] = {}
    for f in state.forces.values():
        if (
            f.location_kind == "transit"
            and f.location_transit is not None
            and f.location_transit.ticks_remaining <= 0
        ):
            arrivals_by_dest.setdefault(f.location_transit.direction_to, []).append(f)

    for dest in sorted(arrivals_by_dest.keys()):
        region = state.regions[dest]
        arrivals = sorted(arrivals_by_dest[dest], key=lambda x: x.id)
        owners_present: set = set()
        if region.garrison_force_id is not None:
            owners_present.add(state.forces[region.garrison_force_id].owner)
        for f in arrivals:
            f.location_kind = "garrison"
            f.location_region_id = dest
            f.location_transit = None
            events.append(
                {"kind": "force_arrived", "force_id": f.id, "region_id": dest}
            )
            if f.owner in owners_present:
                # Same-tribe garrison collision (\u00a74.2 cap violation). First
                # arrival by force_id wins the slot; subsequent same-tribe
                # arrivals are destroyed to avoid a ghost garrison.
                events.append(
                    {
                        "kind": "arrival_rejected_garrison_cap",
                        "force_id": f.id,
                        "region_id": dest,
                    }
                )
                _destroy_force(state, f)
                continue
            owners_present.add(f.owner)
            if region.garrison_force_id is None:
                region.garrison_force_id = f.id
                if region.owner != f.owner:
                    previous_owner = region.owner
                    region.owner = f.owner
                    events.append(
                        {
                            "kind": (
                                "region_claimed"
                                if previous_owner is None
                                else "region_captured"
                            ),
                            "tribe": f.owner,
                            "region_id": dest,
                            "previous_owner": previous_owner,
                        }
                    )
    for s in list(state.scouts.values()):
        if s.location_kind == "transit" and s.transit is not None:
            if s.transit.ticks_remaining <= 0:
                dest = s.transit.direction_to
                s.location_kind = "arrived"
                s.location_region_id = dest
                s.expires_tick = state.tick + SCOUT_DWELL_TICKS + 1
                s.transit = None
                scout_reveal_this_tick.setdefault(dest, []).append(s.owner)
                events.append(
                    {"kind": "scout_arrived", "scout_id": s.id, "region_id": dest}
                )
                # scout_report inbox message
                state.players[s.owner].inbox.append(
                    InboxMessage(
                        tick=state.tick + 1,  # available next tick
                        kind="scout_report",
                        payload={"region_id": dest, "reveal_tick": state.tick},
                    )
                )

    # Deliver caravans whose current_index is at path end and timer expired
    for c in list(state.caravans.values()):
        if c.current_index >= len(c.path) - 1 and c.ticks_to_next_region <= 0:
            _deliver_caravan(state, c, events)

    # ---- 5.5 Resolve combats -------------------------------------------------
    _resolve_combats(state, events, scout_reveal_this_tick)

    # ---- 5.6 Expire pacts / reputation / proposals ---------------------------
    state.pacts = [p for p in state.pacts if p.kind == "war" or p.expires_tick > state.tick]
    for tribe in state.tribes_alive:
        ps = state.players[tribe]
        if ps.reputation_penalty_expires_tick <= state.tick:
            ps.reputation_penalty_expires_tick = 0
        # Purge expired outstanding proposals. Proposals carry expires_tick
        # at creation (\u00a73.11) but nothing else removes them, so without this
        # pass an accepted reply could resurrect a long-dead offer.
        fresh: List[Proposal] = []
        for p in ps.outstanding_proposals:
            if p.expires_tick > state.tick:
                fresh.append(p)
            else:
                events.append(
                    {
                        "kind": "proposal_expired",
                        "id": p.id,
                        "proposal_kind": p.kind,
                        "from": p.from_tribe,
                        "to": p.to_tribe,
                    }
                )
        ps.outstanding_proposals = fresh

    # ---- 5.7 Influence production --------------------------------------------
    for tribe in state.tribes_alive:
        total = 0
        for rid, region in state.regions.items():
            if region.owner != tribe:
                continue
            base = REGION_PRODUCTION.get(region.type, 0)
            # Orange's asymmetric bonus: +1 on owned plains (\u00a74.9)
            if tribe == "orange" and region.type == "plains":
                base += 1
            for st in region.structures:
                base += STRUCTURE_PRODUCTION_BONUS.get(st, 0)
            total += base
        state.players[tribe].influence += total
        events.append({"kind": "influence_credited", "tribe": tribe, "amount": total})

    # ---- 5.8 Scout expiry ----------------------------------------------------
    for sid in list(state.scouts.keys()):
        s = state.scouts[sid]
        if s.location_kind == "arrived" and s.expires_tick is not None:
            if s.expires_tick <= state.tick + 1:
                del state.scouts[sid]
                events.append({"kind": "scout_expired", "scout_id": sid})

    # ---- 5.9 tick advance ----------------------------------------------------
    state.tick += 1

    # ---- 5.10 victory check --------------------------------------------------
    _check_victory(state, events)

    # ---- Projections ---------------------------------------------------------
    projected_views = {t: project_for_player(state, t) for t in state.tribes_alive}

    state_hash = _hash_state(state)

    return {
        "state": state,
        "events": events,
        "projected_views": projected_views,
        "state_hash": state_hash,
    }


# ---------------------------------------------------------------------------
# Order appliers
# ---------------------------------------------------------------------------


def _apply_build(state: GameState, tribe: Tribe, order: Order, events: List) -> None:
    region_id = order.payload.get("region_id")
    structure = order.payload.get("structure")
    road_target = order.payload.get("road_target")
    region = state.regions.get(region_id)
    ps = state.players[tribe]

    if region is None or region.owner != tribe:
        events.append({"kind": "build_failed", "tribe": tribe, "reason": "not_owned"})
        return
    if len(region.structures) >= MAX_STRUCTURES_PER_REGION:
        events.append({"kind": "build_failed", "tribe": tribe, "reason": "full"})
        return
    if structure in region.structures:
        events.append({"kind": "build_failed", "tribe": tribe, "reason": "duplicate"})
        return
    cost = STRUCTURE_COST.get(structure, 0)
    if ps.influence < cost:
        events.append({"kind": "build_failed", "tribe": tribe, "reason": "no_influence"})
        return

    ps.influence -= cost
    region.structures.append(structure)
    if structure == "road" and road_target:
        region.road_targets[len(region.structures) - 1] = road_target
    events.append(
        {"kind": "built", "tribe": tribe, "region_id": region_id, "structure": structure}
    )


def _apply_recruit(state: GameState, tribe: Tribe, order: Order, events: List) -> None:
    region_id = order.payload.get("region_id")
    tier = order.payload.get("tier", 1)
    region = state.regions.get(region_id)
    ps = state.players[tribe]

    if region is None or region.owner != tribe:
        events.append({"kind": "recruit_failed", "reason": "not_owned"})
        return
    if region.garrison_force_id is not None:
        events.append({"kind": "recruit_failed", "reason": "garrison_present"})
        return
    if tier == FORGE_REQUIRED_FOR_TIER and "forge" not in region.structures:
        events.append({"kind": "recruit_failed", "reason": "no_forge"})
        return
    cost = FORCE_RECRUIT_COST.get(tier, 0)
    if ps.influence < cost:
        events.append({"kind": "recruit_failed", "reason": "no_influence"})
        return

    ps.influence -= cost
    force_id = f"f_{tribe}_{state.next_force_idx:03d}"
    state.next_force_idx += 1
    state.forces[force_id] = Force(
        id=force_id,
        owner=tribe,
        tier=tier,
        location_kind="garrison",
        location_region_id=region_id,
    )
    region.garrison_force_id = force_id
    events.append(
        {"kind": "recruited", "tribe": tribe, "region_id": region_id, "tier": tier, "force_id": force_id}
    )


def _apply_propose(state: GameState, tribe: Tribe, order: Order, events: List) -> None:
    prop_data = order.payload.get("proposal", {})
    kind = prop_data.get("kind")
    to_tribe = prop_data.get("to")
    if to_tribe not in state.tribes_alive or to_tribe == tribe:
        events.append({"kind": "proposal_failed", "reason": "invalid_target"})
        return
    pid = f"p_{state.next_proposal_idx:04d}"
    state.next_proposal_idx += 1
    length = prop_data.get("length_ticks", DEFAULT_NAP_LENGTH if kind == "nap" else DEFAULT_SHARED_VISION_LENGTH)
    amount = prop_data.get("amount_influence", 0)

    proposal = Proposal(
        id=pid,
        kind=kind,
        from_tribe=tribe,
        to_tribe=to_tribe,
        length_ticks=length,
        amount_influence=amount,
        expires_tick=state.tick + 3,
    )

    if kind in ("declare_war", "break_pact"):
        # Unilateral action, no acceptance needed.
        _resolve_unilateral_diplomacy(state, proposal, events)
        return

    # Queue for recipient
    state.players[to_tribe].outstanding_proposals.append(proposal)
    state.players[to_tribe].inbox.append(
        InboxMessage(
            tick=state.tick + 1,
            kind="proposal",
            from_tribe=tribe,
            proposal=proposal,
            reputation_penalty=(
                state.players[tribe].reputation_penalty_expires_tick > state.tick
            ),
        )
    )
    events.append(
        {"kind": "proposal_sent", "from": tribe, "to": to_tribe, "proposal_kind": kind, "id": pid}
    )


def _apply_respond(state: GameState, tribe: Tribe, order: Order, events: List) -> None:
    proposal_id = order.payload.get("proposal_id")
    response = order.payload.get("response")
    ps = state.players[tribe]
    match = None
    for p in ps.outstanding_proposals:
        if p.id == proposal_id:
            match = p
            break
    if match is None:
        events.append({"kind": "respond_failed", "reason": "no_such_proposal"})
        return
    ps.outstanding_proposals.remove(match)

    # Defensive expiry check: \u00a75.6 purges expired proposals, but a response
    # could still arrive on the same tick as expiry (proposals live until
    # expires_tick inclusive, and \u00a75.1 runs before \u00a75.6). Reject any
    # response that arrives past the deadline.
    if match.expires_tick <= state.tick:
        events.append({"kind": "respond_failed", "reason": "proposal_expired", "id": proposal_id})
        return

    if response != "accept":
        events.append({"kind": "proposal_declined", "id": proposal_id})
        return

    # Acceptance side-effects
    if match.kind == "nap":
        pact = Pact(
            kind="nap",
            parties=tuple(sorted([match.from_tribe, match.to_tribe])),
            formed_tick=state.tick,
            expires_tick=state.tick + match.length_ticks,
        )
        state.pacts.append(pact)
        state.announcements.append(
            Announcement(
                tick=state.tick + 1,
                kind="pact_formed",
                parties=list(pact.parties),
                detail="nap",
            )
        )
        events.append({"kind": "pact_formed", "parties": list(pact.parties), "pact": "nap"})

    elif match.kind == "shared_vision":
        pact = Pact(
            kind="shared_vision",
            parties=tuple(sorted([match.from_tribe, match.to_tribe])),
            formed_tick=state.tick,
            expires_tick=state.tick + match.length_ticks,
        )
        state.pacts.append(pact)
        state.announcements.append(
            Announcement(
                tick=state.tick + 1,
                kind="pact_formed",
                parties=list(pact.parties),
                detail="shared_vision",
            )
        )
        events.append(
            {"kind": "pact_formed", "parties": list(pact.parties), "pact": "shared_vision"}
        )

    elif match.kind == "trade_offer":
        # Spawn a caravan
        sender = state.players[match.from_tribe]
        if sender.influence < match.amount_influence + 1:
            events.append({"kind": "trade_accept_failed", "reason": "sender_insolvent"})
            return
        sender.influence -= match.amount_influence + 1  # +1 overhead
        path = _caravan_path(state, match.from_tribe, match.to_tribe)
        cid = f"c_{state.next_caravan_idx:04d}"
        state.next_caravan_idx += 1
        state.caravans[cid] = Caravan(
            id=cid,
            owner=match.from_tribe,
            recipient=match.to_tribe,
            amount_influence=match.amount_influence,
            path=path,
            current_index=0,
            ticks_to_next_region=1,
        )
        events.append(
            {"kind": "caravan_dispatched", "id": cid, "amount": match.amount_influence, "path": path}
        )


def _resolve_unilateral_diplomacy(state: GameState, prop: Proposal, events: List) -> None:
    if prop.kind == "declare_war":
        parties = tuple(sorted([prop.from_tribe, prop.to_tribe]))
        # remove any existing pact
        state.pacts = [p for p in state.pacts if set(p.parties) != set(parties) or p.kind == "war"]
        state.pacts.append(
            Pact(kind="war", parties=parties, formed_tick=state.tick, expires_tick=10**9)
        )
        state.announcements.append(
            Announcement(tick=state.tick + 1, kind="war_declared", parties=list(parties))
        )
        events.append({"kind": "war_declared", "parties": list(parties)})
    elif prop.kind == "break_pact":
        parties = tuple(sorted([prop.from_tribe, prop.to_tribe]))
        breaking = None
        for p in state.pacts:
            if set(p.parties) == set(parties) and p.kind == "nap":
                breaking = p
                break
        if breaking is None:
            events.append({"kind": "break_pact_noop"})
            return
        age = state.tick - breaking.formed_tick
        penalty_duration = (
            REPUTATION_PENALTY_DURATION_EARLY_BREAK
            if age < REPUTATION_EARLY_BREAK_THRESHOLD_TICKS
            else REPUTATION_PENALTY_DURATION_LATE_BREAK
        )
        state.players[prop.from_tribe].reputation_penalty_expires_tick = (
            state.tick + penalty_duration
        )
        state.pacts.remove(breaking)
        state.announcements.append(
            Announcement(
                tick=state.tick + 1,
                kind="pact_broken",
                parties=list(parties),
                breaker=prop.from_tribe,
                detail="nap",
            )
        )
        events.append({"kind": "pact_broken", "breaker": prop.from_tribe, "parties": list(parties)})


def _apply_message(state: GameState, tribe: Tribe, order: Order, events: List) -> None:
    to = order.payload.get("to")
    text = order.payload.get("text", "")
    if to not in state.tribes_alive or to == tribe:
        return
    state.players[to].inbox.append(
        InboxMessage(tick=state.tick + 1, kind="message", from_tribe=tribe, text=text)
    )
    events.append({"kind": "message_sent", "from": tribe, "to": to})


def _apply_dispatch_move(state: GameState, tribe: Tribe, order: Order, events: List) -> None:
    force_id = order.payload.get("force_id")
    dest = order.payload.get("destination_region_id")
    f = state.forces.get(force_id)
    if f is None or f.owner != tribe or f.location_kind != "garrison":
        events.append({"kind": "move_failed", "reason": "invalid_force"})
        return
    origin = f.location_region_id
    assert origin is not None
    trail = trail_between(state, origin, dest)
    if trail is None:
        events.append({"kind": "move_failed", "reason": "no_trail"})
        return

    # Effective trail length: base + tier travel penalty, minus road modifier if applicable.
    length = trail.base_length_ticks
    origin_region = state.regions[origin]
    # Road from origin toward destination
    for idx, target in origin_region.road_targets.items():
        if target == dest and idx < len(origin_region.structures) and origin_region.structures[idx] == "road":
            length = road_modified_length(length)
            break
    length += FORCE_TRAVEL_PENALTY[f.tier]

    # NAP break check
    dest_owner = state.regions[dest].owner
    if dest_owner is not None and dest_owner != tribe:
        nap = _find_pact(state, "nap", tribe, dest_owner)
        if nap is not None:
            # Break NAP
            age = state.tick - nap.formed_tick
            penalty = (
                REPUTATION_PENALTY_DURATION_EARLY_BREAK
                if age < REPUTATION_EARLY_BREAK_THRESHOLD_TICKS
                else REPUTATION_PENALTY_DURATION_LATE_BREAK
            )
            state.players[tribe].reputation_penalty_expires_tick = state.tick + penalty
            state.pacts.remove(nap)
            state.announcements.append(
                Announcement(
                    tick=state.tick + 1,
                    kind="pact_broken",
                    parties=list(nap.parties),
                    breaker=tribe,
                    detail="nap-violated-by-move",
                )
            )
            events.append({"kind": "pact_broken_by_move", "breaker": tribe, "parties": list(nap.parties)})

    # Update force
    f.location_kind = "transit"
    f.location_region_id = None
    f.location_transit = ForceTransit(
        trail_index=trail.index,
        direction_from=origin,
        direction_to=dest,
        ticks_remaining=length,
    )
    origin_region.garrison_force_id = None
    events.append(
        {"kind": "dispatch_move", "tribe": tribe, "force_id": force_id, "from": origin, "to": dest, "ticks": length}
    )


def _apply_dispatch_scout(state: GameState, tribe: Tribe, order: Order, events: List) -> None:
    origin = order.payload.get("from_region_id")
    target = order.payload.get("target_region_id")
    region = state.regions.get(origin)
    ps = state.players[tribe]
    if region is None or region.owner != tribe:
        events.append({"kind": "scout_failed", "reason": "not_owned_origin"})
        return
    if ps.influence < SCOUT_COST:
        events.append({"kind": "scout_failed", "reason": "no_influence"})
        return
    trail = trail_between(state, origin, target)
    if trail is None:
        events.append({"kind": "scout_failed", "reason": "no_trail"})
        return
    ps.influence -= SCOUT_COST
    sid = f"s_{tribe}_{state.next_scout_idx:03d}"
    state.next_scout_idx += 1
    state.scouts[sid] = Scout(
        id=sid,
        owner=tribe,
        target_region_id=target,
        location_kind="transit",
        transit=ScoutTransit(
            trail_index=trail.index,
            direction_from=origin,
            direction_to=target,
            ticks_remaining=trail.base_length_ticks,
        ),
    )
    events.append({"kind": "dispatch_scout", "tribe": tribe, "scout_id": sid, "from": origin, "to": target})


# ---------------------------------------------------------------------------
# Combat
# ---------------------------------------------------------------------------


def _resolve_combats(
    state: GameState,
    events: List[Dict[str, Any]],
    scout_reveal_this_tick: Dict[RegionId, List[Tribe]],
) -> None:
    for region_id in sorted(state.regions.keys()):
        forces_here = [
            f
            for f in state.forces.values()
            if f.location_kind == "garrison" and f.location_region_id == region_id
        ]
        owners = set(f.owner for f in forces_here)
        if len(owners) < 2:
            continue
        _resolve_combat_at(state, region_id, forces_here, events, scout_reveal_this_tick)


def _resolve_combat_at(
    state: GameState,
    region_id: RegionId,
    forces: List[Force],
    events: List[Dict[str, Any]],
    scout_reveal_this_tick: Dict[RegionId, List[Tribe]],
) -> None:
    region = state.regions[region_id]
    defender = None
    attackers = []
    for f in forces:
        if region.owner == f.owner:
            defender = f
        else:
            attackers.append(f)

    # Attackers process in alphabetical order by owner tribe
    attackers.sort(key=lambda x: x.owner)

    for attacker in attackers:
        if defender is None:
            # Uncontested occupation
            _transfer_region(state, region, attacker, events)
            defender = attacker
            continue

        d_eff = defender.tier
        d_eff += COMBAT_DEFENDER_OWN_REGION_BONUS  # defender-in-own-region
        if "fort" in region.structures:
            d_eff += COMBAT_FORT_BONUS
        # Shared-vision reinforcement
        reinf = 0
        for adj_id in adjacent_regions(state, region_id):
            adj = state.regions[adj_id]
            if adj.owner is None or adj.owner == defender.owner:
                continue
            if _find_pact(state, "shared_vision", defender.owner, adj.owner) is None:
                continue
            if adj.garrison_force_id is None:
                continue
            ally_force = state.forces[adj.garrison_force_id]
            if ally_force.tier >= 2:
                reinf += COMBAT_REINFORCEMENT_BONUS_PER_ALLY
        d_eff += min(reinf, COMBAT_REINFORCEMENT_BONUS_CAP)

        a_eff = attacker.tier
        revealed_by = scout_reveal_this_tick.get(region_id, [])
        if defender.owner in revealed_by:
            a_eff += COMBAT_SCOUT_REVEAL_PENALTY

        if a_eff > d_eff:
            # Attacker wins
            defender.tier -= 1
            events.append(
                {"kind": "combat", "region": region_id, "result": "attacker_wins",
                 "attacker": attacker.owner, "defender": defender.owner,
                 "a_eff": a_eff, "d_eff": d_eff}
            )
            if defender.tier < 1:
                _destroy_force(state, defender)
                _transfer_region(state, region, attacker, events)
                defender = attacker
            else:
                _retreat_or_destroy(state, defender, events)
                _transfer_region(state, region, attacker, events)
                defender = attacker
        elif a_eff < d_eff:
            attacker.tier -= 1
            events.append(
                {"kind": "combat", "region": region_id, "result": "defender_wins",
                 "attacker": attacker.owner, "defender": defender.owner,
                 "a_eff": a_eff, "d_eff": d_eff}
            )
            if attacker.tier < 1:
                _destroy_force(state, attacker)
            else:
                _retreat_or_destroy(state, attacker, events)
        else:
            # Tie: both drop one tier
            defender.tier -= 1
            attacker.tier -= 1
            events.append(
                {"kind": "combat", "region": region_id, "result": "tie",
                 "attacker": attacker.owner, "defender": defender.owner,
                 "a_eff": a_eff, "d_eff": d_eff}
            )
            if defender.tier < 1:
                _destroy_force(state, defender)
                defender = None
            else:
                _retreat_or_destroy(state, defender, events)
                defender = None
            if attacker.tier < 1:
                _destroy_force(state, attacker)
            else:
                _retreat_or_destroy(state, attacker, events)


def _transfer_region(state: GameState, region: Region, new_garrison: Force, events: List) -> None:
    old_owner = region.owner
    region.owner = new_garrison.owner
    region.garrison_force_id = new_garrison.id
    new_garrison.location_kind = "garrison"
    new_garrison.location_region_id = region.id
    new_garrison.location_transit = None
    events.append(
        {"kind": "region_transferred", "region_id": region.id, "from": old_owner, "to": new_garrison.owner}
    )


def _destroy_force(state: GameState, f: Force) -> None:
    if f.location_region_id is not None:
        r = state.regions.get(f.location_region_id)
        if r is not None and r.garrison_force_id == f.id:
            r.garrison_force_id = None
    del state.forces[f.id]


def _retreat_or_destroy(state: GameState, f: Force, events: List) -> None:
    origin_region_id = f.location_region_id
    if origin_region_id is None:
        _destroy_force(state, f)
        return
    adj = adjacent_regions(state, origin_region_id)
    # Find an adjacent friendly region with no garrison
    for cand in sorted(adj):
        r = state.regions[cand]
        if r.owner == f.owner and r.garrison_force_id is None:
            # Retreat succeeds
            old = state.regions.get(origin_region_id)
            if old is not None and old.garrison_force_id == f.id:
                old.garrison_force_id = None
            f.location_region_id = cand
            r.garrison_force_id = f.id
            events.append({"kind": "force_retreated", "force_id": f.id, "to": cand})
            return
    # No retreat available
    events.append({"kind": "force_destroyed_no_retreat", "force_id": f.id})
    _destroy_force(state, f)


# ---------------------------------------------------------------------------
# Caravans
# ---------------------------------------------------------------------------


def _caravan_path(state: GameState, sender: Tribe, recipient: Tribe) -> List[RegionId]:
    """BFS shortest path between sender's nearest owned region and recipient's."""
    sender_regions = sorted(
        [rid for rid, r in state.regions.items() if r.owner == sender]
    )
    recipient_regions = set(
        rid for rid, r in state.regions.items() if r.owner == recipient
    )
    if not sender_regions or not recipient_regions:
        return []
    # BFS from any sender region to any recipient region; pick deterministic
    from collections import deque

    start = sender_regions[0]
    queue = deque([(start, [start])])
    seen = {start}
    while queue:
        node, path = queue.popleft()
        if node in recipient_regions:
            return path
        for nb in adjacent_regions(state, node):
            if nb in seen:
                continue
            seen.add(nb)
            queue.append((nb, path + [nb]))
    return [start]


def _deliver_caravan(state: GameState, c: Caravan, events: List) -> None:
    # Check for interception along the full path: any tier-II+ hostile garrison in path regions
    interceptor = None
    for rid in c.path:
        r = state.regions.get(rid)
        if r is None or r.garrison_force_id is None:
            continue
        f = state.forces[r.garrison_force_id]
        if f.owner in (c.owner, c.recipient):
            continue
        if f.tier >= CARAVAN_INTERCEPT_MIN_TIER:
            interceptor = f.owner
            break

    if interceptor is not None:
        state.players[interceptor].influence += c.amount_influence
        state.announcements.append(
            Announcement(
                tick=state.tick + 1,
                kind="caravan_intercepted",
                parties=[c.owner, c.recipient],
                interceptor=interceptor,
                amount=c.amount_influence,
            )
        )
        events.append(
            {
                "kind": "caravan_intercepted",
                "id": c.id,
                "from": c.owner,
                "to": c.recipient,
                "interceptor": interceptor,
                "amount": c.amount_influence,
            }
        )
    else:
        state.players[c.recipient].influence += c.amount_influence
        state.players[c.recipient].inbox.append(
            InboxMessage(
                tick=state.tick + 1,
                kind="caravan_delivered",
                from_tribe=c.owner,
                payload={"amount": c.amount_influence},
            )
        )
        events.append(
            {
                "kind": "caravan_delivered",
                "id": c.id,
                "from": c.owner,
                "to": c.recipient,
                "amount": c.amount_influence,
            }
        )
    del state.caravans[c.id]


# ---------------------------------------------------------------------------
# Diplomacy helpers
# ---------------------------------------------------------------------------


def _find_pact(state: GameState, kind: str, a: Tribe, b: Tribe) -> Optional[Pact]:
    parties = set([a, b])
    for p in state.pacts:
        if p.kind == kind and set(p.parties) == parties:
            return p
    return None


# ---------------------------------------------------------------------------
# Victory
# ---------------------------------------------------------------------------


def _check_victory(state: GameState, events: List) -> None:
    # Last standing
    owners_with_regions = set(
        r.owner for r in state.regions.values() if r.owner is not None
    )
    alive_with_regions = owners_with_regions & set(state.tribes_alive)
    if len(alive_with_regions) == 1:
        winner = next(iter(alive_with_regions))
        state.winner = winner
        state.announcements.append(
            Announcement(
                tick=state.tick, kind="victory", parties=[winner], condition="last_standing"
            )
        )
        events.append({"kind": "victory", "tribe": winner, "condition": "last_standing"})
        return

    # Eliminate tribes with no regions and no forces
    for tribe in list(state.tribes_alive):
        owned = any(r.owner == tribe for r in state.regions.values())
        forced = any(f.owner == tribe for f in state.forces.values())
        if not owned and not forced:
            state.tribes_alive.remove(tribe)
            state.announcements.append(
                Announcement(tick=state.tick, kind="tribe_eliminated", parties=[tribe])
            )
            events.append({"kind": "tribe_eliminated", "tribe": tribe})

    # Tick limit fallback
    if state.tick >= DEFAULT_TICK_LIMIT:
        winner = _weighted_score_winner(state)
        state.winner = winner
        state.announcements.append(
            Announcement(
                tick=state.tick,
                kind="victory",
                parties=winner if isinstance(winner, list) else [winner],
                condition="tick_limit",
            )
        )
        events.append({"kind": "victory", "tribes": winner, "condition": "tick_limit"})

    # TODO(v2.1): sustained territorial / economic / diplomatic / cultural victories


def _weighted_score_winner(state: GameState):
    scores: Dict[Tribe, float] = {}
    total_regions = max(1, len(state.regions))
    total_production = 0
    for region in state.regions.values():
        if region.owner is None:
            continue
        base = REGION_PRODUCTION.get(region.type, 0)
        if region.owner == "orange" and region.type == "plains":
            base += 1
        for st in region.structures:
            base += STRUCTURE_PRODUCTION_BONUS.get(st, 0)
        total_production += base
    total_production = max(1, total_production)

    for tribe in state.tribes_alive:
        owned = sum(1 for r in state.regions.values() if r.owner == tribe)
        own_prod = 0
        for region in state.regions.values():
            if region.owner != tribe:
                continue
            base = REGION_PRODUCTION.get(region.type, 0)
            if tribe == "orange" and region.type == "plains":
                base += 1
            for st in region.structures:
                base += STRUCTURE_PRODUCTION_BONUS.get(st, 0)
            own_prod += base
        shrines = sum(
            1 for r in state.regions.values() if r.owner == tribe and "shrine" in r.structures
        )
        naps = sum(1 for p in state.pacts if p.kind == "nap" and tribe in p.parties)
        scores[tribe] = (
            FINAL_SCORE_WEIGHTS["regions_owned"] * (owned / total_regions)
            + FINAL_SCORE_WEIGHTS["influence_share"] * (own_prod / total_production)
            + FINAL_SCORE_WEIGHTS["shrines_owned"] * (shrines / 4.0)
            + FINAL_SCORE_WEIGHTS["active_naps"] * (naps / max(1, len(state.tribes_alive) - 1))
        )
    if not scores:
        return None
    top = max(scores.values())
    winners = [t for t, s in scores.items() if s == top]
    return winners[0] if len(winners) == 1 else winners


# ---------------------------------------------------------------------------
# Hashing
# ---------------------------------------------------------------------------


def _hash_state(state: GameState) -> str:
    def default(obj: Any) -> Any:
        if hasattr(obj, "__dict__"):
            return obj.__dict__
        return str(obj)

    canonical = json.dumps(
        {
            "tick": state.tick,
            "tribes_alive": sorted(state.tribes_alive),
            "regions": {k: asdict(v) for k, v in sorted(state.regions.items())},
            "forces": {k: asdict(v) for k, v in sorted(state.forces.items())},
            "scouts": {k: asdict(v) for k, v in sorted(state.scouts.items())},
            "caravans": {k: asdict(v) for k, v in sorted(state.caravans.items())},
            "players": {
                k: {"influence": v.influence, "reputation_penalty_expires_tick": v.reputation_penalty_expires_tick}
                for k, v in sorted(state.players.items())
            },
            "pacts": [asdict(p) for p in sorted(state.pacts, key=lambda x: (x.kind, x.parties))],
            "winner": state.winner,
        },
        default=default,
        sort_keys=True,
        separators=(",", ":"),
    )
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()
