import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hashState, initMatch } from "../src/index.js";
import { tick } from "../src/tick.js";
import type { OrderPacket, Tribe } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("expanded map parity (tools/v2/mapgen.py)", () => {
  it("matches Python hashes: post-init and after one empty tick", () => {
    const golden = JSON.parse(
      readFileSync(join(__dirname, "fixtures", "expanded_python_hashes.json"), "utf-8"),
    ) as { init: string; afterEmptyTick0: string };

    const state = initMatch({
      seed: 2026001,
      rulesVersion: "v2.0",
      tribes: ["orange", "grey", "brown", "red"],
      mapPreset: "expanded",
      regionCount: 20,
      tickLimit: 60,
      victorySustainTicks: 3,
      napDefaultLength: 8,
      sharedVisionDefaultLength: 5,
      caravanTravelTicks: 2,
    });

    expect(hashState(state)).toBe(golden.init);

    const tribes: Tribe[] = ["orange", "grey", "brown", "red"];
    const packets = Object.fromEntries(
      tribes.map((t): [Tribe, OrderPacket] => [t, { tribe: t, tick: 0, orders: [] }]),
    ) as Record<Tribe, OrderPacket>;
    const result = tick(state, packets);
    expect(result.state.tick).toBe(1);
    expect(result.stateHash).toBe(golden.afterEmptyTick0);
  });
});
