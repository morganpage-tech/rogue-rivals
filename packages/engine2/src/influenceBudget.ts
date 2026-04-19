/**
 * Influence-only simulation for order packets: same two-phase spend model as `tick()`
 * (build/recruit/propose/respond/message, then move/scout). Used so UI and LLM agents
 * cannot queue combinations the engine would reject for `no_influence`.
 *
 * Does not model non-influence failures (garrison present, invalid target, etc.).
 */

import { FORCE_RECRUIT_COST, SCOUT_COST, STRUCTURE_COST } from "./constants.js";
import type { ForceTier, Order } from "./types.js";

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
