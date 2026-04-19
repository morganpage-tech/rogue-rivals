"""
LLM backends for Rogue Rivals LLM agents (Anthropic, OpenAI, Z.AI, Groq, OpenRouter).
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, Optional

try:
    import jsonschema
except ImportError:  # pragma: no cover
    jsonschema = None  # type: ignore


def _load_dotenv_if_present() -> None:
    """Load KEY=VALUE pairs from repo-root .env into os.environ if not already set.

    Lightweight replacement for python-dotenv; avoids adding a dep.
    Silent no-op if .env is missing or unreadable.
    """
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.is_file():
        return
    try:
        for raw in env_path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip("'").strip('"')
            if key and key not in os.environ:
                os.environ[key] = val
    except OSError:
        return


_load_dotenv_if_present()


class LLMError(Exception):
    """API failure or unrecoverable parse error."""


def _strip_json_fence(text: str) -> str:
    t = text.strip()
    m = re.match(r"^```(?:json)?\s*([\s\S]*?)```\s*$", t, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return t


def _validate_schema(data: Any, schema: Optional[dict]) -> None:
    if schema is None or jsonschema is None:
        return
    jsonschema.validate(instance=data, schema=schema)


ZAI_BASE_URL = "https://api.z.ai/api/paas/v4/"
ZAI_DEFAULT_MODEL = "glm-4.5-air"

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile"

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free"


def _groq_key() -> str:
    return os.environ.get("GROQ_API_KEY", "").strip()


def _openrouter_key() -> str:
    return os.environ.get("OPENROUTER_API_KEY", "").strip()


def _zai_key() -> str:
    """Z.AI key may be provided under either ZAI_API_KEY or ZAI_KEY."""
    return (
        os.environ.get("ZAI_API_KEY", "").strip()
        or os.environ.get("ZAI_KEY", "").strip()
    )


def _pick_provider_model(
    provider: Optional[str], model: Optional[str]
) -> tuple[str, str, bool]:
    """Returns (provider, model, used_anthropic_preference).

    Provider selection priority when no explicit `provider` arg is passed:
      1. `LLM_PROVIDER` env var (anthropic | openai | zai | groq | openrouter)
      2. First available key in this order: anthropic, zai, openai, openrouter, groq
    """
    has_a = bool(os.environ.get("ANTHROPIC_API_KEY", "").strip())
    has_o = bool(os.environ.get("OPENAI_API_KEY", "").strip())
    has_z = bool(_zai_key())
    has_g = bool(_groq_key())
    has_or = bool(_openrouter_key())
    if not (has_a or has_o or has_z or has_g or has_or):
        raise LLMError(
            "No LLM API key configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, "
            "ZAI_API_KEY (alias: ZAI_KEY), GROQ_API_KEY, or OPENROUTER_API_KEY."
        )

    effective = provider or os.environ.get("LLM_PROVIDER", "").strip() or None
    if effective:
        p = effective.lower()
        if p == "anthropic" and not has_a:
            raise LLMError("ANTHROPIC_API_KEY is not set.")
        if p == "openai" and not has_o:
            raise LLMError("OPENAI_API_KEY is not set.")
        if p == "zai" and not has_z:
            raise LLMError("ZAI_API_KEY / ZAI_KEY is not set.")
        if p == "groq" and not has_g:
            raise LLMError("GROQ_API_KEY is not set.")
        if p == "openrouter" and not has_or:
            raise LLMError("OPENROUTER_API_KEY is not set.")
        if p not in ("anthropic", "openai", "zai", "groq", "openrouter"):
            raise LLMError(f"Unknown provider: {effective}")
        if p == "anthropic":
            m = model or os.environ.get(
                "ANTHROPIC_MODEL", "claude-3-5-haiku-20241022"
            )
        elif p == "zai":
            m = model or os.environ.get("ZAI_MODEL", ZAI_DEFAULT_MODEL)
        elif p == "groq":
            m = model or os.environ.get("GROQ_MODEL", GROQ_DEFAULT_MODEL)
        elif p == "openrouter":
            m = model or os.environ.get("OPENROUTER_MODEL", OPENROUTER_DEFAULT_MODEL)
        else:
            m = model or os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
        return p, m, p == "anthropic"

    if has_a:
        return (
            "anthropic",
            model or os.environ.get("ANTHROPIC_MODEL", "claude-3-5-haiku-20241022"),
            True,
        )
    if has_z:
        return (
            "zai",
            model or os.environ.get("ZAI_MODEL", ZAI_DEFAULT_MODEL),
            False,
        )
    if has_o:
        return (
            "openai",
            model or os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
            False,
        )
    if has_or:
        return (
            "openrouter",
            model or os.environ.get("OPENROUTER_MODEL", OPENROUTER_DEFAULT_MODEL),
            False,
        )
    return (
        "groq",
        model or os.environ.get("GROQ_MODEL", GROQ_DEFAULT_MODEL),
        False,
    )


class LLMClient:
    """LLM client (Anthropic, OpenAI-compatible, Z.AI, Groq, OpenRouter); returns JSON dict."""

    def __init__(
        self,
        provider: str = "",
        model: str = "",
        temperature: float = 0.0,
        max_input_tokens: int = 2000,
        max_output_tokens: int = 500,
    ):
        self.provider, self.model, _ = _pick_provider_model(
            provider or None, model or None
        )
        self.temperature = temperature
        self.max_input_tokens = max_input_tokens
        self.max_output_tokens = max_output_tokens

        if self.provider == "anthropic":
            try:
                from anthropic import Anthropic  # type: ignore
            except ImportError as e:
                raise LLMError("Install anthropic package: pip install anthropic") from e
            self._anthropic = Anthropic()
            self._openai = None
        elif self.provider == "zai":
            try:
                from openai import OpenAI  # type: ignore
            except ImportError as e:
                raise LLMError("Install openai package: pip install openai") from e
            zai_key = _zai_key()
            if not zai_key:
                raise LLMError("ZAI_API_KEY / ZAI_KEY is not set.")
            self._openai = OpenAI(api_key=zai_key, base_url=ZAI_BASE_URL)
            self._anthropic = None
        elif self.provider == "groq":
            try:
                from openai import OpenAI  # type: ignore
            except ImportError as e:
                raise LLMError("Install openai package: pip install openai") from e
            gk = _groq_key()
            if not gk:
                raise LLMError("GROQ_API_KEY is not set.")
            self._openai = OpenAI(api_key=gk, base_url=GROQ_BASE_URL)
            self._anthropic = None
        elif self.provider == "openrouter":
            try:
                from openai import OpenAI  # type: ignore
            except ImportError as e:
                raise LLMError("Install openai package: pip install openai") from e
            rk = _openrouter_key()
            if not rk:
                raise LLMError("OPENROUTER_API_KEY is not set.")
            referer = os.environ.get(
                "OPENROUTER_HTTP_REFERER", "https://localhost"
            ).strip()
            title = os.environ.get("OPENROUTER_APP_TITLE", "Rogue Rivals").strip()
            self._openai = OpenAI(
                api_key=rk,
                base_url=OPENROUTER_BASE_URL,
                default_headers={
                    "HTTP-Referer": referer,
                    "X-Title": title,
                },
            )
            self._anthropic = None
        else:
            try:
                from openai import OpenAI  # type: ignore
            except ImportError as e:
                raise LLMError("Install openai package: pip install openai") from e
            self._openai = OpenAI()
            self._anthropic = None

    def _truncate_text(self, text: str, budget_tokens: int) -> str:
        # ~4 chars per token heuristic for Latin text
        max_chars = max(256, budget_tokens * 4)
        if len(text) <= max_chars:
            return text
        return text[: max_chars - 40] + "\n...[truncated for token cap]"

    def complete(
        self,
        system: str,
        user: str,
        schema: Optional[dict] = None,
    ) -> Dict[str, Any]:
        sys_b = self._truncate_text(system, self.max_input_tokens // 2)
        usr_budget = max(256, self.max_input_tokens - len(sys_b) // 4)
        usr_b = self._truncate_text(user, usr_budget)

        t0 = __import__("time").perf_counter()
        raw_text = ""
        in_tok = out_tok = 0

        try:
            if self.provider == "anthropic":
                msg = self._anthropic.messages.create(
                    model=self.model,
                    max_tokens=self.max_output_tokens,
                    temperature=self.temperature,
                    system=sys_b,
                    messages=[{"role": "user", "content": usr_b}],
                )
                raw_text = "".join(
                    b.text for b in msg.content if getattr(b, "type", "") == "text"
                )
                in_tok = getattr(msg.usage, "input_tokens", 0) or 0
                out_tok = getattr(msg.usage, "output_tokens", 0) or 0
            else:
                kwargs: Dict[str, Any] = dict(
                    model=self.model,
                    temperature=self.temperature,
                    max_tokens=self.max_output_tokens,
                    messages=[
                        {"role": "system", "content": sys_b},
                        {"role": "user", "content": usr_b},
                    ],
                )
                if self.provider in ("openai", "groq"):
                    kwargs["response_format"] = {"type": "json_object"}
                elif self.provider == "openrouter":
                    # Some OpenRouter models reject json_object; allow opt-out.
                    om = os.environ.get("OPENROUTER_JSON_MODE", "true").strip().lower()
                    if om not in ("0", "false", "no", "off"):
                        kwargs["response_format"] = {"type": "json_object"}
                elif self.provider == "zai":
                    # GLM-4.x reasoning models default to `thinking.enabled`,
                    # which consumes the output budget with hidden CoT. For
                    # low-latency action decisions we disable it unless the
                    # user explicitly opts back in via ZAI_THINKING=enabled.
                    zai_thinking = os.environ.get(
                        "ZAI_THINKING", "disabled"
                    ).strip().lower()
                    if zai_thinking in ("enabled", "disabled"):
                        kwargs["extra_body"] = {
                            "thinking": {"type": zai_thinking}
                        }
                comp = self._openai.chat.completions.create(**kwargs)
                raw_text = comp.choices[0].message.content or ""
                if comp.usage:
                    in_tok = comp.usage.prompt_tokens or 0
                    out_tok = comp.usage.completion_tokens or 0
        except Exception as e:
            raise LLMError(str(e)) from e

        latency_ms = int((__import__("time").perf_counter() - t0) * 1000)

        try:
            data = json.loads(_strip_json_fence(raw_text))
        except json.JSONDecodeError as e:
            raise LLMError(f"Invalid JSON from model: {e}") from e

        try:
            _validate_schema(data, schema)
        except Exception as e:
            raise LLMError(f"Schema validation failed: {e}") from e

        data["_usage"] = {
            "input_tokens": in_tok,
            "output_tokens": out_tok,
            "latency_ms": latency_ms,
            "model": self.model,
            "provider": self.provider,
        }
        return data


