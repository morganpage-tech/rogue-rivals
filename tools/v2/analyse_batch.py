"""Aggregate analysis of a v2 LLM batch.

Usage: python -m tools.v2.analyse_batch <batch_dir>
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, List, Tuple


def analyse_match(trace_path: Path) -> Dict[str, Any]:
    recs: List[Dict[str, Any]] = []
    with trace_path.open() as f:
        for line in f:
            if line.strip():
                recs.append(json.loads(line))

    summary = next((r for r in recs if r.get("kind") == "match_summary"), {})
    tick_records = [r for r in recs if r.get("kind") != "match_summary"]

    events_by_kind: Counter = Counter()
    pacts_formed: List[Tuple[int, Tuple[str, ...], str]] = []
    pacts_broken: List[Tuple[int, str, Tuple[str, ...]]] = []
    wars_declared: List[Tuple[int, Tuple[str, ...]]] = []
    combats: List[Dict[str, Any]] = []
    caravans_delivered: List[Tuple[int, str, str, int]] = []
    caravans_intercepted: List[Tuple[int, str, str, int]] = []
    regions_claimed: List[Tuple[int, str, str]] = []  # (tick, tribe, region)
    forces_arrived: List[Tuple[int, str, str]] = []
    eliminations: List[Tuple[int, str]] = []
    orders_by_tribe_kind: Dict[str, Counter] = defaultdict(Counter)
    failures: Counter = Counter()

    for r in tick_records:
        t = r["tick"]
        for tribe, pkt in r.get("orders_by_tribe", {}).items():
            for o in pkt.get("orders", []):
                orders_by_tribe_kind[tribe][o["kind"]] += 1

        for e in r.get("resolution_events", []):
            k = e.get("kind", "?")
            events_by_kind[k] += 1
            if k == "pact_formed":
                pacts_formed.append(
                    (t, tuple(sorted(e.get("parties", []))), e.get("pact", "nap"))
                )
            elif k == "pact_broken":
                pacts_broken.append(
                    (
                        t,
                        e.get("breaker", "?"),
                        tuple(sorted(e.get("parties", []))),
                    )
                )
            elif k == "war_declared":
                wars_declared.append((t, tuple(sorted(e.get("parties", [])))))
            elif k == "combat":
                combats.append({"tick": t, **e})
            elif k == "caravan_delivered":
                caravans_delivered.append(
                    (t, e.get("to", "?"), e.get("from", "?"), e.get("amount", 0))
                )
            elif k == "caravan_intercepted":
                caravans_intercepted.append(
                    (t, e.get("interceptor", "?"), e.get("from", "?"), e.get("amount", 0))
                )
            elif k in ("region_claimed", "region_captured"):
                regions_claimed.append((t, e.get("tribe", "?"), e.get("region_id", "?")))
            elif k == "force_arrived":
                forces_arrived.append((t, e.get("tribe", "?"), e.get("region_id", "?")))
            elif k == "tribe_eliminated":
                eliminations.append((t, e.get("tribe", "?")))
            elif k.endswith("_failed"):
                failures[k] += 1

    # Final board control from projected_views of last tick
    final_tick = tick_records[-1] if tick_records else {}
    region_owners: Dict[str, str] = {}
    tribe_influence: Dict[str, int] = {}
    for tribe, view in final_tick.get("projected_views", {}).items():
        ps = view.get("my_player_state") or {}
        tribe_influence[tribe] = ps.get("influence", 0)
        for rid, rv in view.get("visible_regions", {}).items():
            owner = rv.get("owner")
            if owner:
                region_owners[rid] = owner

    return {
        "match_idx": summary.get("match_idx"),
        "seed": summary.get("seed"),
        "winner": summary.get("winner"),
        "tribes_alive_at_end": summary.get("tribes_alive_at_end", []),
        "tick_final": summary.get("tick_final"),
        "elapsed_s": summary.get("elapsed_s"),
        "llm_errors": summary.get("llm_errors", 0),
        "event_histogram": dict(events_by_kind),
        "pacts_formed": pacts_formed,
        "pacts_broken": pacts_broken,
        "wars_declared": wars_declared,
        "combats": combats,
        "caravans_delivered": caravans_delivered,
        "caravans_intercepted": caravans_intercepted,
        "regions_claimed": regions_claimed,
        "forces_arrived": forces_arrived,
        "eliminations": eliminations,
        "orders_by_tribe_kind": {t: dict(c) for t, c in orders_by_tribe_kind.items()},
        "failures": dict(failures),
        "final_region_owners": region_owners,
        "final_tribe_influence": tribe_influence,
    }


def print_match_report(a: Dict[str, Any]) -> None:
    idx = a["match_idx"]
    print(f"\n===== MATCH {idx}  (seed {a['seed']}) =====")
    print(
        f"  final tick: {a['tick_final']}   elapsed: {a['elapsed_s']}s   "
        f"LLM errors: {a['llm_errors']}"
    )
    print(
        f"  winner: {a['winner']}   tribes alive at end: {a['tribes_alive_at_end']}"
    )

    # Regions owned per tribe at end
    owner_counts: Counter = Counter(a["final_region_owners"].values())
    total_owned = sum(owner_counts.values())
    print(f"  regions owned (of {total_owned} claimed): {dict(owner_counts)}")
    print(f"  final influence per tribe: {a['final_tribe_influence']}")

    pf, pb, w = a["pacts_formed"], a["pacts_broken"], a["wars_declared"]
    unique_pacts = {p[1] for p in pf}
    print(
        f"  diplomacy:  pacts formed (unique pairs) = {len(unique_pacts)}   "
        f"pacts broken = {len(pb)}   wars = {len(w)}"
    )
    if pb:
        print("    BROKEN:")
        for t, breaker, parties in pb:
            print(f"      tick {t}: {breaker} broke pact {parties}")
    if w:
        print("    WARS:")
        for t, parties in w:
            print(f"      tick {t}: {parties}")

    combats = a["combats"]
    print(f"  combat:     resolved = {len(combats)}")
    for c in combats:
        region = c.get("region") or c.get("region_id")
        result = c.get("result") or c.get("outcome")
        print(
            f"    tick {c['tick']}: {c.get('attacker')} vs {c.get('defender')} "
            f"at {region} -> {result}  (a_eff={c.get('a_eff')}, d_eff={c.get('d_eff')})"
        )

    cd = a["caravans_delivered"]
    ci = a["caravans_intercepted"]
    print(f"  caravans:   delivered = {len(cd)}   intercepted = {len(ci)}")
    if ci:
        for t, interceptor, src, amt in ci:
            print(f"    tick {t}: {interceptor} intercepted {src}'s caravan ({amt})")

    print(f"  regions claimed this match: {len(a['regions_claimed'])}")
    print(f"  forces arrived this match: {len(a['forces_arrived'])}")

    print("  failures (order rejections by engine):")
    for k, v in sorted(a["failures"].items(), key=lambda kv: -kv[1]):
        print(f"    {k}: {v}")

    print("  orders issued by kind:")
    for tribe, c in sorted(a["orders_by_tribe_kind"].items()):
        ordered = sorted(c.items(), key=lambda kv: -kv[1])
        print(f"    {tribe}: {dict(ordered)}")


def print_batch_summary(analyses: List[Dict[str, Any]]) -> None:
    print("\n========== BATCH AGGREGATE ==========")
    print(f"matches analysed: {len(analyses)}")
    total_combats = sum(len(a["combats"]) for a in analyses)
    total_pacts = sum(len(a["pacts_formed"]) for a in analyses)
    total_broken = sum(len(a["pacts_broken"]) for a in analyses)
    total_wars = sum(len(a["wars_declared"]) for a in analyses)
    total_intercept = sum(len(a["caravans_intercepted"]) for a in analyses)
    total_delivered = sum(len(a["caravans_delivered"]) for a in analyses)
    total_eliminations = sum(len(a["eliminations"]) for a in analyses)
    total_claims = sum(len(a["regions_claimed"]) for a in analyses)
    winners = Counter(a["winner"] for a in analyses)
    print(f"  winners: {dict(winners)}")
    print(f"  total combats resolved: {total_combats}")
    print(f"  total pact_formed events: {total_pacts}   pacts_broken: {total_broken}   wars_declared: {total_wars}")
    print(f"  total caravans delivered: {total_delivered}   intercepted: {total_intercept}")
    print(f"  total regions claimed: {total_claims}")
    print(f"  total tribe eliminations: {total_eliminations}")

    # Per-tribe: orders-by-kind aggregate
    tribe_orders: Dict[str, Counter] = defaultdict(Counter)
    for a in analyses:
        for tribe, c in a["orders_by_tribe_kind"].items():
            for k, v in c.items():
                tribe_orders[tribe][k] += v
    print("\n  aggregate orders by persona:")
    for tribe, c in sorted(tribe_orders.items()):
        total = sum(c.values())
        ordered = sorted(c.items(), key=lambda kv: -kv[1])
        print(f"    {tribe} ({total} orders): {dict(ordered)}")

    # End-state region ownership aggregate
    owner_totals: Counter = Counter()
    for a in analyses:
        for owner in a["final_region_owners"].values():
            owner_totals[owner] += 1
    n = len(analyses)
    print(f"\n  average regions owned per tribe at end-of-match (over {n} matches):")
    for t, v in sorted(owner_totals.items(), key=lambda kv: -kv[1]):
        print(f"    {t}: {v/n:.1f}")


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("batch_dir", type=Path)
    p.add_argument("--per-match", action="store_true", default=True)
    args = p.parse_args()

    match_files = sorted(args.batch_dir.glob("match_*.jsonl"))
    if not match_files:
        print(f"no match files in {args.batch_dir}", file=sys.stderr)
        return 1

    analyses = [analyse_match(f) for f in match_files]
    if args.per_match:
        for a in analyses:
            print_match_report(a)
    print_batch_summary(analyses)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
