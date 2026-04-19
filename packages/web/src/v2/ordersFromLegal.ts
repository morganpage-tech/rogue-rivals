import type {
  ForceTier,
  LegalOrderOption,
  Order,
  OrderPacket,
  Proposal,
  StructureKind,
  GameState,
  Tribe,
} from "@rr/engine2";

/** Turn a legal-option row into a concrete `Order` (payloads are camelCase from `projectForPlayer`). */
export function orderFromLegalOption(opt: LegalOrderOption): Order {
  const p = opt.payload as Record<string, unknown>;
  switch (opt.kind) {
    case "move":
      return {
        kind: "move",
        forceId: p.forceId as string,
        destinationRegionId: p.destinationRegionId as string,
      };
    case "recruit":
      return {
        kind: "recruit",
        regionId: p.regionId as string,
        tier: p.tier as ForceTier,
      };
    case "build":
      return {
        kind: "build",
        regionId: p.regionId as string,
        structure: p.structure as StructureKind,
        ...(typeof p.roadTarget === "string" ? { roadTarget: p.roadTarget } : {}),
      };
    case "scout":
      return {
        kind: "scout",
        fromRegionId: p.fromRegionId as string,
        targetRegionId: p.targetRegionId as string,
      };
    case "propose":
      return {
        kind: "propose",
        proposal: p.proposal as Proposal,
      };
    case "respond":
      return {
        kind: "respond",
        proposalId: p.proposalId as string,
        response: p.response as "accept" | "decline",
      };
    default:
      throw new Error(`Unsupported legal option kind: ${String(opt.kind)}`);
  }
}

/** One packet per alive tribe; only `forTribe` carries `orders` (others pass). */
export function buildPassPackets(
  state: GameState,
  forTribe: Tribe,
  orders: readonly Order[],
): Record<Tribe, OrderPacket> {
  const out = {} as Record<Tribe, OrderPacket>;
  for (const t of state.tribesAlive) {
    out[t] = {
      tribe: t,
      tick: state.tick,
      orders: t === forTribe ? [...orders] : [],
    };
  }
  return out;
}
