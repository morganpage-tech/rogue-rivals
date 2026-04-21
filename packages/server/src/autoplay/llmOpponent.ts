import { decideOrdersPacketJson } from "@rr/llm";
import { projectForPlayer } from "@rr/engine2";
import type { GameState, Order } from "@rr/engine2";
import { sanitizePlayerOrders } from "@rr/shared";
import type { LlmSlotConfig, Tribe } from "@rr/shared";
import { ordersFromChooseIds, ordersFromLlmMessageList } from "./orderFromLegal.js";

export async function generateLlmOrders(
  state: GameState,
  tribe: Tribe,
  config: LlmSlotConfig,
): Promise<Order[]> {
  const view = projectForPlayer(state, tribe);
  const json = await decideOrdersPacketJson(view, config.persona ?? "opportunist", {
    systemPromptAppend: config.systemPrompt,
  });
  const fromChoose = ordersFromChooseIds(view, json.choose ?? []);
  const fromMessages = ordersFromLlmMessageList(view, json.messages ?? []);
  const merged = [...fromChoose, ...fromMessages];
  return sanitizePlayerOrders(view.myPlayerState.influence, merged);
}
