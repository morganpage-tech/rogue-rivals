import { config as loadDotenv } from "dotenv";
import { COMPACT_RULES_V2 } from "./compactRules.js";
import { compactView } from "./compactView.js";
import { LLMClient, LLMError } from "./llmClient.js";
import type { LlmUsageMeta } from "./llmClient.js";
import { normalizeProjectedViewForLlm } from "./normalizeProjectedViewForLlm.js";
import { ORDER_PACKET_SCHEMA } from "./orderPacketSchema.js";
import { PERSONA_BY_ID } from "./personas.js";

loadDotenv();

export interface LlmPacketResult {
  readonly choose: string[];
  readonly messages: { to: string; text: string }[];
}

export interface LlmDecisionDebugData {
  readonly persona: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly rawResponse: string;
  readonly choose: string[];
  readonly messages: readonly { to: string; text: string }[];
  readonly usage: LlmUsageMeta;
  readonly error?: string;
}

export interface DecideOrdersPacketOptions {
  readonly client?: LLMClient;
  readonly diagnostics?: string[];
  readonly systemPromptAppend?: string;
}

async function callLlmOrderPacket(
  view: Record<string, unknown>,
  personaId: string,
  client: LLMClient | undefined,
  diagnostics: string[] | undefined,
  systemPromptAppend: string | undefined,
): Promise<{ data: Record<string, unknown>; rawResponse: string; usage: LlmUsageMeta; systemPrompt: string; userPrompt: string } | null> {
  const persona = PERSONA_BY_ID[personaId];
  if (!persona) {
    diagnostics?.push(`unknown persona_id ${JSON.stringify(personaId)}`);
    return null;
  }

  let c: LLMClient;
  try {
    c =
      client ??
      new LLMClient({
        temperature: persona.temperature,
        maxInputTokens: 4000,
        maxOutputTokens: 700,
      });
  } catch (e) {
    if (e instanceof LLMError) diagnostics?.push(`client init failed: ${e.message}`);
    else diagnostics?.push(`client init failed: ${String(e)}`);
    return null;
  }

  let systemPrompt = `${persona.system_prompt}\n\n${COMPACT_RULES_V2}\n\n`;
  if (systemPromptAppend?.trim()) {
    systemPrompt += `${systemPromptAppend.trim()}\n\n`;
  }
  systemPrompt +=
    "Respond with a SINGLE JSON object. Prefer choosing from the LEGAL order options by id: " +
    '{"choose": ["option-id-1", "option-id-2"]}. ' +
    "Copy option ids exactly from the list (full strings including colons). " +
    "Do not append tick counts or other numbers to an id unless that exact string appears in the list. " +
    'Put all conversational diplomacy in "messages", never inside "choose". ' +
    "You may also include " +
    '{"messages": [{"to": "tribe", "text": "..."}]}. ' +
    'If you cannot find a good action, return {"choose": []}. ' +
    "Keep messages under 200 characters.";

  const userPrompt =
    "CURRENT VIEW:\n" + `${compactView(view)}\n\n` + "Return JSON: choose[] uses only ids from Legal order options above; messages[] for any prose.";

  try {
    const result = await c.complete(systemPrompt, userPrompt, ORDER_PACKET_SCHEMA as unknown as object);
    return {
      data: result.data,
      rawResponse: result.rawResponse,
      usage: result.usage,
      systemPrompt,
      userPrompt,
    };
  } catch (e: unknown) {
    const msg = e instanceof LLMError ? e.message : String(e);
    diagnostics?.push(`LLM call failed: ${msg}`);
    return null;
  }
}

export async function decideOrdersPacketJson(
  projectedView: unknown,
  personaId: string,
  options?: DecideOrdersPacketOptions,
): Promise<LlmPacketResult> {
  const view = normalizeProjectedViewForLlm(projectedView);
  const result = await callLlmOrderPacket(
    view,
    personaId,
    options?.client,
    options?.diagnostics,
    options?.systemPromptAppend,
  );
  if (result === null) return { choose: [], messages: [] };

  const choose = extractChoose(result.data);
  const messages = extractMessages(result.data);

  return { choose, messages };
}

export async function decideOrdersPacketWithDebug(
  projectedView: unknown,
  personaId: string,
  options?: DecideOrdersPacketOptions,
): Promise<{ result: LlmPacketResult; debug: LlmDecisionDebugData }> {
  const view = normalizeProjectedViewForLlm(projectedView);

  const emptyUsage: LlmUsageMeta = { input_tokens: 0, output_tokens: 0, latency_ms: 0, model: "", provider: "" };
  const emptyDebug: LlmDecisionDebugData = {
    persona: personaId,
    systemPrompt: "",
    userPrompt: "",
    rawResponse: "",
    choose: [],
    messages: [],
    usage: emptyUsage,
    error: "no result",
  };

  const result = await callLlmOrderPacket(
    view,
    personaId,
    options?.client,
    options?.diagnostics,
    options?.systemPromptAppend,
  );

  if (result === null) {
    return { result: { choose: [], messages: [] }, debug: emptyDebug };
  }

  const choose = extractChoose(result.data);
  const messages = extractMessages(result.data);

  const debug: LlmDecisionDebugData = {
    persona: personaId,
    systemPrompt: result.systemPrompt,
    userPrompt: result.userPrompt,
    rawResponse: result.rawResponse,
    choose,
    messages,
    usage: result.usage,
  };

  return { result: { choose, messages }, debug };
}

function extractChoose(data: Record<string, unknown>): string[] {
  const choose: string[] = [];
  const rawChoose = data.choose;
  if (Array.isArray(rawChoose)) {
    for (const x of rawChoose) {
      if (typeof x === "string" && x.trim()) choose.push(x);
    }
  }
  return choose;
}

function extractMessages(data: Record<string, unknown>): { to: string; text: string }[] {
  const messages: { to: string; text: string }[] = [];
  const rawMessages = data.messages;
  if (Array.isArray(rawMessages)) {
    for (const m of rawMessages) {
      if (m === null || typeof m !== "object") continue;
      const o = m as Record<string, unknown>;
      const to = o.to;
      const text = o.text;
      if (typeof to === "string" && typeof text === "string" && text.trim()) {
        messages.push({ to, text: text.slice(0, 400) });
      }
    }
  }
  return messages;
}
