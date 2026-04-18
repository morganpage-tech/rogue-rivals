"""Compare 50-match trader-vulnerability variants.

Reads batch_{A_off,B_deny,C_steal}.jsonl and prints archetype-level
win rates, VP curves, bead income, raider hit rate, and the new
bead_denied/bead_stolen event counts.
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Tuple

ROOT = Path(__file__).resolve().parent

VARIANTS: List[Tuple[str, str]] = [
    ("A_off", "batch_A_off.jsonl"),
    ("B_deny", "batch_B_deny.jsonl"),
    ("C_steal", "batch_C_steal.jsonl"),
]


def load(path: Path) -> List[dict]:
    return [json.loads(l) for l in path.read_text().splitlines() if l.strip()]


def analyse(matches: List[dict]) -> dict:
    n_matches = len(matches)
    arch_wins: Dict[str, int] = defaultdict(int)
    arch_apps: Dict[str, int] = defaultdict(int)
    arch_vp: Dict[str, List[int]] = defaultdict(list)
    arch_beads_earned: Dict[str, int] = defaultdict(int)
    arch_beads_lost: Dict[str, int] = defaultdict(int)
    arch_buildings: Dict[str, List[int]] = defaultdict(list)
    completed = 0
    raider_ambushes_set = 0
    raider_ambushes_hit = 0
    total_bead_denied = 0
    total_bead_stolen = 0
    trader_matches_with_hit_loss = 0
    rounds_played_total = 0
    match_ends: Dict[str, int] = defaultdict(int)

    for m in matches:
        rounds_played_total += len(m.get("rounds", []))
        outcome = m.get("outcome") or {}
        end = outcome.get("end_trigger")
        match_ends[str(end)] += 1
        if end == "vp_reached":
            completed += 1
        players = m["players"]
        agg = m.get("aggregates", {})
        buildings_by_player = agg.get("buildings_by_player", {})
        winners = outcome.get("winner_ids") or []
        final_scores = outcome.get("final_scores") or {}
        # Per-agent raider ambush stats are pulled from aggregates (match-level).
        # To attribute to raider apps specifically, count attempts/hits by their pid in events.
        attempts_by_pid: Dict[str, int] = defaultdict(int)
        hits_by_pid: Dict[str, int] = defaultdict(int)
        for r in m.get("rounds", []):
            for ev in r.get("events", []):
                t = ev.get("type")
                if t == "turn":
                    act = ev.get("action") or {}
                    if act.get("type") == "ambush":
                        attempts_by_pid[ev.get("player_id", "")] += 1
                elif t == "ambush_triggered" and not ev.get("watchtower_absorbed", False):
                    hits_by_pid[ev.get("ambusher_id", "")] += 1
        for p in players:
            pid = p["id"]
            agent = p["agent"]
            arch_apps[agent] += 1
            arch_vp[agent].append(final_scores.get(pid, 0))
            arch_buildings[agent].append(len(buildings_by_player.get(pid, [])))
            if pid in winners:
                arch_wins[agent] += 1
            if agent == "aggressive_raider":
                raider_ambushes_set += attempts_by_pid.get(pid, 0)
                raider_ambushes_hit += hits_by_pid.get(pid, 0)
        agent_by_pid = {p["id"]: p["agent"] for p in players}
        any_trader_bead_denied_or_stolen = False
        for r in m.get("rounds", []):
            for ev in r.get("events", []):
                t = ev.get("type")
                if t == "bead_earned":
                    a = agent_by_pid.get(ev.get("player_id"))
                    if a:
                        arch_beads_earned[a] += 1
                elif t == "bead_denied":
                    total_bead_denied += ev.get("beads", 0)
                    a = agent_by_pid.get(ev.get("victim_id"))
                    if a:
                        arch_beads_lost[a] += ev.get("beads", 0)
                    if a == "diversified_trader":
                        any_trader_bead_denied_or_stolen = True
                elif t == "bead_stolen":
                    total_bead_stolen += ev.get("beads", 0)
                    a = agent_by_pid.get(ev.get("victim_id"))
                    if a:
                        arch_beads_lost[a] += ev.get("beads", 0)
                    if a == "diversified_trader":
                        any_trader_bead_denied_or_stolen = True
        if any_trader_bead_denied_or_stolen:
            trader_matches_with_hit_loss += 1

    # Fallback: if beads_earned_total isn't populated, use ambushes_hit fallback to agent stats
    out = {
        "n_matches": n_matches,
        "completed_matches": completed,
        "avg_rounds": rounds_played_total / max(1, n_matches),
        "match_ends": dict(match_ends),
        "raider_ambush_hit_rate": (raider_ambushes_hit / raider_ambushes_set) if raider_ambushes_set > 0 else 0.0,
        "raider_ambushes_set_total": raider_ambushes_set,
        "raider_ambushes_hit_total": raider_ambushes_hit,
        "total_bead_denied": total_bead_denied,
        "total_bead_stolen": total_bead_stolen,
        "trader_matches_with_hit_loss": trader_matches_with_hit_loss,
        "by_agent": {},
    }
    for a in sorted(arch_apps):
        apps = arch_apps[a]
        wins = arch_wins[a]
        vps = arch_vp[a]
        bs = arch_buildings[a]
        out["by_agent"][a] = {
            "apps": apps,
            "wins": wins,
            "win_rate": wins / apps if apps else 0.0,
            "avg_vp": sum(vps) / apps if apps else 0.0,
            "avg_buildings": sum(bs) / apps if apps else 0.0,
            "beads_earned_total": arch_beads_earned.get(a, 0),
            "beads_lost_total": arch_beads_lost.get(a, 0),
            "beads_earned_per_app": (arch_beads_earned.get(a, 0) / apps) if apps else 0.0,
            "beads_lost_per_app": (arch_beads_lost.get(a, 0) / apps) if apps else 0.0,
        }
    return out


def fmt_row(label: str, vs: Dict[str, dict]) -> str:
    cells = []
    for v in VARIANTS:
        cells.append(vs.get(v[0], "-"))
    return f"{label:<26} " + "  ".join(f"{c:>10}" for c in cells)


def main() -> int:
    results = {}
    for name, fn in VARIANTS:
        p = ROOT / fn
        if not p.exists():
            print(f"missing: {p}")
            return 1
        results[name] = analyse(load(p))

    print(f"\n=== Trader-vulnerability A/B summary (50 matches each) ===\n")
    print(f"{'metric':<26} " + "  ".join(f"{v[0]:>10}" for v in VARIANTS))
    print("-" * 72)
    row = {v[0]: f"{results[v[0]]['completed_matches']}/{results[v[0]]['n_matches']}" for v in VARIANTS}
    print(fmt_row("matches completed", row))
    row = {v[0]: f"{results[v[0]]['avg_rounds']:.2f}" for v in VARIANTS}
    print(fmt_row("avg rounds", row))
    row = {v[0]: f"{results[v[0]]['raider_ambush_hit_rate']*100:.1f}%" for v in VARIANTS}
    print(fmt_row("raider hit rate", row))
    row = {v[0]: f"{results[v[0]]['raider_ambushes_hit_total']}/{results[v[0]]['raider_ambushes_set_total']}" for v in VARIANTS}
    print(fmt_row("raider hits/attempts", row))
    row = {v[0]: f"{results[v[0]]['total_bead_denied']}" for v in VARIANTS}
    print(fmt_row("beads DENIED (total)", row))
    row = {v[0]: f"{results[v[0]]['total_bead_stolen']}" for v in VARIANTS}
    print(fmt_row("beads STOLEN (total)", row))
    row = {v[0]: f"{results[v[0]]['trader_matches_with_hit_loss']}" for v in VARIANTS}
    print(fmt_row("trader matches w/ loss", row))

    print("\nArchetype win rates (wins / apps):\n")
    agents = sorted(results[VARIANTS[0][0]]["by_agent"].keys())
    for a in agents:
        row = {}
        for v in VARIANTS:
            ag = results[v[0]]["by_agent"][a]
            row[v[0]] = f"{ag['wins']:>2}/{ag['apps']:>2} {ag['win_rate']*100:>5.1f}%"
        print(fmt_row(a, row))

    print("\nArchetype avg VP:\n")
    for a in agents:
        row = {v[0]: f"{results[v[0]]['by_agent'][a]['avg_vp']:.2f}" for v in VARIANTS}
        print(fmt_row(a, row))

    print("\nArchetype avg buildings:\n")
    for a in agents:
        row = {v[0]: f"{results[v[0]]['by_agent'][a]['avg_buildings']:.2f}" for v in VARIANTS}
        print(fmt_row(a, row))

    print("\nBeads earned per app (raw supply):\n")
    for a in agents:
        row = {v[0]: f"{results[v[0]]['by_agent'][a]['beads_earned_per_app']:.2f}" for v in VARIANTS}
        print(fmt_row(a, row))

    print("\nBeads LOST per app (denied/stolen):\n")
    for a in agents:
        row = {v[0]: f"{results[v[0]]['by_agent'][a]['beads_lost_per_app']:.2f}" for v in VARIANTS}
        print(fmt_row(a, row))
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
