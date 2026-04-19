"""Pure-LLM batch runner for Rogue Rivals v2.

Runs N matches in parallel, each with 4 LLM-driven tribes following the
v2 engine. Writes per-match JSONL traces + a batch summary.

Usage:
    python -m tools.v2.run_batch --matches 1 --ticks 10 --out-dir simulations/v2_smoke
    python -m tools.v2.run_batch --matches 10 --ticks 30 --workers 4 --out-dir simulations/v2_batch_001

Requires an LLM API key. In priority: ANTHROPIC_API_KEY, ZAI_API_KEY/ZAI_KEY,
OPENAI_API_KEY. Set LLM_PROVIDER=zai to force Z.AI (glm-4.6).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, List, Optional

_THIS_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _THIS_DIR.parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from tools.llm_client import LLMClient, LLMError

from .engine import tick as engine_tick
from .llm_agent import decide_orders
from .mapgen import (
    build_expanded_map,
    build_hand_map,
    place_tribes,
    place_tribes_expanded,
)
from .personas import DEFAULT_PERSONA_ASSIGNMENT, PERSONA_BY_ID
from .state import GameState, Order, OrderPacket


TRIBES = ["orange", "grey", "brown", "red"]


def _build_match_state(seed: int, map_kind: str = "expanded") -> GameState:
    state = GameState(seed=seed)
    if map_kind == "minimal":
        build_hand_map(state)
        place_tribes(state, TRIBES)
    elif map_kind == "expanded":
        build_expanded_map(state)
        place_tribes_expanded(state, TRIBES)
    else:
        raise ValueError(f"unknown map_kind {map_kind!r}")
    return state


def run_match(
    match_idx: int,
    seed: int,
    max_ticks: int,
    persona_assignment: Dict[str, str],
    trace_path: Path,
    verbose: bool = False,
    map_kind: str = "expanded",
) -> Dict[str, Any]:
    """Run one match end-to-end. Returns a match-summary dict."""
    state = _build_match_state(seed, map_kind=map_kind)
    diagnostics: List[str] = []
    total_llm_calls = 0
    total_llm_errors = 0
    t0 = time.perf_counter()

    # One shared LLMClient per persona per match (reuses connection/model config).
    clients: Dict[str, LLMClient] = {}
    for tribe, pid in persona_assignment.items():
        persona = PERSONA_BY_ID[pid]
        try:
            clients[tribe] = LLMClient(
                temperature=persona.get("temperature", 0.2),
                max_input_tokens=4000,
                max_output_tokens=700,
            )
        except LLMError as e:
            diagnostics.append(f"client init failed for {tribe} ({pid}): {e}")
            return {
                "kind": "match_summary",
                "match_idx": match_idx,
                "seed": seed,
                "winner": None,
                "tick_final": 0,
                "error": f"client_init_failed: {e}",
                "diagnostics": diagnostics,
            }

    # Import projection here (already called by engine.tick internally but we
    # need the tick-0 view before the first tick resolves).
    from .fog import project_for_player

    trace_f = open(trace_path, "w", encoding="utf-8")
    try:
        # Pre-tick-0 projection so agents can see the initial board.
        initial_views = {t: project_for_player(state, t) for t in state.tribes_alive}
        views_for_decisions = initial_views

        while state.tick < max_ticks and state.winner is None:
            if verbose:
                print(
                    f"[match {match_idx}] tick {state.tick}: asking {len(state.tribes_alive)} LLMs",
                    file=sys.stderr,
                )

            packets: Dict[str, OrderPacket] = {}
            for tribe in state.tribes_alive:
                orders = decide_orders(
                    view=views_for_decisions[tribe],
                    persona_id=persona_assignment[tribe],
                    client=clients[tribe],
                    diagnostics=diagnostics,
                )
                total_llm_calls += 1
                if not orders:
                    # Might be a legitimate pass, but count those reported as errors
                    # by looking at diagnostics growth.
                    pass
                packets[tribe] = OrderPacket(tribe=tribe, tick=state.tick, orders=orders)

            result = engine_tick(state, packets)

            trace_record = {
                "tick": state.tick,  # post-resolution
                "match_idx": match_idx,
                "seed": seed,
                "state_hash": result["state_hash"],
                "orders_by_tribe": {
                    t: {
                        "tribe": pkt.tribe,
                        "tick": pkt.tick,
                        "orders": [{"kind": o.kind, "payload": o.payload} for o in pkt.orders],
                    }
                    for t, pkt in packets.items()
                },
                "resolution_events": result["events"],
                "projected_views": result["projected_views"],
            }
            trace_f.write(json.dumps(trace_record, default=str) + "\n")
            trace_f.flush()

            # Update views for next decision loop
            views_for_decisions = result["projected_views"]

        elapsed_s = time.perf_counter() - t0
        match_summary = {
            "kind": "match_summary",
            "match_idx": match_idx,
            "seed": seed,
            "persona_assignment": persona_assignment,
            "winner": state.winner,
            "tick_final": state.tick,
            "tribes_alive_at_end": list(state.tribes_alive),
            "elapsed_s": round(elapsed_s, 2),
            "llm_calls": total_llm_calls,
            "llm_errors": len(diagnostics),
            "diagnostics_sample": diagnostics[:10],
        }
        trace_f.write(json.dumps(match_summary, default=str) + "\n")
        return match_summary
    finally:
        trace_f.close()


def _worker_run_match(args: Dict[str, Any]) -> Dict[str, Any]:
    return run_match(
        match_idx=args["match_idx"],
        seed=args["seed"],
        max_ticks=args["max_ticks"],
        persona_assignment=args["persona_assignment"],
        trace_path=Path(args["trace_path"]),
        verbose=args["verbose"],
        map_kind=args.get("map_kind", "expanded"),
    )


def run_batch(
    num_matches: int,
    base_seed: int,
    max_ticks: int,
    persona_assignment: Dict[str, str],
    out_dir: Path,
    workers: int = 1,
    verbose: bool = False,
    map_kind: str = "expanded",
) -> Dict[str, Any]:
    """Run `num_matches` matches in parallel; merge traces to out_dir."""
    out_dir.mkdir(parents=True, exist_ok=True)

    jobs = []
    for i in range(num_matches):
        jobs.append(
            {
                "match_idx": i,
                "seed": base_seed + i,
                "max_ticks": max_ticks,
                "persona_assignment": persona_assignment,
                "trace_path": str(out_dir / f"match_{i:03d}.jsonl"),
                "verbose": verbose,
                "map_kind": map_kind,
            }
        )

    summaries: List[Dict[str, Any]] = []
    t0 = time.perf_counter()
    if workers <= 1:
        for job in jobs:
            summaries.append(_worker_run_match(job))
    else:
        with ProcessPoolExecutor(max_workers=workers) as ex:
            futures = {ex.submit(_worker_run_match, job): job for job in jobs}
            for fut in as_completed(futures):
                summaries.append(fut.result())
    elapsed_s = time.perf_counter() - t0

    summaries.sort(key=lambda s: s["match_idx"])

    # Write batch summary
    batch_summary = {
        "kind": "batch_summary",
        "num_matches": num_matches,
        "base_seed": base_seed,
        "max_ticks": max_ticks,
        "map_kind": map_kind,
        "persona_assignment": persona_assignment,
        "elapsed_s": round(elapsed_s, 2),
        "matches": summaries,
    }
    with (out_dir / "batch_summary.json").open("w", encoding="utf-8") as f:
        json.dump(batch_summary, f, indent=2, default=str)

    return batch_summary


def main() -> int:
    p = argparse.ArgumentParser(description="Rogue Rivals v2 pure-LLM batch runner")
    p.add_argument("--matches", type=int, default=1, help="Number of matches to run")
    p.add_argument("--ticks", type=int, default=30, help="Max ticks per match")
    p.add_argument("--seed", type=int, default=2026100, help="Base seed; match N uses seed+N")
    p.add_argument("--out-dir", type=Path, required=True)
    p.add_argument("--workers", type=int, default=1)
    p.add_argument("--verbose", action="store_true")
    p.add_argument(
        "--map",
        dest="map_kind",
        choices=["minimal", "expanded"],
        default="expanded",
        help="Which hand-built map to run on (default: expanded)",
    )
    # Persona overrides: --persona orange=warlord --persona red=merchant_prince
    p.add_argument(
        "--persona",
        action="append",
        default=[],
        help="Override persona assignment, e.g. orange=warlord",
    )
    args = p.parse_args()

    persona_assignment = dict(DEFAULT_PERSONA_ASSIGNMENT)
    for override in args.persona:
        if "=" not in override:
            print(f"bad --persona override: {override}", file=sys.stderr)
            return 2
        tribe, pid = override.split("=", 1)
        if tribe not in TRIBES:
            print(f"unknown tribe: {tribe}", file=sys.stderr)
            return 2
        if pid not in PERSONA_BY_ID:
            print(f"unknown persona: {pid}", file=sys.stderr)
            return 2
        persona_assignment[tribe] = pid

    print(
        f"Running {args.matches} matches, {args.ticks} ticks each, "
        f"{args.workers} workers, map={args.map_kind}.",
        file=sys.stderr,
    )
    print(f"Persona assignment: {persona_assignment}", file=sys.stderr)

    summary = run_batch(
        num_matches=args.matches,
        base_seed=args.seed,
        max_ticks=args.ticks,
        persona_assignment=persona_assignment,
        out_dir=args.out_dir,
        workers=args.workers,
        verbose=args.verbose,
        map_kind=args.map_kind,
    )

    # Print compact summary to stdout
    print(json.dumps(
        {
            "num_matches": summary["num_matches"],
            "elapsed_s": summary["elapsed_s"],
            "winners": [m["winner"] for m in summary["matches"]],
            "avg_tick_final": sum(m["tick_final"] for m in summary["matches"]) / max(1, len(summary["matches"])),
            "total_llm_errors": sum(m.get("llm_errors", 0) for m in summary["matches"]),
        },
        indent=2,
        default=str,
    ))
    return 0


if __name__ == "__main__":
    sys.exit(main())
