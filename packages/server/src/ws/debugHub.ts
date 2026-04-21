import type { WebSocket } from "ws";

import type { MatchManager } from "../match/matchManager.js";

export function handleDebugConnection(
  socket: WebSocket,
  matchId: string,
  matchManager: MatchManager,
): void {
  const match = matchManager.getMatch(matchId);
  if (!match) {
    socket.close(4004, "Match not found");
    return;
  }

  socket.send(
    JSON.stringify({
      type: "debug_history",
      ticks: match.debugBuffer,
      matchStatus: match.status,
    }),
  );

  matchManager.registerDebugSocket(matchId, socket);

  if (match.status === "finished") {
    socket.send(
      JSON.stringify({
        type: "debug_match_end",
        winner: match.state.winner,
      }),
    );
  }

  socket.on("close", () => {
    matchManager.unregisterDebugSocket(matchId, socket);
  });
}
