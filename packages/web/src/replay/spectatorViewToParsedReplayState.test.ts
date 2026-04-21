import { describe, expect, it } from "vitest";

import type { SpectatorView } from "@rr/shared";

import { buildOmniscientProjectedViewFromState } from "./parseReplayStateSnapshot.js";
import { spectatorViewToParsedReplayState } from "./spectatorViewToParsedReplayState.js";
import { trailBaseTicksMap } from "./trailBaseTicksMap.js";

function minimalSpectator(overrides: Partial<SpectatorView> = {}): SpectatorView {
  return {
    tick: 1,
    tickLimit: 42,
    tribesAlive: ["orange"],
    winner: null,
    regions: {
      r_core_foxfire_ruins: {
        id: "r_core_foxfire_ruins",
        type: "ruins",
        owner: "orange",
        structures: [],
        roadTargets: {},
        garrisonForceId: null,
      },
    },
    trails: [
      {
        index: 0,
        a: "r_core_foxfire_ruins",
        b: "r_core_three_trails_market",
        baseLengthTicks: 3,
      },
    ],
    forces: {},
    transits: [],
    scouts: [],
    caravans: [],
    pacts: [],
    announcements: [],
    players: {
      orange: { tribe: "orange", influence: 5, reputationPenaltyExpiresTick: 0 },
    },
    resolutionEvents: [],
    ...overrides,
  } as SpectatorView;
}

describe("spectatorViewToParsedReplayState", () => {
  it("produces ParsedReplayState usable for trail ticks + omniscient view", () => {
    const v = minimalSpectator();
    const parsed = spectatorViewToParsedReplayState(v);
    expect(parsed.tick).toBe(1);
    expect(parsed.tickLimit).toBe(42);
    expect(parsed.trails).toHaveLength(1);
    const m = trailBaseTicksMap(parsed);
    expect(m.get("r_core_foxfire_ruins|r_core_three_trails_market")).toBe(3);
    const view = buildOmniscientProjectedViewFromState(parsed, "orange");
    expect(view.tickLimit).toBe(42);
    expect(Object.keys(view.visibleRegions)).toContain("r_core_foxfire_ruins");
  });
});
