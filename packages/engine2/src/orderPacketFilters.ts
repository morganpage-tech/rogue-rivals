/**
 * Client-side order packet cleanup mirroring what we want humans and LLMs to respect
 * before calling `tick()`: duplicate moves for the same force are meaningless (only
 * the first can apply), then influence budgeting (see influenceBudget.ts).
 */

import { filterOrdersByInfluenceBudget } from "./influenceBudget.js";
import type { Order } from "./types.js";

/** Keep the first `move` for each `forceId` in packet order; drop later duplicates. */
export function dedupeMovesOnePerForce(orders: readonly Order[]): Order[] {
  const seen = new Set<string>();
  const out: Order[] = [];
  for (const o of orders) {
    if (o.kind === "move") {
      if (seen.has(o.forceId)) continue;
      seen.add(o.forceId);
    }
    out.push(o);
  }
  return out;
}

/**
 * Dedupe moves, then drop orders that would fail for insufficient Influence
 * (two-phase resolution in `tick()`).
 */
export function sanitizePlayerOrders(
  startInfluence: number,
  orders: readonly Order[],
): Order[] {
  return filterOrdersByInfluenceBudget(
    startInfluence,
    dedupeMovesOnePerForce(orders),
  );
}

/** True if `sanitizePlayerOrders` would remove at least one order. */
export function wouldClipOrders(
  startInfluence: number,
  orders: readonly Order[],
): boolean {
  return sanitizePlayerOrders(startInfluence, orders).length < orders.length;
}
