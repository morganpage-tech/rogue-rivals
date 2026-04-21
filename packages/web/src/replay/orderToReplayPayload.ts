import type { Order } from "@rr/shared";

/** Same payload shape as trace jsonl / Python engine (snake_case keys). */
export function orderToReplayPayload(o: Order): Record<string, unknown> {
  switch (o.kind) {
    case "move":
      return { force_id: o.forceId, destination_region_id: o.destinationRegionId };
    case "recruit":
      return { region_id: o.regionId, tier: o.tier };
    case "build":
      return o.structure === "road" && o.roadTarget
        ? { region_id: o.regionId, structure: "road", road_target: o.roadTarget }
        : { region_id: o.regionId, structure: o.structure };
    case "scout":
      return { from_region_id: o.fromRegionId, target_region_id: o.targetRegionId };
    case "propose": {
      const p = o.proposal;
      const proposal: Record<string, unknown> = { kind: p.kind, to: p.to };
      if (p.kind === "nap" || p.kind === "shared_vision") {
        proposal.length_ticks = p.lengthTicks;
      }
      if (p.kind === "trade_offer") {
        proposal.amount_influence = p.amountInfluence;
      }
      return { proposal };
    }
    case "respond":
      return { proposal_id: o.proposalId, response: o.response };
    case "message":
      return { to: o.to, text: o.text };
  }
}
