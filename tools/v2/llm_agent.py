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
    "additionalProperties": True,
    "properties": {
        "choose": {
            "type": "array",
            "maxItems": 12,
            "items": {"type": "string"},
        },
        "messages": {
            "type": "array",
            "maxItems": 8,
            "items": {
                "type": "object",
                "required": ["to", "text"],
                "additionalProperties": True,
                "properties": {
                    "to": {"type": "string"},
                    "text": {"type": "string"},
                },
            },
        },
        # Legacy fallback only; do not validate items strictly — some models (e.g.
        # OpenRouter) put option-id strings here or emit partial objects.
        "orders": {"type": "array", "maxItems": 12},
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

    legal_options = view.get("legal_order_options", []) or []
    if legal_options:
        lines.append("")
        lines.append("Legal order options (choose by id):")
        for opt in legal_options:
            lines.append(f"  {opt['id']}: {opt['summary']}")

    return "\n".join(lines)


def _mistaken_message_from_choose_id(raw_id: str, view: Dict[str, Any]) -> Optional[Order]:
    """Models sometimes put a message line in `choose` as message:to:text."""
    if not raw_id.startswith("message:"):
        return None
    rest = raw_id[len("message:") :]
    colon = rest.find(":")
    if colon < 1:
        return None
    to = rest[:colon]
    text = rest[colon + 1 :]
    if to not in (view.get("tribes_alive") or []) or to == view.get("for_tribe"):
        return None
    if not text.strip():
        return None
    return Order(kind="message", payload={"to": to, "text": text[:400]})


def _option_id_lookup_keys(raw_id: str) -> List[str]:
    """Return candidate ids to try, exact first, then common LLM corruptions.

    Legal NAP ids look like `propose:nap:orange` but models often append the
    pact length (`...:8`). Shared vision is similar. Trade offers keep
    `propose:trade_offer:tribe:5` — the trailing :5 is part of the real id.
    """
    s = raw_id.strip()
    if not s:
        return []
    keys = [s]
    parts = s.split(":")
    if len(parts) >= 4 and parts[-1].isdigit():
        if parts[0] == "propose" and parts[1] == "nap":
            keys.append(":".join(parts[:-1]))
        elif parts[0] == "propose" and parts[1] == "shared_vision":
            keys.append(":".join(parts[:-1]))
    # Trade offers are `propose:trade_offer:<tribe>:5`; models sometimes drop `:5`.
    if (
        s.startswith("propose:trade_offer:")
        and s.count(":") == 2
    ):
        keys.append(f"{s}:5")
    return keys


def _orders_from_option_ids(
    chosen_ids: List[Any],
    view: Dict[str, Any],
    diagnostics: Optional[List[str]] = None,
) -> List[Order]:
    option_map = {
        opt["id"]: opt for opt in (view.get("legal_order_options", []) or []) if "id" in opt
    }
    orders: List[Order] = []
    seen_raw: set[str] = set()
    seen_legal_id: set[str] = set()

    for raw_id in chosen_ids:
        if not isinstance(raw_id, str):
            continue
        if raw_id in seen_raw:
            continue
        seen_raw.add(raw_id)

        msg = _mistaken_message_from_choose_id(raw_id, view)
        if msg is not None:
            orders.append(msg)
            continue

        opt = None
        for key in _option_id_lookup_keys(raw_id):
            opt = option_map.get(key)
            if opt is not None:
                break
        if opt is None:
            # Invalid or stale id: drop silently (do not inflate batch llm_errors).
            continue
        cid = opt.get("id")
        if not isinstance(cid, str) or cid in seen_legal_id:
            continue
        seen_legal_id.add(cid)
        kind = opt.get("kind")
        payload = opt.get("payload")
        if not isinstance(kind, str) or not isinstance(payload, dict):
            continue
        orders.append(Order(kind=kind, payload=payload))

    return orders


def _coerce_messages(raw_messages: List[Any], view: Dict[str, Any]) -> List[Order]:
    my_tribe = view["for_tribe"]
    tribes_alive = set(view.get("tribes_alive", []))
    orders: List[Order] = []
    for entry in raw_messages:
        if not isinstance(entry, dict):
            continue
        to = entry.get("to")
        text = entry.get("text", "")
        if to not in tribes_alive or to == my_tribe:
            continue
        if not isinstance(text, str) or not text.strip():
            continue
        orders.append(Order(kind="message", payload={"to": to, "text": text[:400]}))
    return orders


def _coerce_orders(
    raw: List[Dict[str, Any]], view: Dict[str, Any]
) -> List[Order]:
    """Validate + coerce LLM-returned orders into engine Order objects.

    Invalid orders are skipped silently (logged in diagnostics). Unknown
    fields are stripped; missing required fields cause the order to be dropped.
    """
    orders: List[Order] = []
    my_force_ids = {f["id"] for f in view.get("my_forces", [])}
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


def _call_llm_order_packet(
    view: Dict[str, Any],
    persona_id: str,
    client: Optional[LLMClient] = None,
    diagnostics: Optional[List[str]] = None,
) -> Optional[Dict[str, Any]]:
    """Run the same LLM call as :func:`decide_orders`; return parsed JSON or None."""
    persona = PERSONA_BY_ID.get(persona_id)
    if persona is None:
        if diagnostics is not None:
            diagnostics.append(f"unknown persona_id {persona_id!r}")
        return None

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
            return None

    system_prompt = (
        f"{persona['system_prompt']}\n\n{COMPACT_RULES_V2}\n\n"
        "Respond with a SINGLE JSON object. Prefer choosing from the LEGAL order options by id: "
        "{\"choose\": [\"option-id-1\", \"option-id-2\"]}. "
        "Copy option ids exactly from the list (full strings including colons). "
        "Do not append tick counts or other numbers to an id unless that exact string appears in the list. "
        "Put all conversational diplomacy in \"messages\", never inside \"choose\". "
        "You may also include "
        "{\"messages\": [{\"to\": \"tribe\", \"text\": \"...\"}]}. "
        "If you cannot find a good action, return {\"choose\": []}. "
        "Keep messages under 200 characters."
    )

    user_prompt = (
        "CURRENT VIEW:\n"
        f"{_compact_view(view)}\n\n"
        "Return JSON: choose[] uses only ids from Legal order options above; messages[] for any prose."
    )

    try:
        return client.complete(
            system=system_prompt, user=user_prompt, schema=ORDER_PACKET_SCHEMA
        )
    except LLMError as e:
        if diagnostics is not None:
            diagnostics.append(f"LLM call failed: {e}")
        return None


def decide_orders_packet_json(
    view: Dict[str, Any],
    persona_id: str,
    client: Optional[LLMClient] = None,
    diagnostics: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """JSON-safe ``{choose, messages}`` for browsers and CORS proxies.

    Uses the same prompt and model path as :func:`decide_orders`. The web client
    applies :func:`ordersFromChooseIds`-style logic again on its side.
    """
    data = _call_llm_order_packet(view, persona_id, client, diagnostics)
    if data is None:
        return {"choose": [], "messages": []}

    choose: List[str] = []
    raw_choose = data.get("choose", [])
    if isinstance(raw_choose, list):
        for x in raw_choose:
            if isinstance(x, str) and x.strip():
                choose.append(x)

    messages: List[Dict[str, str]] = []
    raw_messages = data.get("messages", [])
    if isinstance(raw_messages, list):
        for m in raw_messages:
            if not isinstance(m, dict):
                continue
            to = m.get("to")
            text = m.get("text", "")
            if isinstance(to, str) and isinstance(text, str) and text.strip():
                messages.append({"to": to, "text": text[:400]})

    return {"choose": choose, "messages": messages}


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
    data = _call_llm_order_packet(view, persona_id, client, diagnostics)
    if data is None:
        return []

    orders: List[Order] = []

    chosen = data.get("choose", [])
    if isinstance(chosen, list):
        orders.extend(_orders_from_option_ids(chosen, view, diagnostics=diagnostics))

    raw_messages = data.get("messages", [])
    if isinstance(raw_messages, list):
        orders.extend(_coerce_messages(raw_messages, view))

    # Backward-compatible fallback for older prompts / models.
    if not orders and isinstance(data.get("orders"), list):
        orders.extend(_coerce_orders(data["orders"], view))

    return orders
