import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import type { WebSocket } from "ws";

import type { CreateMatchRequest, JoinMatchRequest, SubmitOrdersRequest } from "@rr/shared";

import { verifyPlayerToken } from "./auth/jwt.js";
import { ensureDataDir } from "./persistence/matchLog.js";
import { jwtSecret, MatchManager } from "./match/matchManager.js";
import { handlePlayerConnection } from "./ws/playerHub.js";
import { handleSpectatorConnection } from "./ws/spectatorHub.js";
import { handleDebugConnection } from "./ws/debugHub.js";

/** Load env regardless of process cwd (e.g. starting `node dist/index.js` from the repo root). */
const _serverDir = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(_serverDir, "../.env") });
loadEnv({ path: join(_serverDir, "../../..", ".env") });

function jwtSecretValue(): string {
  return jwtSecret();
}

async function main(): Promise<void> {
  ensureDataDir();

  const matchManager = new MatchManager();
  matchManager.restoreMatches();

  const server = Fastify({ logger: true });

  await server.register(cors, { origin: true });
  await server.register(websocket);

  server.get("/health", async () => ({ ok: true }));

  server.get("/api/matches", async () => {
    return matchManager.listMatches();
  });

  server.delete<{ Params: { id: string } }>("/api/matches/:id", async (req, reply) => {
    const ok = matchManager.stopMatch(req.params.id);
    if (!ok) return reply.code(404).send({ error: "not found or not running" });
    return { stopped: true, matchId: req.params.id };
  });

  server.post<{ Body: CreateMatchRequest }>("/api/matches", async (req, reply) => {
    try {
      return matchManager.createMatch(req.body);
    } catch (e) {
      req.log.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(400).send({ error: msg });
    }
  });

  server.post<{ Params: { id: string }; Body: JoinMatchRequest }>(
    "/api/matches/:id/join",
    async (req, reply) => {
      const r = matchManager.joinMatch(req.params.id, req.body.tribe, req.body.displayName);
      if (!r) return reply.code(404).send({ error: "not found" });
      return r;
    },
  );

  server.get<{ Params: { id: string }; Headers: { authorization?: string } }>(
    "/api/matches/:id",
    async (req, reply) => {
      const auth = req.headers.authorization;
      if (!auth?.startsWith("Bearer ")) {
        return reply.code(401).send({ error: "unauthorized" });
      }
      const claims = verifyPlayerToken(jwtSecretValue(), auth.slice(7));
      if (!claims || claims.matchId !== req.params.id) {
        return reply.code(401).send({ error: "unauthorized" });
      }
      const v = matchManager.getPlayerView(req.params.id, claims.tribe);
      if (!v) return reply.code(404).send({ error: "not found" });
      return v;
    },
  );

  server.post<{
    Params: { id: string };
    Body: SubmitOrdersRequest;
    Headers: { authorization?: string };
  }>("/api/matches/:id/orders", async (req, reply) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const claims = verifyPlayerToken(jwtSecretValue(), auth.slice(7));
    if (!claims || claims.matchId !== req.params.id) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    try {
      return await matchManager.submitOrders(
        req.params.id,
        claims.tribe,
        req.body.orders,
        req.body.tick,
        req.body.clientPacketId,
      );
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      if (msg === "stale_tick") return reply.code(409).send({ error: "stale_tick" });
      if (msg === "conflict_packet") return reply.code(409).send({ error: "conflict_packet" });
      if (msg === "not_running") return reply.code(400).send({ error: "not_running" });
      if (msg === "not_found") return reply.code(404).send({ error: "not_found" });
      throw e;
    }
  });

  server.get<{ Params: { id: string } }>("/api/matches/:id/spectator", async (req, reply) => {
    const m = matchManager.getMatch(req.params.id);
    if (!m) return reply.code(404).send({ error: "not found" });
    const v = matchManager.getSpectatorView(req.params.id);
    if (!v) return reply.code(404).send({ error: "not found" });
    return v;
  });

  server.get<{ Params: { id: string } }>(
    "/api/matches/:id/spectator/history",
    async (req, reply) => {
      const m = matchManager.getMatch(req.params.id);
      if (!m) return reply.code(404).send({ error: "not found" });
      const ticks = matchManager.getSpectatorHistory(req.params.id);
      if (!ticks) return reply.code(404).send({ error: "not found" });
      return {
        ticks,
        matchStatus: m.status === "finished" ? "finished" : "running",
      };
    },
  );

  server.get<{ Params: { id: string } }>("/api/matches/:id/match-log", async (req, reply) => {
    const status = matchManager.getMatchLogStatus(req.params.id);
    if (!status) return reply.code(404).send({ error: "not found" });
    return status;
  });

  server.get("/ws/spectator", { websocket: true }, (socket, req) => {
    const q = req.query as Record<string, string>;
    handleSpectatorConnection(socket as WebSocket, q.matchId ?? "", matchManager);
  });

  server.get("/ws/play", { websocket: true }, (socket, req) => {
    const q = req.query as Record<string, string>;
    handlePlayerConnection(socket as WebSocket, q.matchId ?? "", matchManager);
  });

  server.get("/ws/debug", { websocket: true }, (socket, req) => {
    const q = req.query as Record<string, string>;
    handleDebugConnection(socket as WebSocket, q.matchId ?? "", matchManager);
  });

  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? "0.0.0.0";

  await server.listen({ port, host });
  server.log.info({ port, host }, "server listening");

  const shutdown = async (signal: string) => {
    server.log.info({ signal }, "shutting down");
    await matchManager.drain({ timeoutMs: 30_000 });
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
