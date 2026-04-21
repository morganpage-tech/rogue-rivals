import type { WebSocket } from "ws";

import type { MatchManager } from "../match/matchManager.js";

export function handleSpectatorConnection(
  socket: WebSocket,
  matchId: string,
  matchManager: MatchManager,
): void {
  const match = matchManager.getMatch(matchId);
  if (!match) {
    socket.close(4004, "Match not found");
    return;
  }

  const history = match.tickBuffer.map((e) => e.spectatorView);
  socket.send(
    JSON.stringify({
      type: "spectator_history",
      ticks: history,
      matchStatus: match.status,
    }),
  );

  matchManager.registerSpectatorSocket(matchId, socket);

  if (match.status === "finished") {
    socket.send(
      JSON.stringify({
        type: "spectator_match_end",
        winner: match.state.winner,
      }),
    );
  }

  socket.on("close", () => {
    matchManager.unregisterSpectatorSocket(matchId, socket);
  });
}
