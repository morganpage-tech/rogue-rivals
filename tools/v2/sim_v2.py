"""Rogue Rivals v2 oracle simulator -- canned 10-tick end-to-end script.

Runs a scripted match on the hand-built 6-region map to exercise the
v2.0 engine: recruit, build, scout, move, combat, NAP propose/accept/break,
trade offer + caravan delivery, and a bit of free-text messaging.

Usage:
    python -m tools.v2.sim_v2                          # stdout summary
    python -m tools.v2.sim_v2 --trace out.jsonl        # write JSONL trace

The JSONL trace format is documented in RULES_v2.md \u00a712.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, List

from .engine import tick
from .mapgen import build_hand_map, place_tribes
from .state import GameState, Order, OrderPacket


TRIBES: List[str] = ["orange", "grey", "brown", "red"]


def _mk_state(seed: int = 2026001) -> GameState:
    state = GameState(seed=seed)
    build_hand_map(state)
    place_tribes(state, TRIBES)
    return state


def _pass_packet(tribe: str, tick_no: int) -> OrderPacket:
    return OrderPacket(tribe=tribe, tick=tick_no, orders=[])


def _get_canned_script(state: GameState) -> List[Dict[str, OrderPacket]]:
    """A human-authored 10-tick script that exercises the interesting paths.

    Design intent per tick:
      0: Orange proposes NAP with Grey; Brown builds a granary; Red recruits Tier I.
      1: Grey accepts NAP; Orange recruits Tier II; Brown sends a scout toward Ruins.
      2: Red proposes Trade Offer to Grey (10 Influence); Orange sends a Tier II
         toward the central Ruins region; Brown sends the scout on.
      3: Grey accepts Trade Offer (caravan dispatched); Orange continues forward;
         Brown's scout arrives at ruins.
      4: Caravan traversing; Red messages Grey ("beware orange"); Orange's force
         arrives at Ruins.
      5: Orange proposes NAP with Brown; Grey builds a watchtower at home
         (recruit would collide with the starting garrison).
      6: Orange dispatches Tier II from Ruins toward Grey's mountains -- breaks NAP!
         Caravan hop + eventual delivery.
      7: Grey scouts toward Ruins in retaliation; Brown builds fort.
      8: Orange's force arrives at Grey mountains; combat ensues.
      9: Recovery tick: any remaining messaging and passive production.
    """
    tribe_home_force: Dict[str, str] = {}
    for f in state.forces.values():
        tribe_home_force[f.owner] = f.id

    scripts: List[Dict[str, OrderPacket]] = []

    # Tick 0
    scripts.append(
        {
            "orange": OrderPacket(
                "orange",
                0,
                [
                    Order(
                        "propose",
                        {
                            "proposal": {
                                "kind": "nap",
                                "to": "grey",
                                "length_ticks": 8,
                            }
                        },
                    )
                ],
            ),
            "grey": _pass_packet("grey", 0),
            "brown": OrderPacket(
                "brown",
                0,
                [
                    Order(
                        "build",
                        {"region_id": "r_brown_swamps", "structure": "granary"},
                    )
                ],
            ),
            "red": OrderPacket(
                "red",
                0,
                [Order("recruit", {"region_id": "r_red_desert", "tier": 1})],
            ),
        }
    )

    # Tick 1
    # Find grey's outstanding proposal id lazily later; we pass a tentative id
    scripts.append(
        {
            "orange": OrderPacket(
                "orange",
                1,
                [Order("recruit", {"region_id": "r_orange_plains", "tier": 2})],
            ),
            "grey": OrderPacket(
                "grey",
                1,
                [
                    # respond will be rewritten at runtime to use real proposal id
                    Order("__respond_latest_nap__", {"response": "accept"}),
                ],
            ),
            "brown": OrderPacket(
                "brown",
                1,
                [
                    Order(
                        "scout",
                        {
                            "from_region_id": "r_brown_swamps",
                            "target_region_id": "r_desert_wastes",
                        },
                    )
                ],
            ),
            "red": _pass_packet("red", 1),
        }
    )

    # Tick 2
    scripts.append(
        {
            "orange": OrderPacket(
                "orange",
                2,
                [
                    Order(
                        "move",
                        {
                            # Will move the TIER II force recruited at tick 1 -- its id is deterministic
                            "force_id": "__orange_tier2__",
                            "destination_region_id": "r_ruins_center",
                        },
                    )
                ],
            ),
            "grey": _pass_packet("grey", 2),
            "brown": _pass_packet("brown", 2),
            "red": OrderPacket(
                "red",
                2,
                [
                    Order(
                        "propose",
                        {
                            "proposal": {
                                "kind": "trade_offer",
                                "to": "grey",
                                "amount_influence": 6,
                            }
                        },
                    )
                ],
            ),
        }
    )

    # Tick 3
    scripts.append(
        {
            "orange": _pass_packet("orange", 3),
            "grey": OrderPacket(
                "grey",
                3,
                [Order("__respond_latest_trade__", {"response": "accept"})],
            ),
            "brown": _pass_packet("brown", 3),
            "red": _pass_packet("red", 3),
        }
    )

    # Tick 4
    scripts.append(
        {
            "orange": _pass_packet("orange", 4),
            "grey": _pass_packet("grey", 4),
            "brown": _pass_packet("brown", 4),
            "red": OrderPacket(
                "red",
                4,
                [Order("message", {"to": "grey", "text": "beware orange"})],
            ),
        }
    )

    # Tick 5
    scripts.append(
        {
            "orange": OrderPacket(
                "orange",
                5,
                [
                    Order(
                        "propose",
                        {"proposal": {"kind": "nap", "to": "brown", "length_ticks": 8}},
                    )
                ],
            ),
            "grey": OrderPacket(
                "grey",
                5,
                # Grey's home garrison already occupies r_grey_mountains from
                # match init (\u00a74.9), so recruiting there would fail with
                # garrison_present. On the minimal map Grey has no adjacent
                # claimable region either. Build a watchtower instead -- costs
                # 6 Influence and matches the narrative ("Grey prepares").
                [
                    Order(
                        "build",
                        {"region_id": "r_grey_mountains", "structure": "watchtower"},
                    )
                ],
            ),
            "brown": _pass_packet("brown", 5),
            "red": _pass_packet("red", 5),
        }
    )

    # Tick 6 -- Orange breaks NAP by moving into Grey
    scripts.append(
        {
            "orange": OrderPacket(
                "orange",
                6,
                [
                    Order(
                        "move",
                        {
                            # Orange's tier-II originally at r_orange_plains moved to ruins at tick 2;
                            # now from ruins toward grey
                            "force_id": "__orange_tier2__",
                            "destination_region_id": "r_grey_mountains",
                        },
                    )
                ],
            ),
            "grey": _pass_packet("grey", 6),
            "brown": _pass_packet("brown", 6),
            "red": _pass_packet("red", 6),
        }
    )

    # Tick 7
    scripts.append(
        {
            "orange": _pass_packet("orange", 7),
            "grey": OrderPacket(
                "grey",
                7,
                [
                    Order(
                        "scout",
                        {
                            "from_region_id": "r_grey_mountains",
                            "target_region_id": "r_ruins_center",
                        },
                    )
                ],
            ),
            "brown": OrderPacket(
                "brown",
                7,
                [Order("build", {"region_id": "r_brown_swamps", "structure": "fort"})],
            ),
            "red": _pass_packet("red", 7),
        }
    )

    # Tick 8 -- combat at Grey's mountains
    scripts.append(
        {tribe: _pass_packet(tribe, 8) for tribe in TRIBES}
    )

    # Tick 9
    scripts.append(
        {tribe: _pass_packet(tribe, 9) for tribe in TRIBES}
    )

    return scripts


def _rewrite_dynamic_orders(
    state: GameState, script_tick: Dict[str, OrderPacket]
) -> Dict[str, OrderPacket]:
    """Replace placeholder ids in the canned script with live values.

    - "__orange_tier2__" -> the Tier II orange force currently owned by orange
    - "__respond_latest_nap__" / "__respond_latest_trade__" -> valid Order.kind
      with resolved proposal_id from the recipient's outstanding proposals.
    """
    new_packets: Dict[str, OrderPacket] = {}
    for tribe, packet in script_tick.items():
        new_orders: List[Order] = []
        for order in packet.orders:
            if order.kind == "move":
                fid = order.payload.get("force_id", "")
                if fid == "__orange_tier2__":
                    # Find any tier-II orange force not at home
                    tier2 = [
                        f for f in state.forces.values()
                        if f.owner == "orange" and f.tier == 2
                    ]
                    if not tier2:
                        continue  # skip invalid
                    # Prefer a garrisoned one
                    garr = [f for f in tier2 if f.location_kind == "garrison"]
                    pick = garr[0] if garr else tier2[0]
                    order = Order("move", {**order.payload, "force_id": pick.id})
            elif order.kind == "__respond_latest_nap__":
                # Find latest NAP proposal to this tribe
                candidates = [
                    p for p in state.players[tribe].outstanding_proposals if p.kind == "nap"
                ]
                if not candidates:
                    continue
                target = candidates[-1]
                order = Order(
                    "respond",
                    {"proposal_id": target.id, "response": order.payload.get("response", "accept")},
                )
            elif order.kind == "__respond_latest_trade__":
                candidates = [
                    p for p in state.players[tribe].outstanding_proposals if p.kind == "trade_offer"
                ]
                if not candidates:
                    continue
                target = candidates[-1]
                order = Order(
                    "respond",
                    {"proposal_id": target.id, "response": order.payload.get("response", "accept")},
                )
            new_orders.append(order)
        new_packets[tribe] = OrderPacket(tribe=tribe, tick=packet.tick, orders=new_orders)
    return new_packets


def run_match(trace_path: Path | None = None, seed: int = 2026001) -> Dict[str, Any]:
    state = _mk_state(seed)
    script = _get_canned_script(state)

    trace_file = open(trace_path, "w", encoding="utf-8") if trace_path else None

    try:
        for i in range(len(script)):
            packets = _rewrite_dynamic_orders(state, script[i])
            result = tick(state, packets)

            trace_record = {
                "tick": state.tick,  # the tick AFTER resolution
                "state_hash": result["state_hash"],
                "orders_by_tribe": {
                    tribe: {
                        "tribe": pkt.tribe,
                        "tick": pkt.tick,
                        "orders": [{"kind": o.kind, "payload": o.payload} for o in pkt.orders],
                    }
                    for tribe, pkt in packets.items()
                },
                "resolution_events": result["events"],
                "projected_views": result["projected_views"],
            }
            if trace_file:
                trace_file.write(json.dumps(trace_record, default=str) + "\n")

            if state.winner is not None:
                break

        match_summary = {
            "kind": "match_summary",
            "final_hash": result["state_hash"],
            "winner": state.winner,
            "tick_final": state.tick,
            "tribes_alive_at_end": list(state.tribes_alive),
        }
        if trace_file:
            trace_file.write(json.dumps(match_summary, default=str) + "\n")

        return match_summary
    finally:
        if trace_file:
            trace_file.close()


def main() -> int:
    p = argparse.ArgumentParser(description="Rogue Rivals v2 oracle simulator")
    p.add_argument("--trace", type=Path, default=None, help="Write JSONL trace to this path")
    p.add_argument("--seed", type=int, default=2026001)
    args = p.parse_args()

    summary = run_match(trace_path=args.trace, seed=args.seed)
    print(json.dumps(summary, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
