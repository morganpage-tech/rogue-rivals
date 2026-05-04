export interface PersonaKitLike {
  recruitCostModifier: Record<string, number | undefined>;
  tradeCostModifier: number;
  defenderBonusOwnRegion: number;
  travelTickModifier: Array<{ terrain: string; delta: number }>;
  scoutDwellTicksOverride: number | null;
  captureBountyInfluence: number;
  terrainProductionBonus: Array<{ terrain: string; bonus: number }>;
  shrineProductionBonus: number;
  ambushAttackBonus: number;
}

export function renderKitBonuses(kitId: string | undefined, kit: PersonaKitLike): string {
  if (!kitId) return "";
  const parts: string[] = [];

  for (const [tierStr, mod] of Object.entries(kit.recruitCostModifier)) {
    if (mod !== 0) {
      const base = { "2": 5, "3": 12, "4": 30 }[tierStr] ?? 0;
      const actual = base + (mod as number);
      parts.push(`- Tier ${tierStr} recruit cost: ${actual} (base ${base}, ${(mod as number) > 0 ? "+" : ""}${mod})`);
    }
  }
  if (kit.tradeCostModifier !== 0) {
    parts.push(`- Trade caravan overhead: ${1 + kit.tradeCostModifier} (base 1, ${kit.tradeCostModifier > 0 ? "+" : ""}${kit.tradeCostModifier})`);
  }
  if (kit.defenderBonusOwnRegion !== 0) {
    parts.push(`- Defender bonus in your own regions: +${kit.defenderBonusOwnRegion}`);
  }
  for (const mod of kit.travelTickModifier) {
    if (mod.delta !== 0) {
      parts.push(`- Travel through ${mod.terrain}: ${mod.delta} tick${Math.abs(mod.delta) > 1 ? "s" : ""} (${mod.delta > 0 ? "slower" : "faster"})`);
    }
  }
  if (kit.scoutDwellTicksOverride !== null) {
    parts.push(`- Scouts dwell ${kit.scoutDwellTicksOverride} ticks (base 1)`);
  }
  if (kit.captureBountyInfluence !== 0) {
    parts.push(`- Influence bounty on region capture: +${kit.captureBountyInfluence}`);
  }
  for (const tb of kit.terrainProductionBonus) {
    if (tb.bonus !== 0) {
      parts.push(`- Production bonus on ${tb.terrain}: +${tb.bonus}`);
    }
  }
  if (kit.shrineProductionBonus !== 0) {
    parts.push(`- Production bonus per shrine owned: +${kit.shrineProductionBonus}`);
  }
  if (kit.ambushAttackBonus !== 0) {
    parts.push(`- Attack bonus when attacking from your own region: +${kit.ambushAttackBonus}`);
  }

  if (parts.length === 0) return "";
  return `YOUR MECHANICAL BONUSES (${kitId}):\n${parts.join("\n")}`;
}
