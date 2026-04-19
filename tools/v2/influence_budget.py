"""Mirror packages/engine2/src/influenceBudget.ts — drop orders that would fail for no_influence.

Keep in sync with TS when costs or tick phase order changes.
"""

from __future__ import annotations

from typing import List

from .constants import FORCE_RECRUIT_COST, SCOUT_COST, STRUCTURE_COST
from .state import Order


def filter_orders_by_influence_budget(start_influence: int, orders: List[Order]) -> List[Order]:
    kept: List[Order] = []
    inf = start_influence

    for o in orders:
        if o.kind not in ("build", "recruit", "propose", "respond", "message"):
            continue
        c = _phase_one_cost(o)
        if c <= 0:
            kept.append(o)
            continue
        if inf >= c:
            inf -= c
            kept.append(o)

    for o in orders:
        if o.kind not in ("move", "scout"):
            continue
        c = SCOUT_COST if o.kind == "scout" else 0
        if c <= 0:
            kept.append(o)
            continue
        if inf >= c:
            inf -= c
            kept.append(o)

    return kept


def orders_exceed_influence_budget(start_influence: int, orders: List[Order]) -> bool:
    return len(filter_orders_by_influence_budget(start_influence, orders)) < len(orders)


def _phase_one_cost(o: Order) -> int:
    if o.kind == "build":
        s = o.payload.get("structure")
        return int(STRUCTURE_COST.get(s, 10**9))
    if o.kind == "recruit":
        t = int(o.payload.get("tier", 0))
        return int(FORCE_RECRUIT_COST.get(t, 10**9))
    return 0
