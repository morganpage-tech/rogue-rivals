import { buildContinentMap6p, placeTribesContinent6p } from "./continent6pMap.js";
import { buildExpandedMap, placeTribesExpanded } from "./expandedMap.js";
import { buildHandMap, placeTribes } from "./handMap.js";
import type { GameState, Tribe, VictoryCounters, VictoryConditionKey } from "./types.js";
import type { MatchConfig } from "./matchConfig.js";

function emptyVictoryCounters(tribes: readonly Tribe[]): VictoryCounters {
  const counters = {} as Record<string, Partial<Record<VictoryConditionKey, number>>>;
  for (const tribe of tribes) {
    counters[tribe] = {
      territorial_dominance: 0,
      economic_supremacy: 0,
      diplomatic_hegemony: 0,
    };
  }
  return counters as VictoryCounters;
}

export function initMatch(config: MatchConfig): GameState {
  if (config.rulesVersion !== "v2.0") {
    throw new Error(`Unsupported rulesVersion: ${config.rulesVersion}`);
  }

  const state: GameState = {
    seed: config.seed,
    rulesVersion: "v2.0",
    tick: 0,
    tribesAlive: [],
    regions: {},
    trails: [],
    forces: {},
    scouts: {},
    caravans: {},
    players: {} as GameState["players"],
    pacts: [],
    activeCommitments: [],
    announcements: [],
    victoryCounters: emptyVictoryCounters(config.tribes),
    personaKits: config.personaKits ?? {},
    winner: null,
    nextForceIdx: 0,
    nextScoutIdx: 0,
    nextCaravanIdx: 0,
    nextProposalIdx: 0,
  };

  if (config.mapPreset === "hand_minimal") {
    buildHandMap(state);
    placeTribes(state, [...config.tribes] as Tribe[]);
    return state;
  }

  if (config.mapPreset === "expanded") {
    buildExpandedMap(state);
    placeTribesExpanded(state, [...config.tribes] as Tribe[]);
    return state;
  }

  if (config.mapPreset === "continent6p") {
    buildContinentMap6p(state);
    placeTribesContinent6p(state, [...config.tribes] as Tribe[]);
    return state;
  }

  if (config.mapPreset === "procedural") {
    throw new Error(
      'Map preset "procedural" is not implemented; use "hand_minimal" until §11 procedural lands.',
    );
  }

  throw new Error(`Map preset not implemented in engine2 yet: ${config.mapPreset}`);
}
