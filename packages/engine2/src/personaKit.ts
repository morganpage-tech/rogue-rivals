import type { RegionType, Tribe } from "@rr/shared";

export type PersonaKitId =
  | "warlord"
  | "merchant_prince"
  | "paranoid_isolationist"
  | "frostmarshal"
  | "veilweaver"
  | "opportunist"
  | "cragwise"
  | "shadowreader"
  | "palmstalker";

export interface PersonaKit {
  recruitCostModifier: Partial<Record<number, number>>;
  tradeCostModifier: number;
  defenderBonusOwnRegion: number;
  travelTickModifier: Array<{ terrain: RegionType; delta: number }>;
  scoutDwellTicksOverride: number | null;
  captureBountyInfluence: number;
  terrainProductionBonus: Array<{ terrain: RegionType; bonus: number }>;
  shrineProductionBonus: number;
  ambushAttackBonus: number;
}

export const PERSONA_KITS: Record<PersonaKitId, PersonaKit> = {
  warlord: {
    recruitCostModifier: { 2: -1, 3: -1 },
    tradeCostModifier: 0,
    defenderBonusOwnRegion: 0,
    travelTickModifier: [],
    scoutDwellTicksOverride: null,
    captureBountyInfluence: 0,
    terrainProductionBonus: [],
    shrineProductionBonus: 0,
    ambushAttackBonus: 0,
  },
  merchant_prince: {
    recruitCostModifier: {},
    tradeCostModifier: -1,
    defenderBonusOwnRegion: 0,
    travelTickModifier: [],
    scoutDwellTicksOverride: null,
    captureBountyInfluence: 0,
    terrainProductionBonus: [],
    shrineProductionBonus: 0,
    ambushAttackBonus: 0,
  },
  paranoid_isolationist: {
    recruitCostModifier: {},
    tradeCostModifier: 0,
    defenderBonusOwnRegion: 1,
    travelTickModifier: [],
    scoutDwellTicksOverride: null,
    captureBountyInfluence: 0,
    terrainProductionBonus: [],
    shrineProductionBonus: 0,
    ambushAttackBonus: 0,
  },
  frostmarshal: {
    recruitCostModifier: {},
    tradeCostModifier: 0,
    defenderBonusOwnRegion: 0,
    travelTickModifier: [{ terrain: "mountains", delta: -1 }],
    scoutDwellTicksOverride: null,
    captureBountyInfluence: 0,
    terrainProductionBonus: [],
    shrineProductionBonus: 0,
    ambushAttackBonus: 0,
  },
  veilweaver: {
    recruitCostModifier: {},
    tradeCostModifier: 0,
    defenderBonusOwnRegion: 0,
    travelTickModifier: [],
    scoutDwellTicksOverride: 2,
    captureBountyInfluence: 0,
    terrainProductionBonus: [],
    shrineProductionBonus: 0,
    ambushAttackBonus: 0,
  },
  opportunist: {
    recruitCostModifier: {},
    tradeCostModifier: 0,
    defenderBonusOwnRegion: 0,
    travelTickModifier: [],
    scoutDwellTicksOverride: null,
    captureBountyInfluence: 1,
    terrainProductionBonus: [],
    shrineProductionBonus: 0,
    ambushAttackBonus: 0,
  },
  cragwise: {
    recruitCostModifier: {},
    tradeCostModifier: 0,
    defenderBonusOwnRegion: 0,
    travelTickModifier: [],
    scoutDwellTicksOverride: null,
    captureBountyInfluence: 0,
    terrainProductionBonus: [
      { terrain: "mountains", bonus: 1 },
      { terrain: "forest", bonus: 1 },
    ],
    shrineProductionBonus: 0,
    ambushAttackBonus: 0,
  },
  shadowreader: {
    recruitCostModifier: {},
    tradeCostModifier: 0,
    defenderBonusOwnRegion: 0,
    travelTickModifier: [],
    scoutDwellTicksOverride: null,
    captureBountyInfluence: 0,
    terrainProductionBonus: [],
    shrineProductionBonus: 1,
    ambushAttackBonus: 0,
  },
  palmstalker: {
    recruitCostModifier: {},
    tradeCostModifier: 0,
    defenderBonusOwnRegion: 0,
    travelTickModifier: [],
    scoutDwellTicksOverride: null,
    captureBountyInfluence: 0,
    terrainProductionBonus: [],
    shrineProductionBonus: 0,
    ambushAttackBonus: 1,
  },
};

export const EMPTY_KIT: PersonaKit = {
  recruitCostModifier: {},
  tradeCostModifier: 0,
  defenderBonusOwnRegion: 0,
  travelTickModifier: [],
  scoutDwellTicksOverride: null,
  captureBountyInfluence: 0,
  terrainProductionBonus: [],
  shrineProductionBonus: 0,
  ambushAttackBonus: 0,
};

export function getKitForTribe(
  state: { personaKits: Partial<Record<Tribe, PersonaKitId>> } | undefined,
  tribe: Tribe,
): PersonaKit {
  if (!state) return EMPTY_KIT;
  const kitId = state.personaKits[tribe];
  if (!kitId) return EMPTY_KIT;
  return PERSONA_KITS[kitId] ?? EMPTY_KIT;
}
