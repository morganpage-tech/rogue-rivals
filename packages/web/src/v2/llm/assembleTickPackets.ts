import { filterOrdersByInfluenceBudget, projectForPlayer } from "@rr/engine2";
import type { GameState, Order, OrderPacket, Tribe } from "@rr/engine2";
import { buildPassPackets } from "../ordersFromLegal.js";
import { fetchLlmSlotOrders } from "./fetchLlmSlot.js";
import { ordersFromChooseIds, ordersFromLlmMessageList } from "./chooseToOrders.js";

export type OpponentMode = "pass" | "llm_http";

export interface AssembleOptions {
  opponents: OpponentMode;
  /** Required when opponents === "llm_http" */
  llmUrl?: string;
  bearerToken?: string;
}

function packet(tribe: Tribe, tick: number, orders: Order[]): OrderPacket {
  return { tribe, tick, orders };
}

/**
 * Build full tick packets: human tribe uses `humanOrders`; others pass or call LLM HTTP per tribe.
 */
export async function assembleTickPackets(
  state: GameState,
  humanTribe: Tribe,
  humanOrders: Order[],
  opts: AssembleOptions,
): Promise<Record<Tribe, OrderPacket>> {
  if (opts.opponents === "pass") {
    const view = projectForPlayer(state, humanTribe);
    const clipped = filterOrdersByInfluenceBudget(
      view.myPlayerState.influence,
      humanOrders,
    );
    return buildPassPackets(state, humanTribe, clipped);
  }
  const url = opts.llmUrl?.trim();
  if (!url) {
    throw new Error("LLM URL is required when opponents use HTTP.");
  }

  const out: Record<Tribe, OrderPacket> = {} as Record<Tribe, OrderPacket>;
  const humanView = projectForPlayer(state, humanTribe);
  out[humanTribe] = packet(
    humanTribe,
    state.tick,
    filterOrdersByInfluenceBudget(humanView.myPlayerState.influence, humanOrders),
  );

  const others = state.tribesAlive.filter((t) => t !== humanTribe);
  const results = await Promise.all(
    others.map(async (tribe) => {
      const view = projectForPlayer(state, tribe);
      try {
        const json = await fetchLlmSlotOrders(
          url,
          { tribe, tick: state.tick, projectedView: view },
          { bearerToken: opts.bearerToken },
        );
        const choose = json.choose ?? [];
        const a = ordersFromChooseIds(view, choose);
        const b = ordersFromLlmMessageList(view, json.messages ?? []);
        const merged = [...a, ...b];
        const inf = view.myPlayerState.influence;
        return {
          tribe,
          orders: filterOrdersByInfluenceBudget(inf, merged),
        };
      } catch {
        return { tribe, orders: [] as Order[] };
      }
    }),
  );

  for (const r of results) {
    out[r.tribe] = packet(r.tribe, state.tick, r.orders);
  }
  return out;
}
