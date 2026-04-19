"""Local CORS proxy for the v2 web UI's HTTP LLM opponent mode.

The browser POSTs JSON (see ``packages/web/src/v2/llm/fetchLlmSlot.ts``)::

    {"tribe": "...", "tick": N, "projectedView": {...}, "persona": "opportunist"}

This server forwards ``projectedView`` to the same LLM path as
``tools/v2/llm_agent.py`` and returns ``{"choose": [...], "messages": [...]}``.

Run (from repo root)::

    python -m tools.v2.llm_http_server

Defaults: listen on 127.0.0.1:8787, POST path ``/v2/llm``.

Environment:

- ``PORT`` — bind port (default 8787)
- ``V2_LLM_BIND`` — host to bind (default 127.0.0.1)
- ``V2_LLM_PERSONA`` — default persona id when the request omits ``persona``
  (default ``opportunist``)
- ``V2_LLM_TOKEN`` — if set, require ``Authorization: Bearer <token>`` on POST

Requires a configured LLM API key (see ``tools/llm_client.py``).
"""

from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, Optional

_THIS_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _THIS_DIR.parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from tools.v2.llm_agent import decide_orders_packet_json  # noqa: E402
from tools.v2.projected_view_bridge import normalize_projected_view_for_llm  # noqa: E402


def _cors_headers(handler: BaseHTTPRequestHandler) -> None:
    origin = handler.headers.get("Origin")
    allow = origin if origin else "*"
    handler.send_header("Access-Control-Allow-Origin", allow)
    handler.send_header("Vary", "Origin")
    handler.send_header(
        "Access-Control-Allow-Methods", "GET, POST, OPTIONS"
    )
    handler.send_header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
    )


def _request_path(handler: BaseHTTPRequestHandler) -> str:
    """Path without query string, normalized (no trailing slash except root)."""
    raw = handler.path.split("?", 1)[0]
    if raw != "/" and raw.endswith("/"):
        raw = raw.rstrip("/")
    return raw or "/"


class Handler(BaseHTTPRequestHandler):
    server_version = "RogueRivalsLLM/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("%s - - [%s] %s\n" % (self.client_address[0], self.log_date_time_string(), fmt % args))

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        _cors_headers(self)
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = _request_path(self)
        if path in ("/", "/health"):
            body = json.dumps({"ok": True, "service": "rogue-rivals-v2-llm"}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            _cors_headers(self)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/v2/llm":
            # Browsers issue GET; the game client POSTs JSON here.
            doc = {
                "ok": True,
                "service": "rogue-rivals-v2-llm",
                "method": "POST",
                "content_type": "application/json",
                "body_fields": {
                    "projectedView": "required — object from the engine",
                    "tribe": "optional string",
                    "tick": "optional number",
                    "persona": "optional persona id (default from V2_LLM_PERSONA)",
                },
                "health": "GET /health",
            }
            body = json.dumps(doc, indent=2).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            _cors_headers(self)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_error(404, "Not Found")

    def do_POST(self) -> None:  # noqa: N802
        if _request_path(self) != "/v2/llm":
            self.send_error(404, "Use POST /v2/llm")
            return

        expected = os.environ.get("V2_LLM_TOKEN", "").strip()
        if expected:
            auth = self.headers.get("Authorization", "")
            if auth != f"Bearer {expected}":
                self.send_response(401)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                _cors_headers(self)
                err = json.dumps({"error": "unauthorized"}).encode("utf-8")
                self.send_header("Content-Length", str(len(err)))
                self.end_headers()
                self.wfile.write(err)
                return

        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self.send_response(400)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            _cors_headers(self)
            err = json.dumps({"error": "invalid JSON"}).encode("utf-8")
            self.send_header("Content-Length", str(len(err)))
            self.end_headers()
            self.wfile.write(err)
            return

        view = payload.get("projectedView")
        if not isinstance(view, dict):
            self.send_response(400)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            _cors_headers(self)
            err = json.dumps({"error": "projectedView must be an object"}).encode("utf-8")
            self.send_header("Content-Length", str(len(err)))
            self.end_headers()
            self.wfile.write(err)
            return

        default_persona = os.environ.get("V2_LLM_PERSONA", "opportunist").strip() or "opportunist"
        persona = payload.get("persona")
        if isinstance(persona, str) and persona.strip():
            persona_id = persona.strip()
        else:
            persona_id = default_persona

        view_for_llm = normalize_projected_view_for_llm(view)
        body = json.dumps(
            decide_orders_packet_json(view_for_llm, persona_id),
            separators=(",", ":"),
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        _cors_headers(self)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    host = os.environ.get("V2_LLM_BIND", "127.0.0.1").strip() or "127.0.0.1"
    port = int(os.environ.get("PORT", "8787"))
    httpd = ThreadingHTTPServer((host, port), Handler)
    print(
        f"v2 LLM CORS server on http://{host}:{port}/v2/llm "
        f"(GET /health — persona default {os.environ.get('V2_LLM_PERSONA', 'opportunist')!r})",
        file=sys.stderr,
    )
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.", file=sys.stderr)


if __name__ == "__main__":
    main()
