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
  decideOrdersPacketWithDebug: vi.fn(async () => ({
    result: { choose: [] as string[], messages: [] as { to: string; text: string }[] },
    debug: { tribe: "orange", error: null },
  })),
}));

describe("generateLlmOrders", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("merges choose + messages and sanitizes via @rr/llm", async () => {
    const { decideOrdersPacketWithDebug } = await import("@rr/llm");
    vi.mocked(decideOrdersPacketWithDebug).mockResolvedValueOnce({
      result: { choose: [], messages: [] },
      debug: { tribe: "orange", error: null },
    });

    const state = initMatch(handMinimal4);
    const { orders, debug } = await generateLlmOrders(state, "orange", {
      persona: "warlord",
    });

    expect(orders).toEqual([]);
    expect(decideOrdersPacketWithDebug).toHaveBeenCalled();
  });
});
