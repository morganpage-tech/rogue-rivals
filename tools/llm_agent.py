"""
Shared LLM decision loop for *_llm agents registered in tools/sim.py.
"""

from __future__ import annotations

import json
import os
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from tools.llm_client import LLMClient, LLMError, _validate_schema
from tools.llm_personas import COMPACT_RULES_SUMMARY, PERSONA_BY_ID
from tools.sim import RES_KEYS, GameEngine, TRIBE_HOME

RESOURCE_SET = set(RES_KEYS)

# jsonschema for model output (trades optional; action required)
LLM_RESPONSE_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["reasoning", "action"],
    "properties": {
        "reasoning": {"type": "string"},
        "trades": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["kind"],
                "properties": {
                    "kind": {
                        "type": "string",
                        "enum": ["propose", "accept", "reject"],
                    },
                    "to": {"type": "string"},
                    "offered": {"type": "object"},
                    "requested": {"type": "object"},
                    "offer_id": {"type": "string"},
                    "tribute_route_payment": {"type": "boolean"},
                },
                "additionalProperties": True,
            },
        },
        "action": {
            "type": "object",
            "required": ["kind"],
            "properties": {
                "kind": {
                    "type": "string",
                    "enum": ["gather", "scout", "ambush", "build", "pass"],
                },
                "region": {"type": "string"},
                "building": {"type": "string"},
            },
            "additionalProperties": True,
        },
    },
    "additionalProperties": True,
}

_trace_emitter: Optional[Callable[[Dict[str, Any]], None]] = None
_match_ctx: Dict[str, Any] = {}

_MOCK_CTX: Dict[str, Any] = {}


def set_trace_emitter(fn: Optional[Callable[[Dict[str, Any]], None]]) -> None:
    global _trace_emitter
    _trace_emitter = fn


def begin_match_trace(batch_id: str, match_id: str, seed: int) -> None:
    _match_ctx.clear()
    _match_ctx.update({"batch_id": batch_id, "match_id": match_id, "seed": seed})


def end_match_trace() -> None:
    _match_ctx.clear()


