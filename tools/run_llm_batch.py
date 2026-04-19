#!/usr/bin/env python3
"""
Run N LLM-agent matches mirroring the first N entries in the v0.7.3 heuristic batch
(same seed, tribes, turn_order, agent_params) with agents swapped to *_llm counterparts.

Matches are executed in parallel across worker processes since each match is
independent. Per-process trace JSONL fragments are written under
``simulations/_partials/`` and merged in match-order at the end.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.llm_agent import set_trace_emitter  # noqa: E402
from tools.llm_personas import HEURISTIC_TO_LLM  # noqa: E402
from tools.sim import (  # noqa: E402
    build_match_json,
    dumps_json,
    strip_internal,
    validate_accounting,
    validate_schema_basic,
    validate_stripped_match,
)


# USD per 1M tokens (rough; used for batch warning + report—tune to your list price)
COST_IN_PER_M = {
    "anthropic": 1.0,
    "anthropic_out": 5.0,
    "openai": 0.15,
    "openai_out": 0.6,
    "zai": 0.60,
    "zai_out": 2.20,
    # Groq: rough list-price ballpark; verify against current console pricing.
    "groq": 0.05,
    "groq_out": 0.08,
    "mock": 0.0,
}


def _map_agent(a: str) -> str:
    if a in HEURISTIC_TO_LLM:
        return HEURISTIC_TO_LLM[a]
    if a.endswith("_llm"):
        return a
    raise ValueError(f"Unknown agent for LLM mapping: {a}")


def _runner_model_name() -> str:
    # Honor explicit provider override first to match LLMClient's selection logic.
    override = os.environ.get("LLM_PROVIDER", "").strip().lower()
    has_a = bool(os.environ.get("ANTHROPIC_API_KEY", "").strip())
    has_z = bool(
        os.environ.get("ZAI_API_KEY", "").strip()
        or os.environ.get("ZAI_KEY", "").strip()
    )
    has_o = bool(os.environ.get("OPENAI_API_KEY", "").strip())
    has_g = bool(os.environ.get("GROQ_API_KEY", "").strip())
    if override == "anthropic" and has_a:
        return os.environ.get("ANTHROPIC_MODEL", "claude-3-5-haiku-20241022")
    if override == "zai" and has_z:
        return os.environ.get("ZAI_MODEL", "glm-4.6")
    if override == "openai" and has_o:
        return os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    if override == "groq" and has_g:
        return os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
    if has_a:
        return os.environ.get("ANTHROPIC_MODEL", "claude-3-5-haiku-20241022")
    if has_z:
        return os.environ.get("ZAI_MODEL", "glm-4.6")
    if has_o:
        return os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    if has_g:
        return os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
    return "mock-llm-client"


def _estimate_cost_usd(trace_path: Path) -> tuple[float, int, int, str]:
    if not trace_path.is_file():
        return 0.0, 0, 0, "mock"
    prov = "mock"
    total_in = total_out = 0
    with open(trace_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            prov = r.get("provider", "mock")
            total_in += int(r.get("input_tokens") or 0)
            total_out += int(r.get("output_tokens") or 0)
    if prov == "anthropic":
        cost = (total_in / 1e6) * COST_IN_PER_M["anthropic"] + (total_out / 1e6) * COST_IN_PER_M["anthropic_out"]
    elif prov == "openai":
        cost = (total_in / 1e6) * COST_IN_PER_M["openai"] + (total_out / 1e6) * COST_IN_PER_M["openai_out"]
    elif prov == "zai":
        cost = (total_in / 1e6) * COST_IN_PER_M["zai"] + (total_out / 1e6) * COST_IN_PER_M["zai_out"]
    elif prov == "groq":
        cost = (total_in / 1e6) * COST_IN_PER_M["groq"] + (total_out / 1e6) * COST_IN_PER_M["groq_out"]
    else:
        cost = 0.0
    return cost, total_in, total_out, prov


def _build_match_specs(
    args: argparse.Namespace,
    baseline_by_seed: Dict[int, dict],
    base_path: Path,
    config_runs: Optional[List[dict]],
) -> List[Dict[str, Any]]:
    """Materialize all per-match specs up front (pickle-safe primitives)."""
    specs: List[Dict[str, Any]] = []
    rmod = _runner_model_name()

    skip = max(0, int(getattr(args, "skip", 0) or 0))

    literal = bool(getattr(args, "literal_agents", False))

    if config_runs is not None:
        # --config already defines the runs; --skip trims the leading N entries.
        sliced = config_runs[skip : skip + args.n]
        for local_idx, run in enumerate(sliced):
            seed = int(run["seed"])
            bl = baseline_by_seed.get(seed)
            if bl is None:
                raise RuntimeError(f"No baseline row for seed {seed}")
            turn_order = bl["config"]["turn_order"]
            tribes = list(run["tribes"])
            agents = (
                list(run["agents"])
                if literal
                else [_map_agent(a) for a in run["agents"]]
            )
            npl = len(agents)
            apar = run.get("agent_params") or [{} for _ in range(npl)]
            if len(apar) < npl:
                apar = (apar + [{}] * npl)[:npl]
            specs.append(
                {
                    "match_index": local_idx,
                    "seed": seed,
                    "tribes": tribes,
                    "agents": agents,
                    "agent_params": [dict(p) for p in apar],
                    "turn_order": list(turn_order),
                    "runner_model": rmod,
                    "batch_id": args.batch_id,
                }
            )
        return specs

    kept = 0
    with open(base_path, "r", encoding="utf-8") as bf:
        for i, line in enumerate(bf):
            line = line.strip()
            if not line:
                continue
            if i < skip:
                continue
            if kept >= args.n:
                break
            b = json.loads(line)
            seed = int(b["seed"])
            turn_order = b["config"]["turn_order"]
            players = b["players"]
            tribes = [p["tribe"] for p in players]
            agents = [_map_agent(p["agent"]) for p in players]
            apar = [dict(p.get("agent_params") or {}) for p in players]
            specs.append(
                {
                    "match_index": kept,
                    "seed": seed,
                    "tribes": tribes,
                    "agents": agents,
                    "agent_params": apar,
                    "turn_order": list(turn_order),
                    "runner_model": rmod,
                    "batch_id": args.batch_id,
                }
            )
            kept += 1
    return specs


def _match_frag_paths(batch_id: str, idx: int, seed: int) -> tuple[Path, Path]:
    """Return (trace_frag, match_frag) paths used by workers & resume logic."""
    partials_dir = ROOT / "simulations" / "_partials"
    partials_dir.mkdir(parents=True, exist_ok=True)
    trace_frag = partials_dir / f"llm_trace_{batch_id}_idx{idx:04d}_seed{seed}.jsonl"
    match_frag = partials_dir / f"match_{batch_id}_idx{idx:04d}_seed{seed}.jsonl"
    return trace_frag, match_frag


def _run_match_worker(spec: Dict[str, Any]) -> Dict[str, Any]:
    """Worker: run one full match in this process. Returns match_line + trace_path.

    Writes both a per-match trace fragment (LLM call log) AND a per-match JSON
    fragment (final match state) to ``simulations/_partials/`` so that a crash
    or SIGKILL of the parent does not discard completed match state. The parent
    merges fragments in match-order after all futures resolve.
    """
    idx = int(spec["match_index"])
    seed = int(spec["seed"])
    batch_id = str(spec["batch_id"])

    trace_frag, match_frag = _match_frag_paths(batch_id, idx, seed)
    if trace_frag.exists():
        trace_frag.unlink()
    if match_frag.exists():
        match_frag.unlink()

    t0 = time.perf_counter()
    with open(trace_frag, "a", encoding="utf-8") as tf:

        def _emit(row: dict) -> None:
            tf.write(json.dumps(row, ensure_ascii=False) + "\n")
            tf.flush()

        set_trace_emitter(_emit)
        try:
            obj = build_match_json(
                seed,
                list(spec["tribes"]),
                list(spec["agents"]),
                list(spec["agent_params"]),
                list(spec["turn_order"]),
                None,
                runner_tag="tools/run_llm_batch.py",
                runner_model=str(spec["runner_model"]),
                llm_trace_batch_id=batch_id,
            )
            validate_schema_basic(obj)
            validate_accounting(obj)
            validate_stripped_match(strip_internal(obj))
            match_line = dumps_json(strip_internal(obj))
        finally:
            set_trace_emitter(None)

    # Persist the completed match as a single-line JSONL fragment so the
    # parent can recover it after an abrupt shutdown via --resume.
    match_frag.write_text(match_line + "\n", encoding="utf-8")

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    return {
        "match_index": idx,
        "seed": seed,
        "match_line": match_line,
        "trace_frag": str(trace_frag),
        "match_frag": str(match_frag),
        "elapsed_ms": elapsed_ms,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--baseline",
        type=str,
        default="simulations/batch_v0.7.3.jsonl",
        help="Heuristic batch JSONL indexed by seed for tribes/turn_order (always used for parity)",
    )
    ap.add_argument(
        "--config",
        type=str,
        default="",
        help="Optional tools/batch_v0.6_initial_config.json — first N runs supply seeds/agents/agent_params "
        "(turn_order taken from baseline row matching each seed)",
    )
    ap.add_argument("--n", type=int, default=10, help="Number of matches to run")
    ap.add_argument(
        "--skip",
        type=int,
        default=0,
        help="Number of leading baseline matches to skip (useful to target specific archetype windows).",
    )
    ap.add_argument(
        "--out",
        type=str,
        default="simulations/batch_llm_v1.jsonl",
    )
    ap.add_argument(
        "--trace-out",
        type=str,
        default="",
        help="Default: simulations/llm_trace_{batch_id}.jsonl",
    )
    ap.add_argument(
        "--batch-id",
        type=str,
        default="batch_llm_v1",
    )
    ap.add_argument(
        "--workers",
        type=int,
        default=5,
        help="Max parallel match workers (default 5; set 1 for serial). "
        "Z.AI rate limits and local file descriptor limits may force a lower cap.",
    )
    ap.add_argument(
        "--keep-partials",
        action="store_true",
        help="Keep per-match trace fragment files under simulations/_partials/ after merging.",
    )
    ap.add_argument(
        "--resume",
        action="store_true",
        help="If set, reuse any already-completed match fragments from simulations/_partials/ "
        "matching the batch-id/seed rather than re-running those matches.",
    )
    ap.add_argument(
        "--literal-agents",
        action="store_true",
        help="In --config mode, pass agent names through verbatim (no auto-map of "
        "heuristic names to *_llm). Use for mixed LLM-vs-heuristic experiments.",
    )
    args = ap.parse_args()

    base_path = ROOT / args.baseline
    if not base_path.is_file():
        print(f"Missing baseline file: {base_path}", file=sys.stderr)
        return 1

    baseline_by_seed: Dict[int, dict] = {}
    with open(base_path, "r", encoding="utf-8") as bf0:
        for line in bf0:
            line = line.strip()
            if not line:
                continue
            o = json.loads(line)
            baseline_by_seed[int(o["seed"])] = o

    config_runs: Optional[List[dict]] = None
    if args.config.strip():
        cfg_path = ROOT / args.config
        if not cfg_path.is_file():
            print(f"Missing --config {cfg_path}", file=sys.stderr)
            return 1
        with open(cfg_path, "r", encoding="utf-8") as cf:
            cfg_runs = json.load(cf).get("runs") or []
        config_runs = cfg_runs[: args.n]

    out_path = ROOT / args.out
    trace_path = (
        ROOT / args.trace_out
        if args.trace_out
        else ROOT / "simulations" / f"llm_trace_{args.batch_id}.jsonl"
    )
    trace_path.parent.mkdir(parents=True, exist_ok=True)
    if trace_path.is_file():
        trace_path.unlink()

    specs = _build_match_specs(args, baseline_by_seed, base_path, config_runs)
    if not specs:
        print("No matches to run.", file=sys.stderr)
        return 1

    n_matches = len(specs)
    workers = max(1, min(int(args.workers), n_matches))

    # Resume: pick up any per-match fragments that already exist for this batch_id + seed.
    results: Dict[int, Dict[str, Any]] = {}
    specs_to_run: List[Dict[str, Any]] = []
    if args.resume:
        for s in specs:
            idx = int(s["match_index"])
            seed = int(s["seed"])
            _, match_frag = _match_frag_paths(str(s["batch_id"]), idx, seed)
            if match_frag.is_file():
                try:
                    line = match_frag.read_text(encoding="utf-8").strip()
                    json.loads(line)  # sanity-check parseability
                    trace_frag, _ = _match_frag_paths(str(s["batch_id"]), idx, seed)
                    results[idx] = {
                        "match_index": idx,
                        "seed": seed,
                        "match_line": line,
                        "trace_frag": str(trace_frag),
                        "match_frag": str(match_frag),
                        "elapsed_ms": 0,
                        "resumed": True,
                    }
                    continue
                except Exception:
                    pass
            specs_to_run.append(s)
        n_resumed = len(results)
        if n_resumed:
            print(
                f"Resumed {n_resumed} match fragment(s) from simulations/_partials/ "
                f"(batch_id={args.batch_id}); running {len(specs_to_run)} fresh.",
                flush=True,
            )
    else:
        specs_to_run = list(specs)

    parallel_mode = workers > 1 and len(specs_to_run) > 1
    if specs_to_run:
        print(
            f"Running {len(specs_to_run)} matches with {workers} parallel worker(s); "
            f"model={_runner_model_name()}  batch_id={args.batch_id}",
            flush=True,
        )

    t_start = time.perf_counter()

    if specs_to_run and parallel_mode:
        with ProcessPoolExecutor(max_workers=workers) as ex:
            fut_to_idx = {
                ex.submit(_run_match_worker, s): s["match_index"] for s in specs_to_run
            }
            completed = 0
            for fut in as_completed(fut_to_idx):
                idx = fut_to_idx[fut]
                try:
                    res = fut.result()
                except Exception as e:  # pragma: no cover - surfaces worker exceptions
                    print(f"Match idx={idx} FAILED: {e}", file=sys.stderr)
                    raise
                results[res["match_index"]] = res
                completed += 1
                wall_s = time.perf_counter() - t_start
                print(
                    f"  [{completed}/{len(specs_to_run)}] seed={res['seed']} idx={res['match_index']} "
                    f"done in {res['elapsed_ms']/1000:.1f}s  (wall {wall_s:.1f}s)",
                    flush=True,
                )
    elif specs_to_run:
        for s in specs_to_run:
            res = _run_match_worker(s)
            results[res["match_index"]] = res
            wall_s = time.perf_counter() - t_start
            print(
                f"  [{res['match_index']+1}/{len(specs_to_run)}] seed={res['seed']} "
                f"done in {res['elapsed_ms']/1000:.1f}s  (wall {wall_s:.1f}s)",
                flush=True,
            )

    # Emit match output + merged trace in match_index order (= input order).
    ordered = [results[i] for i in sorted(results.keys())]

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as wf:
        wf.write("\n".join(r["match_line"] for r in ordered) + "\n")

    with open(trace_path, "w", encoding="utf-8") as merged:
        for r in ordered:
            frag_p = Path(r["trace_frag"])
            if not frag_p.is_file():
                continue
            with open(frag_p, "r", encoding="utf-8") as f:
                for line in f:
                    if not line.endswith("\n"):
                        line += "\n"
                    merged.write(line)
            if not args.keep_partials:
                try:
                    frag_p.unlink()
                except OSError:
                    pass
                mfrag_raw = r.get("match_frag")
                if mfrag_raw:
                    try:
                        Path(mfrag_raw).unlink()
                    except OSError:
                        pass

    if not args.keep_partials:
        partials_dir = ROOT / "simulations" / "_partials"
        try:
            # Remove dir only if empty (other batches may share it).
            next(partials_dir.iterdir())
        except StopIteration:
            partials_dir.rmdir()
        except FileNotFoundError:
            pass

    cost, total_in, total_out, prov = _estimate_cost_usd(trace_path)
    wall_total = time.perf_counter() - t_start
    print(f"Wrote {out_path} ({n_matches} matches)")
    print(f"Trace: {trace_path}")
    print(
        f"Model/est. provider: {_runner_model_name()} / {prov} | "
        f"tokens in~{total_in} out~{total_out} | est. cost USD ${cost:.4f} | "
        f"wall {wall_total:.1f}s ({workers} workers)"
    )
    if cost > 5.0:
        print("WARNING: estimated batch cost exceeds $5 USD (rough token pricing).", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
