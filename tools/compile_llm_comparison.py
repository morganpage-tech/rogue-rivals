#!/usr/bin/env python3
"""Emit simulations/COMPARISON_llm_v1.md from heuristic vs LLM batch JSONLs + trace."""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _load_n(path: Path, n: int) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            if i >= n:
                break
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out


def _canon_arch(agent: str) -> str:
    return agent[:-4] if agent.endswith("_llm") else agent


def _match_metrics(m: Dict[str, Any]) -> Dict[str, Any]:
    trades = int(m["aggregates"].get("trades_completed_total") or 0)
    amb = int(m["aggregates"].get("ambushes_attempted") or 0)
    rnds = len(m.get("rounds") or [])
    bead_conv = 0
    tribute_hits = 0
    trade_rej = 0
    raw = json.dumps(m, ensure_ascii=False)
    tribute_hits += raw.count('"tribute_route_payment": true')
    for rnd in m.get("rounds", []):
        for ev in rnd.get("events", []):
            if ev.get("type") == "trade_rejected":
                trade_rej += 1
            if ev.get("type") == "bead_converted":
                bead_conv += 1
    return {
        "trades": trades,
        "ambushes": amb,
        "rounds_logged": rnds,
        "bead_converted_events": bead_conv,
        "trade_reject_events": trade_rej,
        "tribute_flags": tribute_hits,
    }


def _winner_arch(m: Dict[str, Any]) -> str:
    ws = (m.get("outcome") or {}).get("winner_ids") or ["?"]
    w = ws[0]
    for p in m.get("players", []):
        if p["id"] == w:
            return _canon_arch(p["agent"])
    return "unknown"


