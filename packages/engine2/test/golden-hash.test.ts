import { describe, expect, it } from "vitest";
import { hashState, initMatch, tick } from "../src/index.js";
import type { OrderPacket, Tribe } from "../src/types.js";

const INIT_HASH =
  "sha256:c299243d59deea29f690796688dda3ef9bf1107f771fd589e6f0c551700828a2";
const AFTER_EMPTY_TICK0_HASH =
  "sha256:2fb30d9c66071d86f72bb93663ce41eeabd911e79f5e3099140c1eb8542ecdc4";

describe("engine2 hash parity (tools/v2/engine.py)", () => {
  it("matches Python after hand_minimal init", () => {
    const state = initMatch({
      seed: 2026001,
      rulesVersion: "v2.0",
      tribes: ["orange", "grey", "brown", "red"],
      mapPreset: "hand_minimal",
      regionCount: 20,
      tickLimit: 60,
      victorySustainTicks: 3,
      napDefaultLength: 8,
      sharedVisionDefaultLength: 5,
      caravanTravelTicks: 2,
    });
    expect(hashState(state)).toBe(INIT_HASH);
  });

  it("matches Python after one empty tick at tick 0", () => {
    const state = initMatch({
      seed: 2026001,
      rulesVersion: "v2.0",
      tribes: ["orange", "grey", "brown", "red"],
      mapPreset: "hand_minimal",
      regionCount: 20,
      tickLimit: 60,
      victorySustainTicks: 3,
      napDefaultLength: 8,
      sharedVisionDefaultLength: 5,
      caravanTravelTicks: 2,
    });
    const tribes: Tribe[] = ["orange", "grey", "brown", "red"];
    const packets = Object.fromEntries(
      tribes.map(
        (t): [Tribe, OrderPacket] => [t, { tribe: t, tick: 0, orders: [] }],
      ),
    ) as Record<Tribe, OrderPacket>;
    const result = tick(state, packets);
    expect(result.state.tick).toBe(1);
    expect(result.stateHash).toBe(AFTER_EMPTY_TICK0_HASH);
    expect(hashState(result.state)).toBe(AFTER_EMPTY_TICK0_HASH);
  });
});
