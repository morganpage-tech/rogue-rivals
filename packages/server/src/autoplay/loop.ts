import type { Order, Tribe } from "@rr/shared";

import type { ActiveMatch } from "../match/activeMatch.js";
import { resolveTick } from "../match/resolution.js";
import { generateLlmOrders } from "./llmOpponent.js";

export async function runAutoPlayLoop(
  match: ActiveMatch,
  matchId: string,
  onResolved: (match: ActiveMatch, matchId: string) => void,
): Promise<void> {
  match.status = "running";

  while (match.acceptingWork && match.state.winner === null) {
    const tickAtStart = match.state.tick;
    const tribes = match.state.tribesAlive;

    const orderEntries = await Promise.all(
      tribes.map(async (tribe) => {
        const slot = match.slots.get(tribe)!;
        if (slot.type === "pass") return [tribe, [] as Order[]] as const;
        if (slot.type === "llm" && slot.llmConfig) {
          const { orders, debug } = await generateLlmOrders(
            match.state,
            tribe,
            slot.llmConfig,
          );
          return [tribe, orders, debug] as const;
        }
        return [tribe, [] as Order[]] as const;
      }),
    );

    if (!match.acceptingWork || match.state.winner !== null) break;

    await match.withLock(async () => {
      if (match.state.tick !== tickAtStart) return;
      if (!match.acceptingWork || match.status !== "running") return;

      for (const entry of orderEntries) {
        const tribe = entry[0] as Tribe;
        const orders = entry[1] as Order[];
        if (entry.length > 2) {
          match.pendingDecisions.push(entry[2] as import("@rr/shared").LlmDecisionDebug);
        }
        match.submittedOrders.set(tribe, {
          clientPacketId: `server:${tickAtStart}:${tribe}`,
          tick: tickAtStart,
          orders,
          acceptedResponse: { status: "accepted", pendingTribes: [] },
        });
      }

      try {
        await resolveTick(match, matchId);
        onResolved(match, matchId);
      } catch (e) {
        console.error(`[autoplay] ${matchId} resolveTick failed:`, e);
        match.acceptingWork = false;
        match.status = "finished";
      }
    });
  }
}
