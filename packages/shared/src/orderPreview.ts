/**
 * Pure order-queue preview helpers — no GameState, safe for client and server.
 */

import { FORCE_RECRUIT_COST, SCOUT_COST, STRUCTURE_COST } from "./costs.js";
import type { ForceTier, Order } from "./engineTypes.js";

function phaseOneInfluenceCost(o: Order): number {
  if (o.kind === "build") {
    return STRUCTURE_COST[o.structure];
  }
  if (o.kind === "recruit") {
    return FORCE_RECRUIT_COST[o.tier as ForceTier];
  }
  return 0;
}

function phaseTwoInfluenceCost(o: Order): number {
  return o.kind === "scout" ? SCOUT_COST : 0;
}

/** True if simulating resolution would skip any order for insufficient Influence. */
export function ordersExceedInfluenceBudget(
  startInfluence: number,
  orders: readonly Order[],
): boolean {
  return filterOrdersByInfluenceBudget(startInfluence, orders).length < orders.length;
}

/**
 * Drop orders that would fail only because `influence` is too low, preserving
 * engine resolution order (phase 1 in packet order, then phase 2 in packet order).
 */
export function filterOrdersByInfluenceBudget(
  startInfluence: number,
  orders: readonly Order[],
): Order[] {
  const kept: Order[] = [];
  let inf = startInfluence;

  for (const o of orders) {
    if (
      o.kind !== "build" &&
      o.kind !== "recruit" &&
      o.kind !== "propose" &&
      o.kind !== "respond" &&
      o.kind !== "message"
    ) {
      continue;
    }
    const c = phaseOneInfluenceCost(o);
    if (c <= 0) {
      kept.push(o);
      continue;
    }
    if (inf >= c) {
      inf -= c;
      kept.push(o);
    }
  }

  for (const o of orders) {
    if (o.kind !== "move" && o.kind !== "scout") {
      continue;
    }
    const c = phaseTwoInfluenceCost(o);
    if (c <= 0) {
      kept.push(o);
      continue;
    }
    if (inf >= c) {
      inf -= c;
      kept.push(o);
    }
  }

  return kept;
}

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
