import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { stripJsonFence } from "./stripJsonFence.js";

export class LLMError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMError";
  }
}

const ZAI_BASE_URL = "https://api.z.ai/api/paas/v4/";
const ZAI_DEFAULT_MODEL = "glm-4.5-air";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

function groqKey(): string {
  return (process.env.GROQ_API_KEY ?? "").trim();
}
function openrouterKey(): string {
  return (process.env.OPENROUTER_API_KEY ?? "").trim();
}
function zaiKey(): string {
  return (process.env.ZAI_API_KEY ?? process.env.ZAI_KEY ?? "").trim();
}

export type LlmProvider = "anthropic" | "openai" | "zai" | "groq" | "openrouter";

/** Loose validation aligned with ORDER_PACKET_SCHEMA (tools/v2/llm_agent.py). */
function validateOrderPacketLoose(data: Record<string, unknown>, _schema: object): void {
  if (data.choose !== undefined) {
    if (!Array.isArray(data.choose)) throw new LLMError("Schema validation failed: choose must be an array");
    if (data.choose.length > 12) throw new LLMError("Schema validation failed: choose maxItems 12");
    for (const x of data.choose) {
      if (typeof x !== "string") throw new LLMError("Schema validation failed: choose items must be strings");
    }
  }
  if (data.messages !== undefined) {
    if (!Array.isArray(data.messages)) throw new LLMError("Schema validation failed: messages must be an array");
    if (data.messages.length > 8) throw new LLMError("Schema validation failed: messages maxItems 8");
    for (const m of data.messages) {
      if (m === null || typeof m !== "object") throw new LLMError("Schema validation failed: message entry invalid");
      const o = m as Record<string, unknown>;
      if (typeof o.to !== "string" || typeof o.text !== "string") {
        throw new LLMError("Schema validation failed: messages items need to, text");
      }
    }
  }
  if (data.orders !== undefined) {
    if (!Array.isArray(data.orders)) throw new LLMError("Schema validation failed: orders must be an array");
    if (data.orders.length > 12) throw new LLMError("Schema validation failed: orders maxItems 12");
  }
}

