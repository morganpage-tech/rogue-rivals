import type { LegalOrderOption, Order, ProjectedView, Tribe } from "@rr/engine2";
import { orderFromLegalOption } from "../ordersFromLegal.js";

/** `message:to:text` lines sometimes appear inside `choose` (batch agent parity). */
function mistakenMessageFromChooseId(rawId: string, view: ProjectedView): Order | null {
  if (!rawId.startsWith("message:")) return null;
  const rest = rawId.slice("message:".length);
  const colon = rest.indexOf(":");
  if (colon < 1) return null;
  const to = rest.slice(0, colon) as Tribe;
  const text = rest.slice(colon + 1);
  if (!view.tribesAlive.includes(to) || to === view.forTribe) return null;
  if (!text.trim()) return null;
  return { kind: "message", to, text: text.slice(0, 400) };
}

function optionIdLookupKeys(rawId: string): string[] {
  const s = rawId.trim();
  if (!s) return [];
  const keys = [s];
  const parts = s.split(":");
  if (parts.length >= 4 && parts[parts.length - 1]!.match(/^\d+$/)) {
    if (parts[0] === "propose" && parts[1] === "nap") {
      keys.push(parts.slice(0, -1).join(":"));
    } else if (parts[0] === "propose" && parts[1] === "shared_vision") {
      keys.push(parts.slice(0, -1).join(":"));
    }
  }
  const colonCount = (s.match(/:/g) ?? []).length;
  if (s.startsWith("propose:trade_offer:") && colonCount === 2) {
    keys.push(`${s}:5`);
  }
  return keys;
}

/**
 * Map LLM `choose` id strings to engine orders using the current tick's legal list
 * (tools/v2/llm_agent.py `_orders_from_option_ids`).
 */
export function ordersFromChooseIds(view: ProjectedView, chooseIds: readonly string[]): Order[] {
  const optionMap = new Map<string, LegalOrderOption>(
    view.legalOrderOptions.map((o) => [o.id, o]),
  );
  const orders: Order[] = [];
  const seenRaw = new Set<string>();
  const seenLegalId = new Set<string>();

  for (const rawId of chooseIds) {
    if (typeof rawId !== "string") continue;
    const trimmed = rawId.trim();
    if (!trimmed || seenRaw.has(trimmed)) continue;
    seenRaw.add(trimmed);

    const mistaken = mistakenMessageFromChooseId(trimmed, view);
    if (mistaken) {
      orders.push(mistaken);
      continue;
    }

    let opt: LegalOrderOption | undefined;
    for (const key of optionIdLookupKeys(trimmed)) {
      opt = optionMap.get(key);
      if (opt) break;
    }
    if (!opt) continue;
    if (seenLegalId.has(opt.id)) continue;
    seenLegalId.add(opt.id);
    try {
      orders.push(orderFromLegalOption(opt));
    } catch {
      /* drop invalid */
    }
  }
  return orders;
}

export function ordersFromLlmMessageList(
  view: ProjectedView,
  messages: readonly { to: string; text: string }[],
): Order[] {
  const alive = new Set(view.tribesAlive);
  const orders: Order[] = [];
  for (const m of messages) {
    const to = m.to as Tribe;
    if (!alive.has(to) || to === view.forTribe) continue;
    const text = typeof m.text === "string" ? m.text : "";
    if (!text.trim()) continue;
    orders.push({ kind: "message", to, text: text.slice(0, 400) });
  }
  return orders;
}
