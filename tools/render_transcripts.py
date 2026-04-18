#!/usr/bin/env python3
"""Render narrative transcripts from an LLM batch JSONL plus trace sidecar."""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Tuple

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _load_jsonl(path: Path) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def _index_trace(traces: List[Dict[str, Any]]) -> Dict[Tuple[str, int, str], str]:
    """match_id, round, player_id -> reasoning text."""
    out: Dict[Tuple[str, int, str], str] = {}
    for t in traces:
        mid = t.get("match_id")
        if not mid:
            continue
        key = (str(mid), int(t.get("round", 0)), str(t.get("player_id", "")))
        txt = str(t.get("reasoning_echo") or "").strip()
        if txt:
            out[key] = txt
    return out


def _action_line(action: Dict[str, Any]) -> str:
    t = action.get("type", "?")
    if t == "gather":
        reg = action.get("region", "?")
        y = action.get("yield") or {}
        amb = action.get("intercepted_by")
        if amb:
            return f"gather @{reg} — **AMBUSHED** by {amb} (stolen yield)."
        return f"gather @{reg}, picked up {y}"
    if t == "build":
        return f"build **{action.get('building')}** (+{action.get('vp_gained')} VP)"
    if t == "ambush":
        return f"ambush set (hidden) on **{action.get('region')}**"
    if t == "scout":
        rev = action.get("revealed_ambushers") or []
        if rev:
            return f"scout @{action.get('region')} — revealed ambushers {rev}"
        return f"scout @{action.get('region')}, pickup {action.get('yield')}"
    if t == "pass":
        return "pass"
    return json.dumps(action, ensure_ascii=False)


def _pick_matches(matches: List[Dict[str, Any]], want: int) -> List[Dict[str, Any]]:
    """Prefer diversity of end_trigger: vp_threshold, great_hall, round_limit."""
    by_trigger: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for m in matches:
        et = m.get("outcome", {}).get("end_trigger") or "unknown"
        by_trigger[et].append(m)
    order_prio = ["vp_threshold", "great_hall", "round_limit"]
    picked: List[Dict[str, Any]] = []
    seen_seed: set[int] = set()
    for et in order_prio:
        for m in by_trigger.get(et, []):
            s = int(m["seed"])
            if s not in seen_seed:
                picked.append(m)
                seen_seed.add(s)
            if len(picked) >= want:
                return picked[:want]
    for m in matches:
        s = int(m["seed"])
        if s not in seen_seed:
            picked.append(m)
            seen_seed.add(s)
        if len(picked) >= want:
            break
    return picked[:want]


def render_match(m: Dict[str, Any], trace_ix: Dict[Tuple[str, int, str], str]) -> str:
    mid = m["match_id"]
    seed = m["seed"]
    lines: List[str] = []
    lines.append(f"# Match seed **{seed}** (`match_id={mid}`)")
    lines.append("")
    ov = m.get("outcome", {})
    lines.append(
        f"**Result:** winners {ov.get('winner_ids')} via `{ov.get('end_trigger')}` "
        f"after round **{ov.get('final_round')}**. Scores: {ov.get('final_scores')}"
    )
    lines.append("")
    pid_to_agent = {p["id"]: p["agent"] for p in m["players"]}

    for rnd in m.get("rounds", []):
        rnum = rnd["round"]
        lines.append(f"## Round {rnum}")
        lines.append("")
        for ev in rnd.get("events", []):
            if ev.get("type") != "turn":
                continue
            pid = ev["player_id"]
            agent = pid_to_agent.get(pid, "?")
            rationale = trace_ix.get((mid, rnum, pid), "")
            if not rationale:
                rationale = str(ev.get("rationale") or "").strip()
            action = ev.get("action") or {}
            chat = rationale.replace("\n", " ")[:320]
            lines.append(f"- **{pid}** ({agent}) *\"{chat}\"* → {_action_line(action)}")
            om = ev.get("offers_made") or []
            if om:
                lines.append(f"  - offers made: `{json.dumps(om, ensure_ascii=False)}`")
            oa = ev.get("offers_accepted") or []
            if oa:
                lines.append(f"  - accepted offer ids: {oa}")
        st = rnd.get("standings_after") or {}
        if st:
            lines.append("")
            lines.append(f"*Standings snapshot:* `{json.dumps(st, ensure_ascii=False)}`")
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="LLM batch JSONL")
    ap.add_argument("--traces", required=True, help="LLM trace JSONL")
    ap.add_argument("--out", required=True)
    ap.add_argument("--matches", type=int, default=3)
    args = ap.parse_args()

    inp = ROOT / args.input
    tr = ROOT / args.traces
    outp = ROOT / args.out

    matches = _load_jsonl(inp)
    traces = _load_jsonl(tr)
    ix = _index_trace(traces)
    chosen = _pick_matches(matches, args.matches)

    chunks = [
        "# Rogue Rivals — LLM Match Transcripts",
        "",
        "SMS-thread style readout: each line is one seat at the table. "
        "Reasoning comes from the LLM trace sidecar when available.",
        "",
    ]
    for m in chosen:
        chunks.append(render_match(m, ix))
        chunks.append("")

    outp.parent.mkdir(parents=True, exist_ok=True)
    with open(outp, "w", encoding="utf-8") as wf:
        wf.write("\n".join(chunks).strip() + "\n")
    print(outp)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
