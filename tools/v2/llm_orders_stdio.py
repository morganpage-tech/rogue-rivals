"""LLM order generation for one tribe, driven from stdin (used by TS batch runner).

stdin (single JSON object)::

    {"projectedView": {<camelCase ProjectedView from @rr/engine2>}, "persona": "warlord"}

stdout (JSON)::

    {"orders": [{"kind": "move", "payload": {...}}, ...]}

Run from repo root::

    python -m tools.v2.llm_orders_stdio
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

_THIS_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _THIS_DIR.parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from tools.v2.llm_agent import decide_orders  # noqa: E402
from tools.v2.projected_view_bridge import normalize_projected_view_for_llm  # noqa: E402


def main() -> int:
    raw = sys.stdin.read()
    if not raw.strip():
        print(json.dumps({"error": "empty stdin"}))
        return 1
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"invalid JSON: {e}"}))
        return 1

    view = data.get("projectedView")
    if not isinstance(view, dict):
        print(json.dumps({"error": "projectedView must be an object"}))
        return 1

    persona = data.get("persona")
    if not isinstance(persona, str) or not persona.strip():
        print(json.dumps({"error": "persona must be a non-empty string"}))
        return 1

    view_n = normalize_projected_view_for_llm(view)
    orders = decide_orders(view_n, persona.strip())
    out = [{"kind": o.kind, "payload": dict(o.payload)} for o in orders]
    print(json.dumps({"orders": out}, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
