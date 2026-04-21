import { describe, expect, it } from "vitest";

import { decideOrdersPacketJson } from "../src/decideOrdersPacket.js";
import { LLMClient } from "../src/llmClient.js";

describe("decideOrdersPacketJson", () => {
  it("returns choose and messages from mocked client", async () => {
    const client = {
      async complete() {
        return {
          choose: ["move:a:b"],
          messages: [{ to: "grey", text: "hello" }],
          _usage: { input_tokens: 1, output_tokens: 2, latency_ms: 3, model: "x", provider: "openai" },
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
