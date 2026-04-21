import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONTINENT_6P_DEFAULT_TRIBES } from "../src/continent6pMap.js";
import { hashState, initMatch } from "../src/index.js";
import { tick } from "../src/tick.js";
import type { OrderPacket, Tribe } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("continent 6p parity (legacy oracle hashes)", () => {
  it("matches Python hashes: post-init and after one empty tick", () => {
    const golden = JSON.parse(
      readFileSync(join(__dirname, "fixtures", "continent6p_python_hashes.json"), "utf-8"),
    ) as { init: string; afterEmptyTick0: string };

    const state = initMatch({
      seed: 2026001,
      rulesVersion: "v2.0",
      tribes: [...CONTINENT_6P_DEFAULT_TRIBES],
      mapPreset: "continent6p",
      regionCount: 20,
      tickLimit: 60,
      victorySustainTicks: 3,
      napDefaultLength: 8,
      sharedVisionDefaultLength: 5,
      caravanTravelTicks: 2,
    });

    expect(state.tribesAlive).toEqual([...CONTINENT_6P_DEFAULT_TRIBES]);
    expect(hashState(state)).toBe(golden.init);

    const packets = Object.fromEntries(
      state.tribesAlive.map((t): [Tribe, OrderPacket] => [t, { tribe: t, tick: 0, orders: [] }]),
    ) as Record<Tribe, OrderPacket>;
    const result = tick(state, packets);
    expect(result.state.tick).toBe(1);
    expect(result.stateHash).toBe(golden.afterEmptyTick0);
  });
});
