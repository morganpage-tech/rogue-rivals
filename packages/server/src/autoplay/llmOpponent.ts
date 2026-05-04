import { decideOrdersPacketWithDebug, renderKitBonuses, type TickHistory, type NarrativeBuffer } from "@rr/llm";
import { projectForPlayer, getKitForTribe } from "@rr/engine2";
import type { GameState, Order } from "@rr/engine2";
import { sanitizePlayerOrders, type LlmDecisionDebug } from "@rr/shared";
import type { LlmSlotConfig, Tribe } from "@rr/shared";
import { ordersFromChooseIds, ordersFromLlmMessageList } from "./orderFromLegal.js";
import type { ChooseIdRejection } from "@rr/shared";

export interface LlmOrdersWithDebug {
  orders: Order[];
  chooseIds: string[];
  rejectedChooseIds: readonly ChooseIdRejection[];
  debug: LlmDecisionDebug;
}

export async function generateLlmOrders(
  state: GameState,
  tribe: Tribe,
  config: LlmSlotConfig,
  tickHistory?: TickHistory,
  narrative?: NarrativeBuffer,
): Promise<LlmOrdersWithDebug> {
  const view = projectForPlayer(state, tribe);
  const kitId = state.personaKits[tribe];
  const kit = getKitForTribe(state, tribe);
  const kitBonusesText = kitId ? renderKitBonuses(kitId, kit) : undefined;
  const { result, debug } = await decideOrdersPacketWithDebug(
    view,
    config.persona ?? "opportunist",
    {
      systemPromptAppend: config.systemPrompt,
      tickHistory,
      narrative,
      kitBonusesText,
    },
  );
  const { orders: fromChoose, rejected } = ordersFromChooseIds(view, result.choose ?? []);
  const fromMessages = ordersFromLlmMessageList(view, result.messages ?? []);
  const merged = [...fromChoose, ...fromMessages];
  const orders = sanitizePlayerOrders(view.myPlayerState.influence, merged);
  return {
    orders,
    chooseIds: result.choose ?? [],
    rejectedChooseIds: rejected,
    debug: { ...debug, tribe },
  };
}
