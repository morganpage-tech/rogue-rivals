import type { ProjectedView, Tribe } from "@rr/engine2";

export interface LlmSlotResponse {
  choose?: string[];
  messages?: { to: string; text: string }[];
}

export interface LlmSlotRequestBody {
  tribe: Tribe;
  tick: number;
  projectedView: ProjectedView;
  persona?: string;
}

/**
 * POST JSON to a user-run proxy that wraps their LLM (same idea as `tools/v2/llm_agent.py`).
 * Expected JSON: `{ "choose": ["move:..."], "messages": [{ "to": "grey", "text": "..." }] }`.
 * Local dev: `python -m tools.v2.llm_http_server` → `http://127.0.0.1:8787/v2/llm` (CORS-enabled).
 */
export async function fetchLlmSlotOrders(
  url: string,
  body: LlmSlotRequestBody,
  options?: { bearerToken?: string; timeoutMs?: number },
): Promise<LlmSlotResponse> {
  const timeoutMs = options?.timeoutMs ?? 90_000;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options?.bearerToken) {
    headers["Authorization"] = `Bearer ${options.bearerToken}`;
  }
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        tribe: body.tribe,
        tick: body.tick,
        projectedView: body.projectedView,
        persona: body.persona,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`LLM HTTP ${res.status}: ${await res.text().catch(() => "")}`);
    }
    return (await res.json()) as LlmSlotResponse;
  } finally {
    window.clearTimeout(timer);
  }
}
