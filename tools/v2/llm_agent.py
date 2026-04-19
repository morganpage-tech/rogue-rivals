"""LLM-driven agent for Rogue Rivals v2.

Given a ProjectedView (the per-tribe, fog-of-war-filtered state), the agent
prompts the LLM for an OrderPacket and returns the parsed orders.

Invariants:
  - Input: view dict from engine.tick()'s projected_views, plus a persona.
  - Output: list[Order] to stuff into OrderPacket(tribe=..., tick=..., orders=...).
  - Failure modes are ALL handled: JSON parse failure, schema mismatch,
    API error. The agent returns an empty orders list ("pass") and logs a
    diagnostic rather than crashing the batch.

This keeps the batch runner robust: one bad LLM call doesn't tank a match.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Allow running both as `python -m tools.v2.llm_agent` and as a script
_THIS_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _THIS_DIR.parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from tools.llm_client import LLMClient, LLMError  # reuse v1 infrastructure

from .compact_rules import COMPACT_RULES_V2
from .personas import PERSONA_BY_ID
from .state import Order


ORDER_PACKET_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["orders"],
    "additionalProperties": True,
    "properties": {
        "orders": {
            "type": "array",
            "maxItems": 12,
            "items": {
                "type": "object",
                "required": ["kind"],
                "additionalProperties": True,
                "properties": {
                    "kind": {
                        "type": "string",
                        "enum": [
                            "move",
                            "recruit",
                            "build",
                            "scout",
                            "propose",
                            "respond",
                            "message",
                            "pass",
                        ],
                    },
                },
            },
        },
    },
}

_VALID_ORDER_KINDS = {
    "move",
    "recruit",
    "build",
    "scout",
    "propose",
    "respond",
    "message",
}


def _compact_view(view: Dict[str, Any]) -> str:
    """Render a ProjectedView as a compact prompt-friendly block."""
    lines: List[str] = []
    lines.append(f"Tick: {view['tick']}  (you are {view['for_tribe']})")
    lines.append(f"Tribes alive: {', '.join(view.get('tribes_alive', []))}")

    ps = view.get("my_player_state", {}) or {}
    lines.append(
        f"Your Influence: {ps.get('influence', 0)}   "
        f"Reputation penalty until tick: {ps.get('reputation_penalty_expires_tick', 0)}"
    )

    lines.append("")
    lines.append("Your forces:")
    for f in view.get("my_forces", []):
        loc = (
            f"garrisoned at {f['location_region_id']}"
            if f["location_kind"] == "garrison"
            else f"in transit {f['location_transit']['direction_from']} -> {f['location_transit']['direction_to']} ({f['location_transit']['ticks_remaining']} ticks left)"
        )
        lines.append(f"  {f['id']} (Tier {f['tier']}) {loc}")
    if not view.get("my_forces"):
        lines.append("  (none)")

    if view.get("my_scouts"):
        lines.append("Your scouts:")
        for s in view["my_scouts"]:
            if s["location_kind"] == "transit":
                loc = f"in transit {s['transit']['direction_from']} -> {s['transit']['direction_to']} ({s['transit']['ticks_remaining']} left)"
            else:
                loc = f"arrived at {s['location_region_id']} (expires tick {s['expires_tick']})"
            lines.append(f"  {s['id']} targeting {s['target_region_id']}, {loc}")

    if view.get("my_caravans"):
        lines.append("Your caravans:")
        for c in view["my_caravans"]:
            lines.append(
                f"  {c['id']} to {c['recipient']} ({c['amount_influence']} Influence), "
                f"path {c['path']}, at index {c['current_index']}, "
                f"{c['ticks_to_next_region']} ticks to next hop"
            )

    lines.append("")
    lines.append("Visible regions:")
    for rid in sorted(view.get("visible_regions", {}).keys()):
        r = view["visible_regions"][rid]
        structures = ",".join(r.get("structures", [])) or "-"
        owner = r.get("owner") or "unclaimed"
        garrison = r.get("garrison_force_id")
        garrison_txt = " (has garrison)" if garrison else ""
        lines.append(
            f"  {rid} ({r['type']}) owner={owner} structures=[{structures}]{garrison_txt}"
        )

    if view.get("visible_forces"):
        lines.append("")
        lines.append("Visible foreign forces (fuzzy tier):")
        for f in view["visible_forces"]:
            lines.append(f"  {f['owner']}'s {f['fuzzy_tier']} at {f['region_id']}")

    if view.get("visible_transits"):
        lines.append("")
        lines.append("Visible foreign transits (fuzzy tier):")
        for t in view["visible_transits"]:
            lines.append(
                f"  {t['owner']}'s {t['fuzzy_tier']} in transit "
                f"{t['direction_from']} -> {t['direction_to']} (seen in {t['observed_in_region_id']})"
            )

    if view.get("visible_scouts"):
        lines.append("")
        lines.append("Visible foreign scouts:")
        for s in view["visible_scouts"]:
            lines.append(f"  {s['owner']}'s scout at {s['region_id']}")

    if view.get("pacts_involving_me"):
        lines.append("")
        lines.append("Active pacts involving you:")
        for p in view["pacts_involving_me"]:
            other = [t for t in p["parties"] if t != view["for_tribe"]][0]
            lines.append(
                f"  {p['kind']} with {other} (formed tick {p['formed_tick']}, "
                f"expires tick {p['expires_tick']})"
            )

    if view.get("inbox_new"):
        lines.append("")
        lines.append("New inbox this tick:")
        for m in view["inbox_new"]:
            if m["kind"] == "proposal":
                prop = m["proposal"]
                rep_tag = " [RECENT PACT-BREAKER]" if m.get("reputation_penalty") else ""
                extras = ""
                if prop["kind"] == "trade_offer":
                    extras = f" amount={prop.get('amount_influence', 0)}"
                if prop["kind"] in ("nap", "shared_vision"):
                    extras = f" length={prop.get('length_ticks', 0)} ticks"
                lines.append(
                    f"  PROPOSAL id={prop['id']}{rep_tag} "
                    f"{prop['kind']} from {m['from_tribe']}{extras}"
                )
            elif m["kind"] == "message":
                lines.append(f'  MESSAGE from {m["from_tribe"]}: "{m.get("text", "")}"')
            elif m["kind"] == "scout_report":
                pl = m.get("payload", {}) or {}
                lines.append(f"  SCOUT REPORT region={pl.get('region_id')}")
            elif m["kind"] == "caravan_delivered":
                pl = m.get("payload", {}) or {}
                lines.append(
                    f"  CARAVAN DELIVERED from {m['from_tribe']} amount={pl.get('amount')}"
                )
            else:
                lines.append(f"  {m['kind']}: {m.get('text') or m.get('payload')}")

    if view.get("announcements_new"):
        lines.append("")
        lines.append("Public announcements this tick:")
        for a in view["announcements_new"]:
            if a["kind"] == "pact_formed":
                lines.append(f"  PACT FORMED ({a.get('detail','')}): {a['parties']}")
            elif a["kind"] == "pact_broken":
                lines.append(
                    f"  PACT BROKEN ({a.get('detail','')}): {a['parties']} "
                    f"-- breaker: {a.get('breaker')}"
                )
            elif a["kind"] == "war_declared":
                lines.append(f"  WAR DECLARED between {a['parties']}")
            elif a["kind"] == "tribe_eliminated":
                lines.append(f"  TRIBE ELIMINATED: {a['parties']}")
            elif a["kind"] == "caravan_intercepted":
                lines.append(
                    f"  CARAVAN INTERCEPTED between {a['parties']} "
                    f"by {a.get('interceptor')} for {a.get('amount')} Influence"
                )
            elif a["kind"] == "victory":
                lines.append(
                    f"  VICTORY: {a['parties']} via {a.get('condition')}"
                )

    # Pending proposals that need your respond
    outstanding = ps.get("outstanding_proposals", []) or []
    if outstanding:
        lines.append("")
        lines.append("Pending proposals awaiting YOUR response:")
        for p in outstanding:
            extras = ""
            if p["kind"] == "trade_offer":
                extras = f" amount={p.get('amount_influence', 0)}"
            if p["kind"] in ("nap", "shared_vision"):
                extras = f" length={p.get('length_ticks', 0)} ticks"
            lines.append(
                f"  id={p['id']} {p['kind']} from {p['from_tribe']}{extras}"
            )

    return "\n".join(lines)


def _coerce_orders(
    raw: List[Dict[str, Any]], view: Dict[str, Any]
) -> List[Order]:
    """Validate + coerce LLM-returned orders into engine Order objects.

    Invalid orders are skipped silently (logged in diagnostics). Unknown
    fields are stripped; missing required fields cause the order to be dropped.
    """
    orders: List[Order] = []
    my_force_ids = {f["id"] for f in view.get("my_forces", [])}
    visible_region_ids = set(view.get("visible_regions", {}).keys())
    my_tribe = view["for_tribe"]
    tribes_alive = set(view.get("tribes_alive", []))
    outstanding = {
        p["id"] for p in (view.get("my_player_state") or {}).get("outstanding_proposals", [])
    }

    for entry in raw:
        if not isinstance(entry, dict):
            continue
        kind = entry.get("kind")
        if kind == "pass" or kind is None:
            continue
        if kind not in _VALID_ORDER_KINDS:
            continue

        payload: Dict[str, Any] = {}

        if kind == "move":
            fid = entry.get("force_id")
            dest = entry.get("destination_region_id")
            if fid not in my_force_ids:
                continue
            if not isinstance(dest, str):
                continue
            payload = {"force_id": fid, "destination_region_id": dest}

        elif kind == "recruit":
            rid = entry.get("region_id")
            tier = entry.get("tier", 2)
            if not isinstance(rid, str):
                continue
            if tier not in (1, 2, 3, 4):
                continue
            payload = {"region_id": rid, "tier": int(tier)}

        elif kind == "build":
            rid = entry.get("region_id")
            structure = entry.get("structure")
            if not isinstance(rid, str) or not isinstance(structure, str):
                continue
            payload = {"region_id": rid, "structure": structure}
            if "road_target" in entry:
                payload["road_target"] = entry["road_target"]

        elif kind == "scout":
            src = entry.get("from_region_id")
            tgt = entry.get("target_region_id")
            if not isinstance(src, str) or not isinstance(tgt, str):
                continue
            payload = {"from_region_id": src, "target_region_id": tgt}

        elif kind == "propose":
            proposal = entry.get("proposal") or {}
            if not isinstance(proposal, dict):
                continue
            pkind = proposal.get("kind")
            to = proposal.get("to")
            if pkind not in (
                "nap",
                "trade_offer",
                "shared_vision",
                "declare_war",
                "break_pact",
            ):
                continue
            if to not in tribes_alive or to == my_tribe:
                continue
            clean_proposal = {"kind": pkind, "to": to}
            if "length_ticks" in proposal:
                try:
                    clean_proposal["length_ticks"] = int(proposal["length_ticks"])
                except (TypeError, ValueError):
                    pass
            if "amount_influence" in proposal:
                try:
                    clean_proposal["amount_influence"] = int(
                        proposal["amount_influence"]
                    )
                except (TypeError, ValueError):
                    pass
            payload = {"proposal": clean_proposal}

        elif kind == "respond":
            pid = entry.get("proposal_id")
            resp = entry.get("response")
            if pid not in outstanding:
                continue
            if resp not in ("accept", "decline"):
                continue
            payload = {"proposal_id": pid, "response": resp}

        elif kind == "message":
            to = entry.get("to")
            text = entry.get("text", "")
            if to not in tribes_alive or to == my_tribe:
                continue
            if not isinstance(text, str):
                continue
            payload = {"to": to, "text": text[:400]}

        orders.append(Order(kind=kind, payload=payload))

    # Engine cap: we allow any number; caller can limit upstream.
    return orders


def decide_orders(
    view: Dict[str, Any],
    persona_id: str,
    client: Optional[LLMClient] = None,
    diagnostics: Optional[List[str]] = None,
) -> List[Order]:
    """Main entry: given a fog-of-war view + persona, return orders for this tick.

    On any failure returns []. `diagnostics` (if provided) collects human-readable
    error strings for post-batch inspection.
    """
    persona = PERSONA_BY_ID.get(persona_id)
    if persona is None:
        if diagnostics is not None:
            diagnostics.append(f"unknown persona_id {persona_id!r}")
        return []

    if client is None:
        try:
            client = LLMClient(
                temperature=persona.get("temperature", 0.2),
                max_input_tokens=4000,
                max_output_tokens=700,
            )
        except LLMError as e:
            if diagnostics is not None:
                diagnostics.append(f"client init failed: {e}")
            return []

    system_prompt = (
        f"{persona['system_prompt']}\n\n{COMPACT_RULES_V2}\n\n"
        "Respond with a SINGLE JSON object: {\"orders\": [...]}. "
        "Include any mix of move/recruit/build/scout/propose/respond/message orders. "
        "Empty orders array means pass. "
        "Do not invent region_ids, force_ids, or proposal_ids; only use ones visible to you. "
        "Keep messages under 200 characters."
    )

    user_prompt = (
        "CURRENT VIEW:\n"
        f"{_compact_view(view)}\n\n"
        "Return your orders as JSON now."
    )

    try:
        data = client.complete(
            system=system_prompt, user=user_prompt, schema=ORDER_PACKET_SCHEMA
        )
    except LLMError as e:
        if diagnostics is not None:
            diagnostics.append(f"LLM call failed: {e}")
        return []

    raw_orders = data.get("orders", [])
    if not isinstance(raw_orders, list):
        if diagnostics is not None:
            diagnostics.append(f"orders not a list: {type(raw_orders).__name__}")
        return []

    return _coerce_orders(raw_orders, view)