class MockLLMClient:
    """Deterministic legal move when no API keys are configured."""

    def __init__(self, temperature: float = 0.0):
        self.temperature = temperature
        self.provider = "mock"
        self.model = "mock"
        self.max_input_tokens = 2000
        self.max_output_tokens = 500

    def complete(
        self,
        system: str,
        user: str,
        schema: Optional[dict] = None,
    ) -> Dict[str, Any]:
        eng: GameEngine = _MOCK_CTX["engine"]
        pid: str = _MOCK_CTX["pid"]
        act = _prefer_build_then_first(eng, pid)
        out = {
            "reasoning": "MockLLMClient: build→Ruins bootstrap→home gather stub (no API key).",
            "trades": [],
            "action": act,
            "_usage": {
                "input_tokens": max(1, len(system + user) // 4),
                "output_tokens": 24,
                "latency_ms": 0,
                "model": "mock",
                "provider": "mock",
            },
        }
        _validate_schema(out, schema)
        return out


def _has_api_key() -> bool:
    return (
        bool(os.environ.get("ANTHROPIC_API_KEY", "").strip())
        or bool(os.environ.get("OPENAI_API_KEY", "").strip())
        or bool(os.environ.get("ZAI_API_KEY", "").strip())
        or bool(os.environ.get("ZAI_KEY", "").strip())
    )


def _get_client(persona: Dict[str, Any]) -> Any:
    if not _has_api_key():
        return MockLLMClient(temperature=float(persona.get("temperature") or 0.0))
    model = (persona.get("model") or "").strip()
    return LLMClient(
        model=model,
        temperature=float(persona.get("temperature") or 0.0),
    )


def _clean_res_map(d: Any) -> Dict[str, int]:
    if not isinstance(d, dict):
        return {}
    out: Dict[str, int] = {}
    for k, v in d.items():
        if k in RESOURCE_SET and isinstance(v, int) and v > 0:
            out[k] = v
    return out


def _norm_action(act: Dict[str, Any]) -> Dict[str, Any]:
    k = act.get("kind") or "pass"
    if k == "gather":
        return {"kind": "gather", "region": act.get("region")}
    if k == "scout":
        return {"kind": "scout", "region": act.get("region")}
    if k == "ambush":
        return {"kind": "ambush", "region": act.get("region")}
    if k == "build":
        return {"kind": "build", "building": act.get("building")}
    return {"kind": "pass"}


def _action_is_legal(engine: GameEngine, pid: str, act: Dict[str, Any]) -> bool:
    na = _norm_action(act)
    legal = engine.legal_actions(pid)
    for L in legal:
        if _norm_action(L) == na:
            return True
    return False


def _prefer_build_then_first(engine: GameEngine, pid: str) -> Dict[str, Any]:
    """Deterministic stand-in: build when possible; else bootstrap Scrap; else gather home; else first legal."""
    acts = engine.legal_actions(pid)
    if not acts:
        return {"kind": "pass"}
    for a in acts:
        if a.get("kind") == "build":
            return a
    ps = engine.players[pid]
    if ps.resources.get("S", 0) < 1 and engine.scrap_pool > 0:
        for a in acts:
            if a.get("kind") == "gather" and a.get("region") == "ruins":
                return a
    home = engine.home_region(pid)
    for a in acts:
        if a.get("kind") == "gather" and a.get("region") == home:
            return a
    return acts[0]


def _fallback_action(engine: GameEngine, pid: str) -> Dict[str, Any]:
    return _prefer_build_then_first(engine, pid)


def _public_opponent_snapshot(engine: GameEngine, viewer: str) -> Dict[str, Any]:
    """Aggregate public-ish stats for prompt (per spec: rank, total resources, beads, buildings count, partners)."""
    st = engine.standings()
    out = {}
    for pid in engine.player_ids:
        if pid == viewer:
            continue
        ps = engine.players[pid]
        tot_res = sum(ps.resources.get(k, 0) for k in RES_KEYS)
        out[pid] = {
            "vp_rank": st[pid]["rank"],
            "resource_cards_total": tot_res,
            "beads": ps.beads,
            "building_count": len(ps.buildings),
            "trade_partners_so_far": len(ps.partners_traded),
            "trailing_bonus_active": ps.trailing_bonus_active,
        }
    return out


def _pending_with_context(engine: GameEngine, pid: str, recent_digest: List[str]) -> str:
    inc = engine.incoming_offers(pid)
    lines = []
    for o in inc:
        lines.append(
            json.dumps(
                {
                    "offer_id": o["offer_id"],
                    "from": o["from"],
                    "offered": o["offered"],
                    "requested": o["requested"],
                    "tribute_route_payment": o.get("tribute_route_payment"),
                },
                separators=(",", ":"),
            )
        )
    ctx = "\n".join(recent_digest[-8:]) if recent_digest else "(no recent digest lines)"
    return "INCOMING OFFERS:\n" + ("\n".join(lines) if lines else "(none)") + "\n\nLAST TURNS DIGEST (up to ~2 rounds):\n" + ctx


def build_user_prompt(
    persona_id: str,
    engine: GameEngine,
    pid: str,
    view: Dict[str, Any],
    agent_params: Dict[str, Any],
) -> str:
    ps = engine.players[pid]
    tribe = ps.tribe
    home_region, home_res = TRIBE_HOME[tribe]
    standings = engine.standings()

    ally_note = ""
    if persona_id == "alliance_duopoly_llm":
        partner = agent_params.get("partner_id")
        if partner:
            ally_note = (
                f"\nALLIANCE LOCK-IN: Your designated ally this match is **{partner}**. "
                f"Prefer trades with them and coordinate economically when possible.\n"
            )

    priv = view.get("your_state") or engine.snapshot_private(pid)
    digest = view.get("recent_turn_digest") or []

    legal = engine.legal_actions(pid)
    legal_txt = json.dumps(legal, separators=(",", ":"))

    sections = [
        f"You are **{pid}**, tribe **{tribe}** (home region `{home_region}`, home resource `{home_res}`).",
        ally_note,
        f"ROUND **{engine.round_num}** of **15** max (match ends earlier if VP threshold or Great Hall line triggers).",
        f"YOUR PRIVATE STATE:\n{json.dumps(priv, separators=(',', ':'))}",
        f"YOUR VP RANK (ordinal): {standings[pid]['rank']}",
        f"PUBLIC OPPONENT SUMMARY:\n{json.dumps(_public_opponent_snapshot(engine, pid), indent=2)}",
        _pending_with_context(engine, pid, digest),
        f"LEGAL ACTIONS (pick exactly one shape that appears here):\n{legal_txt}",
        (
            "Respond with JSON only (no markdown) matching schema fields: "
            '`reasoning` (string), `trades` (array), `action` (object). '
            "Trade kinds: propose {kind,to,offered,requested,?tribute_route_payment}, "
            "accept {kind,offer_id}, reject {kind,offer_id}. "
            "Execute trades in your listed order; engine applies rejects/accepts/proposals in fixed order afterward. "
            "Action must be ONE legal action from LEGAL ACTIONS."
        ),
    ]
    return "\n\n".join(s for s in sections if s)


def build_system_prompt(persona_id: str) -> str:
    p = PERSONA_BY_ID[persona_id]
    return (
        f"{p['system_prompt']}\n\n---\nRULES SUMMARY FOR THIS MATCH:\n{COMPACT_RULES_SUMMARY}\n\n"
        "OUTPUT CONTRACT: Respond with a single JSON object only (no markdown fences)."
    )


def _llm_trades_to_engine(
    engine: GameEngine,
    pid: str,
    trades: Any,
    incoming_ids: Set[str],
) -> Tuple[List[str], List[str], Dict[str, str], List[Dict[str, Any]]]:
    accept: List[str] = []
    reject: List[str] = []
    reject_reasons: Dict[str, str] = {}
    proposals: List[Dict[str, Any]] = []

    if not isinstance(trades, list):
        return accept, reject, reject_reasons, proposals

    for t in trades:
        if not isinstance(t, dict):
            continue
        kind = t.get("kind")
        if kind == "reject":
            oid = t.get("offer_id")
            if isinstance(oid, str) and oid in incoming_ids:
                reject.append(oid)
        elif kind == "accept":
            oid = t.get("offer_id")
            if isinstance(oid, str) and oid in incoming_ids:
                accept.append(oid)
        elif kind == "propose":
            to = t.get("to")
            if not isinstance(to, str) or to not in engine.player_ids or to == pid:
                continue
            off = _clean_res_map(t.get("offered"))
            req = _clean_res_map(t.get("requested"))
            if not off or not req:
                continue
            prop: Dict[str, Any] = {"to": to, "offered": off, "requested": req}
            if t.get("tribute_route_payment"):
                prop["tribute_route_payment"] = True
            proposals.append(prop)
    accept = sorted(set(accept))
    reject = sorted(set(reject))
    return accept, reject, reject_reasons, proposals


def _emit_llm_trace(row: Dict[str, Any]) -> None:
    if _trace_emitter:
        merged = {**_match_ctx, **row}
        _trace_emitter(merged)


def llm_agent_decide(persona_id: str, view: Dict[str, Any], rng: Any) -> Dict[str, Any]:
    """Entry point used by registered *_llm agents."""
    engine: GameEngine = view["_engine"]
    pid = view["acting_player"]
    ps = engine.players[pid]
    persona = PERSONA_BY_ID[persona_id]

    client = _get_client(persona)
    system = build_system_prompt(persona_id)
    user = build_user_prompt(persona_id, engine, pid, view, ps.agent_params or {})

    incoming = engine.incoming_offers(pid)
    incoming_ids = {o["offer_id"] for o in incoming}

    _MOCK_CTX["engine"] = engine
    _MOCK_CTX["pid"] = pid

    last_err = ""
    parsed: Optional[Dict[str, Any]] = None
    usage: Dict[str, Any] = {}

    attempt_user = user
    for attempt_idx in range(2):
        try:
            parsed = client.complete(system, attempt_user, LLM_RESPONSE_SCHEMA)
            usage = dict(parsed.pop("_usage", {}))
            act = parsed.get("action") or {}
            trades = parsed.get("trades")

            acc, rej, rej_r, props = _llm_trades_to_engine(engine, pid, trades, incoming_ids)
            if not _action_is_legal(engine, pid, act):
                raise LLMError(f"Illegal action for rules/state: {act!r}")

            rationale = str(parsed.get("reasoning") or "").strip()[:500]
            retries_before_ok = attempt_idx
            _emit_llm_trace(
                {
                    "type": "llm_turn",
                    "persona": persona_id,
                    "player_id": pid,
                    "round": engine.round_num,
                    "system_prompt": system,
                    "user_prompt": attempt_user,
                    "response_json": parsed,
                    "retry_count": retries_before_ok,
                    "retry_reason": None,
                    "fallback": False,
                    "reasoning_echo": rationale,
                    "input_tokens": usage.get("input_tokens", 0),
                    "output_tokens": usage.get("output_tokens", 0),
                    "latency_ms": usage.get("latency_ms", 0),
                    "model": usage.get("model", getattr(client, "model", "")),
                    "provider": usage.get("provider", getattr(client, "provider", "")),
                }
            )
            return {
                "trade_accept": acc,
                "trade_reject": rej,
                "trade_reject_reasons": rej_r,
                "trade_counter": [],
                "proposals": props,
                "action": _norm_action(act),
                "rationale": rationale,
                "_llm_meta": {
                    "retry_count": retries_before_ok,
                    "fallback": False,
                    "usage": usage,
                    "raw_response": parsed,
                },
            }
        except LLMError as e:
            last_err = str(e)
            attempt_user = user + f"\n\nPREVIOUS ERROR (fix your JSON/action): {last_err}\n"
            continue

    # Fallback
    fb = _fallback_action(engine, pid)
    rationale = f"Fallback after LLM failure: {last_err}"
    row = {
        "type": "llm_turn",
        "persona": persona_id,
        "player_id": pid,
        "round": engine.round_num,
        "system_prompt": system,
        "user_prompt": user,
        "response_json": None,
        "retry_count": 2,
        "retry_reason": last_err,
        "fallback": True,
        "reasoning_echo": rationale,
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
        "latency_ms": usage.get("latency_ms", 0),
        "model": getattr(client, "model", "unknown"),
        "provider": getattr(client, "provider", "unknown"),
    }
    _emit_llm_trace(row)

    return {
        "trade_accept": [],
        "trade_reject": [],
        "trade_reject_reasons": {},
        "trade_counter": [],
        "proposals": [],
        "action": fb,
        "rationale": rationale[:500],
        "_llm_meta": {
            "retry_count": 2,
            "fallback": True,
            "usage": usage,
            "raw_response": None,
        },
    }
