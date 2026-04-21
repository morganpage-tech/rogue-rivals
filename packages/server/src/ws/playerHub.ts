import type { WebSocket } from "ws";

import { projectForPlayer } from "@rr/engine2";

import { verifyPlayerToken } from "../auth/jwt.js";
import { jwtSecret } from "../match/matchManager.js";
import type { MatchManager } from "../match/matchManager.js";

export function handlePlayerConnection(
  socket: WebSocket,
  matchId: string,
  matchManager: MatchManager,
): void {
  const match = matchManager.getMatch(matchId);
  if (!match) {
    socket.close(4004, "Match not found");
    return;
  }

  let authedTribe: import("@rr/shared").Tribe | null = null;
  const authDeadline = setTimeout(() => {
    if (authedTribe === null) socket.close(4401, "auth timeout");
  }, 5000);

  socket.once("message", (raw) => {
    clearTimeout(authDeadline);

    let msg: { type?: string; token?: string };
    try {
      msg = JSON.parse(raw.toString()) as { type?: string; token?: string };
    } catch {
      socket.close(1008, "invalid json");
      return;
    }

    if (msg.type !== "auth" || typeof msg.token !== "string") {
      socket.close(4401, "auth required first");
      return;
    }

    const claims = verifyPlayerToken(jwtSecret(), msg.token);
    if (!claims || claims.matchId !== matchId) {
      socket.close(4401, "Invalid token");
      return;
    }

    authedTribe = claims.tribe;
    const tribe = claims.tribe;

    const view = projectForPlayer(match.state, tribe);
    socket.send(
      JSON.stringify({
        type: "view",
        projectedView: view,
        tick: match.state.tick,
      }),
    );

    matchManager.registerPlayerSocket(matchId, tribe, socket);

    socket.on("message", (nextRaw) => {
      let next: { type?: string };
      try {
        next = JSON.parse(nextRaw.toString()) as { type?: string };
      } catch {
        return;
      }
      if (next.type === "heartbeat") {
        /* optional */
      }
    });

    socket.on("close", () => {
      matchManager.unregisterPlayerSocket(matchId, tribe);
    });
  });
}
