import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_MATCH_CONFIG, initMatch, projectForPlayer } from "@rr/engine2";

import { generateLlmOrders } from "../src/autoplay/llmOpponent.js";

const handMinimal4 = {
  ...DEFAULT_MATCH_CONFIG,
  seed: 42,
  tribes: ["orange", "grey", "brown", "red"] as const,
  mapPreset: "hand_minimal" as const,
};

vi.mock("@rr/llm", () => ({
  decideOrdersPacketJson: vi.fn(async () => ({
    choose: [] as string[],
    messages: [] as { to: string; text: string }[],
  })),
}));

describe("generateLlmOrders", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("merges choose + messages and sanitizes via @rr/llm", async () => {
    const { decideOrdersPacketJson } = await import("@rr/llm");
    vi.mocked(decideOrdersPacketJson).mockResolvedValueOnce({
      choose: [],
      messages: [],
    });

    const state = initMatch(handMinimal4);
    const orders = await generateLlmOrders(state, "orange", {
      persona: "warlord",
    });

    expect(orders).toEqual([]);
    expect(decideOrdersPacketJson).toHaveBeenCalled();
  });
});
