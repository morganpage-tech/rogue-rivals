"""Convert browser / @rr/engine2 ProjectedView JSON to Python fog shape.

``packages/web`` JSON.stringifies ``projectForPlayer`` output: camelCase keys and
nested ``location`` objects on forces/scouts. ``tools/v2/llm_agent._compact_view``
expects the same layout as ``tools/v2/fog.project_for_player`` (snake_case, flat
``location_*`` fields). This module bridges the two for ``llm_http_server``."""

from __future__ import annotations

import json
import re
from typing import Any, Dict


def _camel_to_snake(name: str) -> str:
    s1 = re.sub("(.)([A-Z][a-z]+)", r"\1_\2", name)
    return re.sub("([a-z0-9])([A-Z])", r"\1_\2", s1).lower()


def _keys_to_snake(obj: Any) -> Any:
    if isinstance(obj, list):
        return [_keys_to_snake(x) for x in obj]
    if isinstance(obj, dict):
        out: Dict[str, Any] = {}
        for k, v in obj.items():
            nk = _camel_to_snake(str(k)) if isinstance(k, str) else k
            out[nk] = _keys_to_snake(v)
        return out
    return obj


def _flatten_force(f: Dict[str, Any]) -> Dict[str, Any]:
    if "location_kind" in f:
        return f
    loc = f.get("location")
    if not isinstance(loc, dict):
        return f
    kind = loc.get("kind")
    base = {k: v for k, v in f.items() if k != "location"}
    if kind == "garrison":
        base["location_kind"] = "garrison"
        base["location_region_id"] = loc.get("region_id")
        base["location_transit"] = None
        return base
    if kind == "transit":
        base["location_kind"] = "transit"
        base["location_region_id"] = None
        base["location_transit"] = {
            "trail_index": loc["trail_index"],
            "direction_from": loc["direction_from"],
            "direction_to": loc["direction_to"],
            "ticks_remaining": loc["ticks_remaining"],
        }
        return base
    return f


def _flatten_scout(s: Dict[str, Any]) -> Dict[str, Any]:
    if "location_kind" in s:
        return s
    loc = s.get("location")
    if not isinstance(loc, dict):
        return s
    kind = loc.get("kind")
    base = {k: v for k, v in s.items() if k != "location"}
    if kind == "transit":
        base["location_kind"] = "transit"
        base["location_region_id"] = None
        base["expires_tick"] = None
        base["transit"] = {
            "trail_index": loc["trail_index"],
            "direction_from": loc["direction_from"],
            "direction_to": loc["direction_to"],
            "ticks_remaining": loc["ticks_remaining"],
        }
        return base
    if kind == "arrived":
        base["location_kind"] = "arrived"
        base["location_region_id"] = loc.get("region_id")
        base["expires_tick"] = loc.get("expires_tick")
        base["transit"] = None
        return base
    return s


def _lift_message_from(d: Dict[str, Any]) -> None:
    if "from" in d and "from_tribe" not in d:
        d["from_tribe"] = d.pop("from")


def _lift_proposal_parties(p: Dict[str, Any]) -> None:
    if "from" in p and "from_tribe" not in p:
        p["from_tribe"] = p.pop("from")
    if "to" in p and "to_tribe" not in p:
        p["to_tribe"] = p.pop("to")


def _fix_inbox_lists(view: Dict[str, Any]) -> None:
    for key in ("inbox_new",):
        lst = view.get(key)
        if not isinstance(lst, list):
            continue
        for m in lst:
            if not isinstance(m, dict):
                continue
            _lift_message_from(m)
            prop = m.get("proposal")
            if isinstance(prop, dict):
                _lift_proposal_parties(prop)

    ps = view.get("my_player_state")
    if isinstance(ps, dict):
        inbox = ps.get("inbox")
        if isinstance(inbox, list):
            for m in inbox:
                if isinstance(m, dict):
                    _lift_message_from(m)
                    prop = m.get("proposal")
                    if isinstance(prop, dict):
                        _lift_proposal_parties(prop)
        outstanding = ps.get("outstanding_proposals")
        if isinstance(outstanding, list):
            for p in outstanding:
                if isinstance(p, dict):
                    _lift_proposal_parties(p)

    legal = view.get("legal_order_options")
    if isinstance(legal, list):
        for opt in legal:
            if not isinstance(opt, dict):
                continue
            payload = opt.get("payload")
            if isinstance(payload, dict):
                prop = payload.get("proposal")
                if isinstance(prop, dict):
                    _lift_proposal_parties(prop)


def normalize_projected_view_for_llm(view: Dict[str, Any]) -> Dict[str, Any]:
    """Return a copy safe for ``llm_agent._compact_view`` / ``decide_orders_packet_json``."""
    data: Dict[str, Any] = json.loads(json.dumps(view))
    data = _keys_to_snake(data)

    mf = data.get("my_forces")
    if isinstance(mf, list):
        data["my_forces"] = [_flatten_force(x) if isinstance(x, dict) else x for x in mf]

    ms = data.get("my_scouts")
    if isinstance(ms, list):
        data["my_scouts"] = [_flatten_scout(x) if isinstance(x, dict) else x for x in ms]

    _fix_inbox_lists(data)
    return data
