import type { MapPreset, Tribe } from "@rr/shared";
import type { PersonaKitId } from "./personaKit.js";

export interface MatchConfig {
  readonly seed: number;
  readonly rulesVersion: "v2.0";
  readonly tribes: readonly Tribe[];
  readonly mapPreset: MapPreset;
  readonly regionCount: number;
  readonly tickLimit: number;
  readonly victorySustainTicks: number;
  readonly napDefaultLength: number;
  readonly sharedVisionDefaultLength: number;
  readonly caravanTravelTicks: number;
  readonly personaKits?: Partial<Record<Tribe, PersonaKitId>>;
}

/** Default config mirroring RULES.md §2. */
export const DEFAULT_MATCH_CONFIG: Omit<MatchConfig, "seed"> = {
  rulesVersion: "v2.0",
  tribes: ["orange", "grey", "brown", "red"],
  mapPreset: "hand_minimal",
  regionCount: 20,
  tickLimit: 40,
  victorySustainTicks: 2,
  napDefaultLength: 4,
  sharedVisionDefaultLength: 5,
  caravanTravelTicks: 2,
} as const;
