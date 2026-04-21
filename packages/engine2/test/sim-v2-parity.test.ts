import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sortKeysDeep } from "../src/hashState.js";
import { initMatch } from "../src/index.js";
import { tick } from "../src/tick.js";
import { runSimV2Match, simV2PacketsForStep } from "./simV2Replay.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface GoldenRow {
  step: number;
  tickAfter: number;
  stateHash: string;
}

interface GoldenEventsRow {
  step: number;
  tickAfter: number;
  events: unknown[];
}

function loadGolden(): GoldenRow[] {
  const raw = readFileSync(join(__dirname, "fixtures", "sim_v2_python_hashes.json"), "utf-8");
  return JSON.parse(raw) as GoldenRow[];
}

function loadGoldenEvents(): GoldenEventsRow[] {
  const raw = readFileSync(join(__dirname, "fixtures", "sim_v2_python_events.json"), "utf-8");
  return JSON.parse(raw) as GoldenEventsRow[];
}

describe("sim_v2 full script parity (legacy oracle fixtures)", () => {
  it("matches Python state hash after every scripted tick", () => {
    const golden = loadGolden();
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

    for (let step = 0; step < golden.length; step++) {
      expect(state.tick).toBe(step);
      const packets = simV2PacketsForStep(state, step);
      const result = tick(state, packets);
      expect(result.state.tick, `after step ${step}`).toBe(golden[step]!.tickAfter);
      expect(result.stateHash, `step ${step} hash`).toBe(golden[step]!.stateHash);
    }
  });

  it("matches Python resolution_events (canonical JSON per tick)", () => {
    const goldenEv = loadGoldenEvents();
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

    for (let step = 0; step < goldenEv.length; step++) {
      expect(state.tick).toBe(step);
      const packets = simV2PacketsForStep(state, step);
      const result = tick(state, packets);
      const got = sortKeysDeep(result.events as unknown);
      const want = sortKeysDeep(goldenEv[step]!.events);
      expect(JSON.stringify(got)).toBe(JSON.stringify(want));
      expect(result.state.tick).toBe(goldenEv[step]!.tickAfter);
    }
  });

  it("runSimV2Match collects the same hash sequence", () => {
    const golden = loadGolden().map((r) => r.stateHash);
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
    const { hashes, finalTick } = runSimV2Match(state);
    expect(finalTick).toBe(10);
    expect(hashes).toEqual(golden);
  });
});
