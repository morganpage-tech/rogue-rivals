import type {
  GameState,
  OrderPacket,
  ProjectedView,
  ResolutionEvent,
  Tribe,
} from "@rr/engine2";
import { buildTickSummaryFromPackets } from "./buildTickSummary.js";
import { orderToReplayPayload } from "./orderToReplayPayload.js";
import { serializeProjectedViewForReplay } from "./projectedViewReplay.js";
import { serializeGameStateForReplay } from "./serializeGameStateForReplay.js";
import type { OrderPacketRow, ReplayFrame } from "./types.js";

function ordersToRows(orders: OrderPacket["orders"]): { kind: string; payload: Record<string, unknown> }[] {
  return orders.map((o) => ({
    kind: o.kind,
    payload: orderToReplayPayload(o),
  }));
}

function packetsToOrdersByTribe(packets: Record<Tribe, OrderPacket>): Record<string, OrderPacketRow> {
  const out: Record<string, OrderPacketRow> = {};
  for (const tribe of Object.keys(packets).sort() as Tribe[]) {
    const p = packets[tribe]!;
    out[tribe] = {
      tribe: p.tribe,
      tick: p.tick,
      orders: ordersToRows(p.orders),
    };
  }
  return out;
}

function eventsToJson(events: readonly ResolutionEvent[]): unknown[] {
  return JSON.parse(JSON.stringify(events)) as unknown[];
}

export function buildReplayFrameFromTs(opts: {
  label: string;
  state: GameState;
  stateHash: string;
  packets: Record<Tribe, OrderPacket>;
  events: readonly ResolutionEvent[];
  projectedViews: Readonly<Record<Tribe, ProjectedView>>;
}): ReplayFrame {
  const projected_views: Record<string, unknown> = {};
  for (const t of Object.keys(opts.projectedViews).sort() as Tribe[]) {
    projected_views[t] = serializeProjectedViewForReplay(opts.projectedViews[t]!);
  }

  return {
    tick: opts.state.tick,
    label: opts.label,
    state_hash: opts.stateHash,
    orders_by_tribe: packetsToOrdersByTribe(opts.packets),
    resolution_events: eventsToJson(opts.events),
    tick_summary: buildTickSummaryFromPackets(opts.packets, opts.events),
    projected_views,
    state: serializeGameStateForReplay(opts.state),
  };
}
