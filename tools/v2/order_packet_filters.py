"""Mirror packages/engine2/src/orderPacketFilters.ts — dedupe moves, then influence clip."""

from __future__ import annotations

from typing import List

from .influence_budget import filter_orders_by_influence_budget
from .state import Order


def dedupe_moves_one_per_force(orders: List[Order]) -> List[Order]:
    seen: set[str] = set()
    kept: List[Order] = []
    for o in orders:
        if o.kind == "move":
            fid = o.payload.get("force_id") or o.payload.get("forceId")
            if isinstance(fid, str):
                if fid in seen:
                    continue
                seen.add(fid)
        kept.append(o)
    return kept


def sanitize_player_orders(start_influence: int, orders: List[Order]) -> List[Order]:
    return filter_orders_by_influence_budget(
        start_influence, dedupe_moves_one_per_force(orders)
    )
