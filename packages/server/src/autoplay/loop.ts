import type { Order } from "@rr/shared";

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
    await match.withLock(async () => {
      const tickAtStart = match.state.tick;

      const tribes = match.state.tribesAlive;
      const orderEntries = await Promise.all(
        tribes.map(async (tribe) => {
          const slot = match.slots.get(tribe)!;
          if (slot.type === "pass") return [tribe, [] as Order[]] as const;
          if (slot.type === "llm" && slot.llmConfig) {
            const orders = await generateLlmOrders(
              match.state,
              tribe,
              slot.llmConfig,
            );
            return [tribe, orders] as const;
          }
          return [tribe, [] as Order[]] as const;
        }),
      );

      for (const [tribe, orders] of orderEntries) {
        match.submittedOrders.set(tribe, {
          clientPacketId: `server:${tickAtStart}:${tribe}`,
          tick: tickAtStart,
          orders,
          acceptedResponse: { status: "accepted", pendingTribes: [] },
        });
      }

      await resolveTick(match, matchId);
      onResolved(match, matchId);
    });
  }
}