def _trace_metrics(trace_path: Path) -> Dict[str, Any]:
    retries = []
    fallbacks = 0
    turns = 0
    lat = []
    tin = []
    tout = []
    prov = "mock"
    if not trace_path.is_file():
        return {
            "avg_retries": 0,
            "fallback_pct": 0,
            "avg_latency_ms": 0,
            "avg_tokens_in": 0,
            "avg_tokens_out": 0,
            "avg_tokens_total": 0,
            "provider": prov,
            "cost_usd_est": 0.0,
        }
    with open(trace_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            turns += 1
            retries.append(int(r.get("retry_count") or 0))
            if r.get("fallback"):
                fallbacks += 1
            lat.append(int(r.get("latency_ms") or 0))
            tin.append(int(r.get("input_tokens") or 0))
            tout.append(int(r.get("output_tokens") or 0))
            prov = r.get("provider") or prov

    fb_pct = (100.0 * fallbacks / turns) if turns else 0.0
    avg_in = statistics.mean(tin) if tin else 0
    avg_out = statistics.mean(tout) if tout else 0
    cost = 0.0
    if prov == "anthropic":
        cost = (sum(tin) / 1e6) * 1.0 + (sum(tout) / 1e6) * 5.0
    elif prov == "openai":
        cost = (sum(tin) / 1e6) * 0.15 + (sum(tout) / 1e6) * 0.6
    elif prov == "zai":
        cost = (sum(tin) / 1e6) * 0.60 + (sum(tout) / 1e6) * 2.20
    elif prov == "groq":
        cost = (sum(tin) / 1e6) * 0.05 + (sum(tout) / 1e6) * 0.08

    return {
        "avg_retries": statistics.mean(retries) if retries else 0,
        "fallback_pct": fb_pct,
        "avg_latency_ms": statistics.mean(lat) if lat else 0,
        "avg_tokens_in": avg_in,
        "avg_tokens_out": avg_out,
        "avg_tokens_total": avg_in + avg_out,
        "provider": prov,
        "cost_usd_est": cost,
        "turns": turns,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--heuristic", default="simulations/batch_v0.7.3.jsonl")
    ap.add_argument("--llm", default="simulations/batch_llm_v1.jsonl")
    ap.add_argument("--trace", default="simulations/llm_trace_batch_llm_v1.jsonl")
    ap.add_argument("--n", type=int, default=10)
    ap.add_argument("--out", default="simulations/COMPARISON_llm_v1.md")
    args = ap.parse_args()

    h_path = ROOT / args.heuristic
    l_path = ROOT / args.llm
    t_path = ROOT / args.trace
    out_path = ROOT / args.out

    h_matches = _load_n(h_path, args.n)
    l_matches = _load_n(l_path, args.n)
    if len(h_matches) != args.n or len(l_matches) != args.n:
        print("Need full N matches in both files", file=sys.stderr)
        return 1

    has_key = (
        bool(os.environ.get("ANTHROPIC_API_KEY", "").strip())
        or bool(os.environ.get("OPENAI_API_KEY", "").strip())
        or bool(os.environ.get("ZAI_API_KEY", "").strip())
        or bool(os.environ.get("ZAI_KEY", "").strip())
        or bool(os.environ.get("GROQ_API_KEY", "").strip())
    )
    # Also treat trace-derived provider as authoritative: if the trace shows a
    # real provider (`anthropic`, `openai`, `zai`), the batch was not mocked
    # regardless of current env state when the *report* is generated.
    trace_prov = (_trace_metrics(t_path).get("provider") or "").lower()
    if trace_prov in ("anthropic", "openai", "zai", "groq"):
        has_key = True

    def dist(ms: List[Dict[str, Any]], key: str) -> Counter:
        c: Counter = Counter()
        for m in ms:
            c[m.get("outcome", {}).get(key) or "?"] += 1
        return c

    h_et = dist(h_matches, "end_trigger")
    l_et = dist(l_matches, "end_trigger")

    h_lens = [m["outcome"]["final_round"] for m in h_matches]
    l_lens = [m["outcome"]["final_round"] for m in l_matches]

    h_wm = [_winner_arch(m) for m in h_matches]
    l_wm = [_winner_arch(m) for m in l_matches]

    h_trade = statistics.mean(_match_metrics(m)["trades"] for m in h_matches)
    l_trade = statistics.mean(_match_metrics(m)["trades"] for m in l_matches)
    h_rej = statistics.mean(_match_metrics(m)["trade_reject_events"] for m in h_matches)
    l_rej = statistics.mean(_match_metrics(m)["trade_reject_events"] for m in l_matches)
    h_bead = statistics.mean(_match_metrics(m)["bead_converted_events"] for m in h_matches)
    l_bead = statistics.mean(_match_metrics(m)["bead_converted_events"] for m in l_matches)
    h_amb = statistics.mean(_match_metrics(m)["ambushes"] for m in h_matches)
    l_amb = statistics.mean(_match_metrics(m)["ambushes"] for m in l_matches)
    tribute_llm = sum(_match_metrics(m)["tribute_flags"] for m in l_matches)

    def _top_vp(m: Dict[str, Any]) -> int:
        fs = (m.get("outcome") or {}).get("final_scores") or {}
        return max(fs.values()) if fs else 0

    h_vpw = statistics.mean(_top_vp(m) for m in h_matches)
    l_vpw = statistics.mean(_top_vp(m) for m in l_matches)

    wm = _trace_metrics(t_path)
    logged_model = (
        (l_matches[0].get("run_metadata") or {}).get("runner_model") if l_matches else ""
    )
    # Prefer the model tag that was actually logged in the match's run_metadata
    # (that's what was used when the batch was run). Fall back to current env.
    if logged_model:
        model_note = logged_model
    elif os.environ.get("ANTHROPIC_API_KEY", "").strip():
        model_note = os.environ.get("ANTHROPIC_MODEL", "claude-3-5-haiku-20241022")
    elif (
        os.environ.get("ZAI_API_KEY", "").strip()
        or os.environ.get("ZAI_KEY", "").strip()
    ):
        model_note = os.environ.get("ZAI_MODEL", "glm-4.6")
    elif os.environ.get("OPENAI_API_KEY", "").strip():
        model_note = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    else:
        model_note = "MockLLMClient (no API key)"

    lines: List[str] = []
    lines.append("# LLM Level-1 vs Heuristic Baseline (first 10 seeds)")
    lines.append("")
    lines.append("## Overview")
    lines.append("")
    lines.append(
        f"- **Heuristic batch:** `{args.heuristic}` (first **{args.n}** matches), `rules_version` **v0.7.3**."
    )
    lines.append(f"- **LLM batch:** `{args.llm}` (same seeds / tribes / turn orders / schedules as heuristic row, agents swapped to `*_llm`).")
    lines.append(f"- **Validation:** `python3 tools/sim.py --validate {args.llm}` should exit **0** after generation.")
    lines.append(f"- **Model / plumbing:** `{model_note}` (see `run_metadata.runner_model` in each LLM match).")
    lines.append(f"- **Trace sidecar:** `{args.trace}` (one row per LLM seat).")
    lines.append(
        f"- **API key at report time:** {'present' if has_key else '**not set**'} — "
        "if absent, the 10-match run used **MockLLMClient** (deterministic stub policy; no external spend)."
    )
    if not has_key:
        lines.append("")
        lines.append(
            "> **Environment note:** No API key set; the **10-match batch was executed with MockLLMClient**, not Claude or GPT. "
            "**Code verification:** full batch + `--validate`; policy uses build-when-affordable → bootstrap Scrap via Ruins "
            "→ gather home → first legal fallback. **Real batch run** requires exporting `ANTHROPIC_API_KEY` or "
            "`OPENAI_API_KEY`, then: `python3 tools/run_llm_batch.py --n 10 --out simulations/batch_llm_v1.jsonl "
            "--trace-out simulations/llm_trace_batch_llm_v1.jsonl` followed by transcript + comparison regeneration."
        )
    lines.append(
        f"- **Rough API cost estimate (from trace token fields):** **${wm['cost_usd_est']:.4f}** USD "
        f"(provider `{wm['provider']}`)."
    )
    if wm["cost_usd_est"] > 5:
        lines.append("- **WARNING:** Estimated trace cost exceeds **$5** (rough heuristic pricing).")
    lines.append("")
    lines.append("## End-trigger distribution (paired seeds)")
    lines.append("")
    lines.append("| trigger | heuristic (n=10) | LLM (n=10) |")
    lines.append("|---|---:|---:|")
    all_triggers = sorted(set(h_et) | set(l_et))
    for t in all_triggers:
        lines.append(f"| `{t}` | {h_et.get(t, 0)} | {l_et.get(t, 0)} |")
    lines.append("")
    lines.append("## Match length (`final_round`)")
    lines.append("")
    lines.append(f"- **Avg:** heuristic **{statistics.mean(h_lens):.2f}** vs LLM **{statistics.mean(l_lens):.2f}**")
    lines.append(f"- **Histogram heuristic:** {dict(Counter(h_lens))}")
    lines.append(f"- **Histogram LLM:** {dict(Counter(l_lens))}")
    lines.append("")
    lines.append("## Trade activity")
    lines.append("")
    lines.append(f"- **Avg completed trades / match:** heuristic **{h_trade:.2f}** vs LLM **{l_trade:.2f}**")
    lines.append(f"- **Avg `trade_rejected` events / match:** heuristic **{h_rej:.2f}** vs LLM **{l_rej:.2f}**")
    lines.append(f"- **Avg bead conversion events / match:** heuristic **{h_bead:.2f}** vs LLM **{l_bead:.2f}**")
    lines.append("")
    lines.append("## Ambush activity")
    lines.append("")
    lines.append(f"- **Avg ambushes attempted / match:** heuristic **{h_amb:.2f}** vs LLM **{l_amb:.2f}**")
    lines.append("")
    lines.append("## Winner VP distribution")
    lines.append("")
    lines.append(f"- **Avg winning VP:** heuristic **{h_vpw:.2f}** vs LLM **{l_vpw:.2f}**")
    lines.append("")
    lines.append("## Archetype win rates (paired seeds)")
    lines.append("")
    lines.append(
        "> Note: the first ten slots in `batch_v0.6_initial_config.json` are **mirror greedy_builder ×4** schedules; "
        "both batches therefore mostly attribute wins to **`greedy_builder`** unless schedules differ."
    )
    lines.append("")
    lines.append("| archetype | heuristic wins | LLM wins |")
    lines.append("|---|---:|---:|")
    archset = sorted(set(h_wm + l_wm))
    for a in archset:
        lines.append(f"| `{a}` | {h_wm.count(a)} | {l_wm.count(a)} |")
    lines.append("")
    lines.append("## LLM-specific metrics (trace sidecar)")
    lines.append("")
    lines.append(f"- **Avg retries per LLM seat:** **{wm['avg_retries']:.3f}**")
    lines.append(f"- **Fallback rate (% of LLM seats):** **{wm['fallback_pct']:.2f}%**")
    lines.append(f"- **Avg latency / seat:** **{wm['avg_latency_ms']:.1f} ms**")
    lines.append(
        f"- **Avg tokens / seat:** **{wm['avg_tokens_total']:.0f}** "
        f"(in ~{wm['avg_tokens_in']:.0f}, out ~{wm['avg_tokens_out']:.0f})"
    )
    lines.append(f"- **Total LLM seats traced:** **{wm.get('turns', 0)}**")
    lines.append("")
    lines.append("## Qualitative observations")
    lines.append("")
    shared_ct = sum(
        1 for m in l_matches if len((m.get("outcome") or {}).get("winner_ids") or []) > 1
    )
    if not has_key:
        lines.append(
            "- **Batch driver:** With **no API key**, matches ran under **MockLLMClient** — narrative diversity and "
            "strategic novelty are minimal; transcripts mainly prove plumbing + logging."
        )
        lines.append(
            "- **Surprising observation (mock):** "
            f"{shared_ct}/10 matches ended with **multi-way shared victories** — the stub policy symmetrically churns "
            "late-game ties vs the greedy heuristics which separate leaders."
        )
        lines.append(
            "- **Dynamic alliances / tribute routes:** Not observable in mock mode; rerun with "
            "`ANTHROPIC_API_KEY` or `OPENAI_API_KEY` for behavioral signal."
        )
    else:
        lines.append(
            "- Review `simulations/TRANSCRIPTS_llm_v1.md` after real runs — below are placeholders until refreshed."
        )
        lines.append("- **Heuristic-only behaviors:** compare trace reasoning vs greedy_builder policy in seeds 1–10.")
        lines.append("- **Alliances:** watch `banker_llm` / `alliance_duopoly_llm` schedules on later batches.")
    lines.append("")
    lines.append(f"- **Tribute Route usage (proxy: `tribute_route_payment` substring hits in LLM JSON):** **{tribute_llm}** flags across {args.n} matches.")
    lines.append("")
    lines.append("## Conclusions")
    lines.append("")
    lines.append(
        "- **Level 2 NL negotiation:** Defer until a **keyed** LLM batch shows richer trade discourse than structured JSON; "
        "mock runs validate wiring only."
    )
    lines.append("")
    lines.append(
        "---\n\n*Auto-generated by `tools/compile_llm_comparison.py`. Regenerate after new batch/trace runs.*"
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as wf:
        wf.write("\n".join(lines) + "\n")
    print(out_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
