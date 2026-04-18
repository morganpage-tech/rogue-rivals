import type { Resource, Tribe, Region, BuildingType } from "@rr/engine";

export const RES_LABEL: Record<Resource, string> = {
  T: "Timber",
  O: "Ore",
  F: "Forage",
  Rel: "Relic",
  S: "Scrap",
};

export const RES_SHORT: Record<Resource, string> = {
  T: "T",
  O: "O",
  F: "F",
  Rel: "Rel",
  S: "S",
};

export const REGION_LABEL: Record<Region, string> = {
  plains: "Plains",
  mountains: "Mountains",
  swamps: "Swamps",
  desert: "Desert",
  ruins: "Ruins",
};

export const REGION_RES_NAME: Record<Region, string> = {
  plains: "Timber",
  mountains: "Ore",
  swamps: "Forage",
  desert: "Relic",
  ruins: "Scrap",
};

export const TRIBE_LABEL: Record<Tribe, string> = {
  orange: "Orange",
  grey: "Grey",
  brown: "Brown",
  red: "Red",
};

export const BUILDING_LABEL: Record<BuildingType, string> = {
  shack: "Shack",
  den: "Den",
  watchtower: "Watchtower",
  forge: "Forge",
  great_hall: "Great Hall",
};

export const BUILDING_VP: Record<BuildingType, number> = {
  shack: 1,
  den: 1,
  watchtower: 2,
  forge: 2,
  great_hall: 4,
};

export const BUILDING_EFFECT: Record<BuildingType, string> = {
  shack: "+1 when you gather in your home region.",
  den: "+1 more when you gather at home (stacks with Shack for +2).",
  watchtower:
    "Absorbs one ambush hit against you per round — you lose nothing on a blocked hit.",
  forge:
    "+1 every time you gather, in any region including home.",
  great_hall:
    "Immediately triggers end-of-match after this round — whoever leads on VP wins.",
};

export const BUILDING_WHY: Record<BuildingType, string> = {
  shack: "cheapest VP + compounds your home gathers.",
  den: "turns your home region into a 2-per-turn Scrap-efficient engine.",
  watchtower: "insurance if anyone keeps ambushing you; also +2 VP.",
  forge: "best late-game multiplier — every future gather is bigger.",
  great_hall: "ends the match on your terms, locking in a VP lead.",
};

export const ACTION_EFFECT: Record<
  "gather" | "build" | "ambush" | "scout" | "pass" | "trade",
  string
> = {
  gather:
    "Pick up the region's resource. Your home region gives +2 base, others +1. Ruins give 1 Scrap. Buildings and ambushes change the maths.",
  build:
    "Spend resources to put up a structure. Each building gives VP now and a permanent bonus. VP accumulates; first to 8 VP wins.",
  ambush:
    "Pay 1 Scrap to lie in wait in a region. If anyone gathers there over the next 2 rounds, you steal double their yield. Watchtowers can block you.",
  scout:
    "Peek at a region. If someone's ambushing there you reveal and cancel it — no resources gained for you.",
  pass: "Skip your action this turn. Trades you already made still resolve.",
  trade:
    "Swap resources with another player. Your first trade each round earns a trade bead; 2 beads = 1 VP. In v0.8 beads are 'in transit' until end-of-round — if you're ambushed that round, the ambusher steals them.",
};

export function formatResourceBag(bag: Partial<Record<Resource, number>>): string {
  const parts: string[] = [];
  (Object.keys(RES_LABEL) as Resource[]).forEach((k) => {
    const v = bag[k] ?? 0;
    if (v > 0) parts.push(`${v} ${RES_SHORT[k]}`);
  });
  return parts.length ? parts.join(" + ") : "—";
}
