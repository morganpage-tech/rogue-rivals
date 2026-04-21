import { describe, expect, it } from "vitest";

import { COMPACT_RULES_V2 } from "../src/compactRules.js";
import { decideOrdersPacketJson, extractChoose, extractMessages } from "../src/decideOrdersPacket.js";
import { LLMClient } from "../src/llmClient.js";
import { PERSONA_BY_ID } from "../src/personas.js";

function buildSystemPrompt(personaId: string, append?: string): string {
  const persona = PERSONA_BY_ID[personaId];
  if (!persona) return "";
  let sp = `${persona.system_prompt}\n\n${COMPACT_RULES_V2}\n\n`;
  if (append?.trim()) sp += `${append.trim()}\n\n`;
  sp +=
    "Respond with a SINGLE JSON object. Prefer choosing from the LEGAL order options by id: " +
    '{"choose": ["option-id-1", "option-id-2"]}. ' +
    "Copy option ids exactly from the list (full strings including colons). " +
    "Do not append tick counts or other numbers to an id unless that exact string appears in the list. " +
    'Put all conversational diplomacy in "messages", never inside "choose". ' +
    "You may also include " +
    '{"messages": [{"to": "tribe", "text": "..."}]}. ' +
    'If you cannot find a good action, return {"choose": []}. ' +
    "Keep messages under 200 characters.";
  return sp;
}

function jsonResponseFormatsInPrompt(prompt: string): string[] {
  const formats: string[] = [];
  const jsonPropertyPattern = /"(\w+)":\s*\[/g;
  for (const m of prompt.matchAll(jsonPropertyPattern)) {
    formats.push(m[1]!);
  }
  return [...new Set(formats)];
}

describe("decideOrdersPacketJson", () => {
  it("returns choose and messages from mocked client", async () => {
    const client = {
      async complete() {
        return {
          data: { choose: ["move:a:b"], messages: [{ to: "grey", text: "hello" }] },
          rawResponse: '{"choose":["move:a:b"]}',
          usage: { input_tokens: 1, output_tokens: 2, latency_ms: 3, model: "x", provider: "openai" },
        };
      },
    } as unknown as LLMClient;

    const view = {
      tick: 0,
      forTribe: "orange",
      tribesAlive: ["orange", "grey"],
      myPlayerState: { influence: 10, reputationPenaltyExpiresTick: 0, outstandingProposals: [] },
      myForces: [],
      visibleRegions: {},
      legalOrderOptions: [{ id: "move:a:b", kind: "move", summary: "mv", payload: {} }],
    };

    const out = await decideOrdersPacketJson(view, "warlord", { client });
    expect(out.choose).toContain("move:a:b");
    expect(out.messages).toEqual([{ to: "grey", text: "hello" }]);
  });

  it("returns empty on unknown persona", async () => {
    const diagnostics: string[] = [];
    const out = await decideOrdersPacketJson({ tick: 0 }, "not_a_real_persona", {
      diagnostics,
    });
    expect(out).toEqual({ choose: [], messages: [] });
    expect(diagnostics.some((d) => d.includes("unknown persona_id"))).toBe(true);
  });
});

describe("prompt-extraction consistency", () => {
  for (const personaId of Object.keys(PERSONA_BY_ID)) {
    describe(`persona: ${personaId}`, () => {
      it("system prompt only instructs output formats that extractChoose handles", () => {
        const prompt = buildSystemPrompt(personaId);
        const formats = jsonResponseFormatsInPrompt(prompt);

        const extractableFormats = new Set(["choose", "messages"]);
        const unhandled = formats.filter((f) => !extractableFormats.has(f));

        expect(
          unhandled,
          `Prompt instructs LLM to return keys [${unhandled.join(", ")}] that extractChoose/extractMessages do not handle. ` +
            `This means an LLM following the prompt's rules section will have its response silently dropped.`,
        ).toEqual([]);
      });

      it("mock LLM returning rules-compliant {orders:[...]} format produces non-empty choose", async () => {
        const prompt = buildSystemPrompt(personaId);
        const rulesMentionOrders = prompt.includes('"orders"');
        if (!rulesMentionOrders) return;

        const client = {
          async complete() {
            return {
              data: {
                orders: [
                  { kind: "move", force_id: "f1", destination_region_id: "r_b" },
                ],
              },
              rawResponse: '{"orders":[{"kind":"move"}]}',
              usage: { input_tokens: 1, output_tokens: 2, latency_ms: 3, model: "x", provider: "openai" },
            };
          },
        } as unknown as LLMClient;

        const view = {
          tick: 0,
          forTribe: "orange",
          tribesAlive: ["orange", "grey"],
          myPlayerState: { influence: 10, reputationPenaltyExpiresTick: 0, outstandingProposals: [] },
          myForces: [],
          visibleRegions: {},
          legalOrderOptions: [
            { id: "move:f1:r_b", kind: "move", summary: "Move f1 to r_b", payload: { forceId: "f1", destinationRegionId: "r_b" } },
          ],
        };

        const out = await decideOrdersPacketJson(view, personaId, { client });
        expect(
          out.choose.length,
          `LLM returned {"orders":[...]} as the rules section instructs, but extractChoose produced empty results. ` +
            `The rules say {\"orders\":[...]} but extraction only reads data.choose.`,
        ).toBeGreaterThan(0);
      });
    });
  }
});

describe("extractChoose", () => {
  it("extracts from data.choose", () => {
    const data = { choose: ["a", "b"] };
    expect(extractChoose(data)).toEqual(["a", "b"]);
  });

  it("returns empty when data has only orders key (no choose)", () => {
    const data = {
      orders: [
        { kind: "move", force_id: "f1", destination_region_id: "r_b" },
      ],
    };
    expect(extractChoose(data)).toEqual([]);
  });

  it("returns empty when data has neither choose nor orders", () => {
    const data = { messages: [{ to: "grey", text: "hello" }] };
    expect(extractChoose(data)).toEqual([]);
  });
});

describe("extractMessages", () => {
  it("extracts valid messages", () => {
    const data = { messages: [{ to: "grey", text: "hello" }] };
    expect(extractMessages(data)).toEqual([{ to: "grey", text: "hello" }]);
  });

  it("returns empty when no messages key", () => {
    const data = { choose: ["a"] };
    expect(extractMessages(data)).toEqual([]);
  });
});
