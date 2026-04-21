import type { Order, OrderPacket, Tribe } from "@rr/shared";
import type { TickSummary } from "./types.js";

/** Mirrors tools/v2/render_replay._tick_summary_from_record for live frames. */
export function buildTickSummaryFromPackets(
  packetsByTribe: Record<Tribe, OrderPacket>,
  resolutionEvents: readonly unknown[],
): TickSummary {
  const messages: unknown[] = [];
  const diplomacy: unknown[] = [];

  for (const tribe of Object.keys(packetsByTribe).sort() as Tribe[]) {
    const pkt = packetsByTribe[tribe]!;
    for (const order of pkt.orders) {
      const o = order as Order;
      if (o.kind === "message") {
        messages.push({ from: tribe, to: o.to, text: o.text });
      } else if (o.kind === "propose") {
        const p = o.proposal;
        diplomacy.push({
          kind: "proposal_order",
          from: tribe,
          to: p.to,
          proposal_kind: p.kind,
          length_ticks: p.lengthTicks,
          amount_influence: p.amountInfluence,
        });
      } else if (o.kind === "respond") {
        diplomacy.push({
          kind: "respond_order",
          from: tribe,
          proposal_id: o.proposalId,
          response: o.response,
        });
      }
    }
  }

  const dipKinds = new Set([
    "proposal_sent",
    "proposal_declined",
    "proposal_expired",
    "pact_formed",
    "pact_broken",
    "pact_broken_by_move",
    "war_declared",
    "caravan_delivered",
    "caravan_intercepted",
  ]);
  for (const ev of resolutionEvents) {
    if (typeof ev === "object" && ev !== null && "kind" in ev && dipKinds.has(String((ev as { kind: string }).kind))) {
      diplomacy.push(ev);
    }
  }

  return { messages, diplomacy };
}
