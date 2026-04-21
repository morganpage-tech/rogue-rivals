import {
  projectForPlayer,
  projectForSpectator,
  tick,
} from "@rr/engine2";
import type { GameState, OrderPacket, Tribe } from "@rr/engine2";
import type { ProjectedView } from "@rr/shared";
import { sanitizePlayerOrders } from "@rr/shared";

import { generateLlmOrders } from "../autoplay/llmOpponent.js";
import { appendPacketTick, assertMatchLogTickCount } from "../persistence/matchLog.js";
import type { ActiveMatch, TickBufferEntry } from "./activeMatch.js";

async function buildPackets(match: ActiveMatch): Promise<Record<Tribe, OrderPacket>> {
  const st = match.state;
  const tickNum = st.tick;
  const packets = {} as Record<Tribe, OrderPacket>;

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
        packets[tribe] = { tribe, tick: tickNum, orders };
        return;
      }

      if (slot.type === "pass") {
        packets[tribe] = { tribe, tick: tickNum, orders: [] };
        return;
      }

      if (slot.type === "llm" && slot.llmConfig) {
        const orders = await generateLlmOrders(st, tribe, slot.llmConfig);
        packets[tribe] = { tribe, tick: tickNum, orders };
        return;
      }

      packets[tribe] = { tribe, tick: tickNum, orders: [] };
    }),
  );

  return packets;
}

export async function resolveTick(match: ActiveMatch, matchId: string): Promise<void> {
  if (match.tickTimeoutTimer) {
    clearTimeout(match.tickTimeoutTimer);
    match.tickTimeoutTimer = null;
  }

  const packets = await buildPackets(match);
  const result = tick(match.state as GameState, packets);

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
    packetsByTribe: packets,
  };

  match.state = result.state;
  match.tickBuffer.push(entry);
  match.submittedOrders.clear();

  appendPacketTick(matchId, {
    kind: "tick",
    tick: result.state.tick,
    packetsByTribe: packets,
    stateHash: result.stateHash,
    events: [...result.events],
  });
  assertMatchLogTickCount(matchId, match.tickBuffer.length);

  if (result.state.winner !== null) {
    match.status = "finished";
  }
}