export function pickProviderModel(
  provider: string | undefined,
  model: string | undefined,
): { provider: LlmProvider; model: string; anthropicPreference: boolean } {
  const hasA = Boolean((process.env.ANTHROPIC_API_KEY ?? "").trim());
  const hasO = Boolean((process.env.OPENAI_API_KEY ?? "").trim());
  const hasZ = Boolean(zaiKey());
  const hasG = Boolean(groqKey());
  const hasOr = Boolean(openrouterKey());
  if (!hasA && !hasO && !hasZ && !hasG && !hasOr) {
    throw new LLMError(
      "No LLM API key configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, " +
        "ZAI_API_KEY (alias: ZAI_KEY), GROQ_API_KEY, or OPENROUTER_API_KEY.",
    );
  }

  const effective = (provider ?? process.env.LLM_PROVIDER ?? "").trim() || undefined;
  if (effective) {
    const p = effective.toLowerCase();
    if (p === "anthropic" && !hasA) throw new LLMError("ANTHROPIC_API_KEY is not set.");
    if (p === "openai" && !hasO) throw new LLMError("OPENAI_API_KEY is not set.");
    if (p === "zai" && !hasZ) throw new LLMError("ZAI_API_KEY / ZAI_KEY is not set.");
    if (p === "groq" && !hasG) throw new LLMError("GROQ_API_KEY is not set.");
    if (p === "openrouter" && !hasOr) throw new LLMError("OPENROUTER_API_KEY is not set.");
    if (!["anthropic", "openai", "zai", "groq", "openrouter"].includes(p)) {
      throw new LLMError(`Unknown provider: ${effective}`);
    }
    let m: string;
    if (p === "anthropic")
      m = model ?? process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-20241022";
    else if (p === "zai") m = model ?? process.env.ZAI_MODEL ?? ZAI_DEFAULT_MODEL;
    else if (p === "groq") m = model ?? process.env.GROQ_MODEL ?? GROQ_DEFAULT_MODEL;
    else if (p === "openrouter") m = model ?? process.env.OPENROUTER_MODEL ?? OPENROUTER_DEFAULT_MODEL;
    else m = model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    return { provider: p as LlmProvider, model: m, anthropicPreference: p === "anthropic" };
  }

  if (hasA) {
    return {
      provider: "anthropic",
      model: model ?? process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-20241022",
      anthropicPreference: true,
    };
  }
  if (hasZ) {
    return { provider: "zai", model: model ?? process.env.ZAI_MODEL ?? ZAI_DEFAULT_MODEL, anthropicPreference: false };
  }
  if (hasO) {
    return { provider: "openai", model: model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini", anthropicPreference: false };
  }
  if (hasOr) {
    return {
      provider: "openrouter",
      model: model ?? process.env.OPENROUTER_MODEL ?? OPENROUTER_DEFAULT_MODEL,
      anthropicPreference: false,
    };
  }
  return {
    provider: "groq",
    model: model ?? process.env.GROQ_MODEL ?? GROQ_DEFAULT_MODEL,
    anthropicPreference: false,
  };
}

/**
 * Throws {@link LLMError} if the current `process.env` cannot supply a provider
 * for {@link LLMClient} (no API keys, or {@link LLM_PROVIDER} points at a missing key).
 * Use before starting LLM-backed matches so misconfiguration fails immediately.
 */
export function assertLlmEnvironmentConfigured(): void {
  pickProviderModel(undefined, undefined);
}

export interface LlmUsageMeta {
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  model: string;
  provider: string;
}

export interface LlmCompleteResult {
  data: Record<string, unknown>;
  rawResponse: string;
  usage: LlmUsageMeta;
}

export class LLMClient {
  readonly provider: LlmProvider;
  readonly model: string;
  readonly temperature: number;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  private anthropic: Anthropic | null = null;
  private openai: OpenAI | null = null;

  constructor(opts?: {
    provider?: string;
    model?: string;
    temperature?: number;
    maxInputTokens?: number;
    maxOutputTokens?: number;
  }) {
    const picked = pickProviderModel(opts?.provider, opts?.model);
    this.provider = picked.provider;
    this.model = picked.model;
    this.temperature = opts?.temperature ?? 0;
    this.maxInputTokens = opts?.maxInputTokens ?? 4000;
    this.maxOutputTokens = opts?.maxOutputTokens ?? 700;

    if (this.provider === "anthropic") {
      this.anthropic = new Anthropic();
    } else if (this.provider === "zai") {
      const k = zaiKey();
      if (!k) throw new LLMError("ZAI_API_KEY / ZAI_KEY is not set.");
      this.openai = new OpenAI({ apiKey: k, baseURL: ZAI_BASE_URL });
    } else if (this.provider === "groq") {
      const gk = groqKey();
      if (!gk) throw new LLMError("GROQ_API_KEY is not set.");
      this.openai = new OpenAI({ apiKey: gk, baseURL: GROQ_BASE_URL });
    } else if (this.provider === "openrouter") {
      const rk = openrouterKey();
      if (!rk) throw new LLMError("OPENROUTER_API_KEY is not set.");
      const referer = (process.env.OPENROUTER_HTTP_REFERER ?? "https://localhost").trim();
      const title = (process.env.OPENROUTER_APP_TITLE ?? "Rogue Rivals").trim();
      this.openai = new OpenAI({
        apiKey: rk,
        baseURL: OPENROUTER_BASE_URL,
        defaultHeaders: { "HTTP-Referer": referer, "X-Title": title },
      });
    } else {
      this.openai = new OpenAI();
    }
  }

  private truncateText(text: string, budgetTokens: number): string {
    const maxChars = Math.max(256, budgetTokens * 4);
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars - 40)}\n...[truncated for token cap]`;
  }

  async complete(
    system: string,
    user: string,
    schema: object | undefined,
  ): Promise<LlmCompleteResult> {
    const sysB = this.truncateText(system, this.maxInputTokens >> 1);
    const usrBudget = Math.max(256, this.maxInputTokens - Math.floor(sysB.length / 4));
    const usrB = this.truncateText(user, usrBudget);

    const t0 = performance.now();
    let rawText = "";
    let inTok = 0;
    let outTok = 0;

    try {
      if (this.provider === "anthropic" && this.anthropic) {
        const msg = await this.anthropic.messages.create({
          model: this.model,
          max_tokens: this.maxOutputTokens,
          temperature: this.temperature,
          system: sysB,
          messages: [{ role: "user", content: usrB }],
        });
        rawText = msg.content
          .filter((b) => b.type === "text")
          .map((b) => ("text" in b ? b.text : ""))
          .join("");
        inTok = msg.usage?.input_tokens ?? 0;
        outTok = msg.usage?.output_tokens ?? 0;
      } else if (this.openai) {
        const kwargs: OpenAI.Chat.ChatCompletionCreateParams = {
          model: this.model,
          temperature: this.temperature,
          max_tokens: this.maxOutputTokens,
          messages: [
            { role: "system", content: sysB },
            { role: "user", content: usrB },
          ],
        };
        if (this.provider === "openai" || this.provider === "groq") {
          kwargs.response_format = { type: "json_object" };
        } else if (this.provider === "openrouter") {
          const om = (process.env.OPENROUTER_JSON_MODE ?? "true").trim().toLowerCase();
          if (!["0", "false", "no", "off"].includes(om)) {
            kwargs.response_format = { type: "json_object" };
          }
        } else if (this.provider === "zai") {
          const zaiThinking = (process.env.ZAI_THINKING ?? "disabled").trim().toLowerCase();
          if (zaiThinking === "enabled" || zaiThinking === "disabled") {
            (kwargs as unknown as { extra_body?: object }).extra_body = {
              thinking: { type: zaiThinking },
            };
          }
        }
        const comp = await this.openai.chat.completions.create(kwargs);
        rawText = comp.choices[0]?.message?.content ?? "";
        if (comp.usage) {
          inTok = comp.usage.prompt_tokens ?? 0;
          outTok = comp.usage.completion_tokens ?? 0;
        }
      } else {
        throw new LLMError("LLM client not initialized");
      }
    } catch (e) {
      if (e instanceof LLMError) throw e;
      throw new LLMError(e instanceof Error ? e.message : String(e));
    }

    const latencyMs = Math.round(performance.now() - t0);

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(stripJsonFence(rawText)) as Record<string, unknown>;
    } catch (e) {
      throw new LLMError(`Invalid JSON from model: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (schema) {
      validateOrderPacketLoose(data, schema);
    }

    const usage = {
      input_tokens: inTok,
      output_tokens: outTok,
      latency_ms: latencyMs,
      model: this.model,
      provider: this.provider,
    } satisfies LlmUsageMeta;

    data._usage = usage;
    return { data, rawResponse: rawText, usage };
  }
}
