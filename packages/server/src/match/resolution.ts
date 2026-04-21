import {
  projectForPlayer,
  projectForSpectator,
  tick,
} from "@rr/engine2";
import type { GameState, OrderPacket, Tribe } from "@rr/engine2";
import type { LlmDecisionDebug, Order, ProjectedView, TickDebug } from "@rr/shared";
import { sanitizePlayerOrders } from "@rr/shared";

import { generateLlmOrders } from "../autoplay/llmOpponent.js";
import { appendPacketTick, assertMatchLogTickCount } from "../persistence/matchLog.js";
import type { ActiveMatch, TickBufferEntry } from "./activeMatch.js";

interface PacketWithDebug {
  packet: OrderPacket;
  debug?: LlmDecisionDebug;
  orderDescriptions: string[];
}

async function buildPackets(match: ActiveMatch): Promise<Record<Tribe, PacketWithDebug>> {
  const st = match.state;
  const tickNum = st.tick;
  const packets = {} as Record<Tribe, PacketWithDebug>;

  await Promise.all(
    st.tribesAlive.map(async (tribe) => {
      const slot = match.slots.get(tribe)!;
      const sub = match.submittedOrders.get(tribe);

      if (sub && sub.tick === tickNum) {
        const inf = st.players[tribe]!.influence;
        const orders =
          slot.type === "human"
            ? sanitizePlayerOrders(inf, sub.orders)
            : sub.orders;
        packets[tribe] = {
          packet: { tribe, tick: tickNum, orders },
          orderDescriptions: orders.map(describeOrder),
        };
        return;
      }

      if (slot.type === "pass") {
        packets[tribe] = {
          packet: { tribe, tick: tickNum, orders: [] },
          orderDescriptions: [],
        };
        return;
      }

      if (slot.type === "llm" && slot.llmConfig) {
        const { orders, debug } = await generateLlmOrders(st, tribe, slot.llmConfig);
        packets[tribe] = {
          packet: { tribe, tick: tickNum, orders },
          debug,
          orderDescriptions: orders.map(describeOrder),
        };
        return;
      }

      packets[tribe] = {
        packet: { tribe, tick: tickNum, orders: [] },
        orderDescriptions: [],
      };
    }),
  );

  return packets;
}

function describeOrder(o: Order): string {
  switch (o.kind) {
    case "recruit": return `recruit T${o.tier} @ ${o.regionId}`;
    case "move": return `move ${o.forceId} → ${o.destinationRegionId}`;
    case "build": return `build ${o.structure} @ ${o.regionId}`;
    case "scout": return `scout → ${o.targetRegionId}`;
    case "propose": return `propose ${o.proposal.kind} to ${o.proposal.to}`;
    case "respond": return `respond ${o.response} to ${o.proposalId}`;
    case "message": return `msg → ${o.to}`;
  }
}

export async function resolveTick(match: ActiveMatch, matchId: string): Promise<void> {
  if (match.tickTimeoutTimer) {
    clearTimeout(match.tickTimeoutTimer);
    match.tickTimeoutTimer = null;
  }

  const packetsWithDebug = await buildPackets(match);
  const packetsByTribe = Object.fromEntries(
    Object.entries(packetsWithDebug).map(([t, p]) => [t, p.packet]),
  ) as Record<Tribe, OrderPacket>;

  const result = tick(match.state as GameState, packetsByTribe);

  const tickLimit = match.slotConfig.tickLimit ?? 60;
  const spec = projectForSpectator(result.state, result.events, { tickLimit });

  const projectedViews = {} as Record<Tribe, ProjectedView>;
  for (const t of result.state.tribesAlive) {
    projectedViews[t] = projectForPlayer(result.state, t);
  }

  const entry: TickBufferEntry = {
    tickNumber: result.state.tick,
    stateHash: result.stateHash,
    spectatorView: spec,
    projectedViews,
    events: [...result.events],
    packetsByTribe,
  };

  const decisions: LlmDecisionDebug[] = [...match.pendingDecisions];
  match.pendingDecisions = [];
  const orderSummary: Record<string, string[]> = {};
  for (const [tribe, pwd] of Object.entries(packetsWithDebug)) {
    orderSummary[tribe] = pwd.orderDescriptions;
    if (pwd.debug) decisions.push(pwd.debug);
  }

  const tickDebug: TickDebug = {
    tick: result.state.tick,
    decisions,
    orderSummary,
    events: [...result.events],
    stateHash: result.stateHash,
  };

  match.state = result.state;
  match.tickBuffer.push(entry);
  match.debugBuffer.push(tickDebug);
  match.submittedOrders.clear();

  appendPacketTick(matchId, {
    kind: "tick",
    tick: result.state.tick,
    packetsByTribe,
    stateHash: result.stateHash,
    events: [...result.events],
  });
  assertMatchLogTickCount(matchId, match.tickBuffer.length);

  if (result.state.winner !== null) {
    match.status = "finished";
  }
}
