import { config as loadDotenv } from "dotenv";
import { COMPACT_RULES_V2 } from "./compactRules.js";
import { compactView } from "./compactView.js";
import { LLMClient, LLMError } from "./llmClient.js";
import { normalizeProjectedViewForLlm } from "./normalizeProjectedViewForLlm.js";
import { ORDER_PACKET_SCHEMA } from "./orderPacketSchema.js";
import { PERSONA_BY_ID } from "./personas.js";

loadDotenv();

export interface LlmPacketResult {
  readonly choose: string[];
  readonly messages: { to: string; text: string }[];
}

export interface DecideOrdersPacketOptions {
  readonly client?: LLMClient;
  readonly diagnostics?: string[];
  /** Extra system prompt text (e.g. MatchWizard systemPrompt). */
  readonly systemPromptAppend?: string;
}

async function callLlmOrderPacket(
  view: Record<string, unknown>,
  personaId: string,
  client: LLMClient | undefined,
  diagnostics: string[] | undefined,
  systemPromptAppend: string | undefined,
): Promise<Record<string, unknown> | null> {
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
    return await c.complete(systemPrompt, userPrompt, ORDER_PACKET_SCHEMA as unknown as object);
  } catch (e: unknown) {
    const msg = e instanceof LLMError ? e.message : String(e);
    diagnostics?.push(`LLM call failed: ${msg}`);
    return null;
  }
}

/** Same contract as Python decide_orders_packet_json. */
export async function decideOrdersPacketJson(
  projectedView: unknown,
  personaId: string,
  options?: DecideOrdersPacketOptions,
): Promise<LlmPacketResult> {
  const view = normalizeProjectedViewForLlm(projectedView);
  const data = await callLlmOrderPacket(
    view,
    personaId,
    options?.client,
    options?.diagnostics,
    options?.systemPromptAppend,
  );
  if (data === null) return { choose: [], messages: [] };

  const choose: string[] = [];
  const rawChoose = data.choose;
  if (Array.isArray(rawChoose)) {
    for (const x of rawChoose) {
      if (typeof x === "string" && x.trim()) choose.push(x);
    }
  }

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

  return { choose, messages };
}

