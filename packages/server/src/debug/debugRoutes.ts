import type { FastifyInstance } from "fastify";
import type { OrderPacket, Tribe } from "@rr/shared";

import { MatchManager } from "../match/matchManager.js";
import {
  createSandboxFromMatch,
  deleteSandbox,
  getSandbox,
  listSandboxes,
} from "./sandboxMatch.js";

export async function registerDebugRoutes(
  server: FastifyInstance,
  matchManager: MatchManager,
): Promise<void> {
  server.get("/api/debug/sandboxes", async () => {
    return listSandboxes();
  });

  server.post<{
    Params: { matchId: string };
    Body: { forkAtTick: number };
  }>("/api/debug/matches/:matchId/fork", async (req, reply) => {
    if (process.env.DEBUG_API !== "true") {
      return reply.code(403).send({ error: "debug api not enabled (set DEBUG_API=true)" });
    }

    const { forkAtTick } = req.body;
    if (typeof forkAtTick !== "number" || forkAtTick < 0) {
      return reply.code(400).send({ error: "forkAtTick must be a non-negative number" });
    }

    const match = matchManager.getMatch(req.params.matchId);
    if (!match) {
      return reply.code(404).send({ error: "match not found" });
    }

    const result = createSandboxFromMatch(req.params.matchId, forkAtTick);
    if ("error" in result) {
      return reply.code(400).send({ error: result.error });
    }

    return {
      sandboxId: result.id,
      sourceMatchId: result.sourceMatchId,
      forkedAtTick: result.forkedAtTick,
      currentTick: result.state.tick,
      tribesAlive: result.state.tribesAlive,
      winner: result.state.winner,
    };
  });

  server.post<{
    Params: { sandboxId: string };
    Body: { packetsByTribe: Record<Tribe, OrderPacket> };
  }>("/api/debug/sandbox/:sandboxId/step", async (req, reply) => {
    if (process.env.DEBUG_API !== "true") {
      return reply.code(403).send({ error: "debug api not enabled" });
    }

    const sandbox = getSandbox(req.params.sandboxId);
    if (!sandbox) {
      return reply.code(404).send({ error: "sandbox not found" });
    }

    const { packetsByTribe } = req.body;
    if (!packetsByTribe || typeof packetsByTribe !== "object") {
      return reply.code(400).send({ error: "packetsByTribe required" });
    }

    try {
      const frame = sandbox.step(packetsByTribe);
      return {
        frame,
        currentTick: sandbox.state.tick,
        winner: sandbox.state.winner,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(400).send({ error: msg });
    }
  });

  server.post<{
    Params: { sandboxId: string };
    Body: {
      alternateOrders?: Record<number, Record<Tribe, OrderPacket>>;
      untilTick?: number;
    };
  }>("/api/debug/sandbox/:sandboxId/resimulate", async (req, reply) => {
    if (process.env.DEBUG_API !== "true") {
      return reply.code(403).send({ error: "debug api not enabled" });
    }

    const sandbox = getSandbox(req.params.sandboxId);
    if (!sandbox) {
      return reply.code(404).send({ error: "sandbox not found" });
    }

    const { alternateOrders = {}, untilTick } = req.body;
    const targetTick = untilTick ?? sandbox.originalTickRecords.length;

    try {
      const frames = sandbox.resimulate(alternateOrders, targetTick);
      return {
        frames,
        currentTick: sandbox.state.tick,
        winner: sandbox.state.winner,
        totalFrames: sandbox.frames.length,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(400).send({ error: msg });
    }
  });

  server.get<{
    Params: { sandboxId: string };
  }>("/api/debug/sandbox/:sandboxId", async (req, reply) => {
    if (process.env.DEBUG_API !== "true") {
      return reply.code(403).send({ error: "debug api not enabled" });
    }

    const sandbox = getSandbox(req.params.sandboxId);
    if (!sandbox) {
      return reply.code(404).send({ error: "sandbox not found" });
    }

    return {
      sandboxId: sandbox.id,
      sourceMatchId: sandbox.sourceMatchId,
      forkedAtTick: sandbox.forkedAtTick,
      currentTick: sandbox.state.tick,
      tribesAlive: sandbox.state.tribesAlive,
      winner: sandbox.state.winner,
      frameCount: sandbox.frames.length,
    };
  });

  server.get<{
    Params: { sandboxId: string };
  }>("/api/debug/sandbox/:sandboxId/frames", async (req, reply) => {
    if (process.env.DEBUG_API !== "true") {
      return reply.code(403).send({ error: "debug api not enabled" });
    }

    const sandbox = getSandbox(req.params.sandboxId);
    if (!sandbox) {
      return reply.code(404).send({ error: "sandbox not found" });
    }

    return { frames: sandbox.frames };
  });

  server.delete<{
    Params: { sandboxId: string };
  }>("/api/debug/sandbox/:sandboxId", async (req, reply) => {
    if (process.env.DEBUG_API !== "true") {
      return reply.code(403).send({ error: "debug api not enabled" });
    }

    const deleted = deleteSandbox(req.params.sandboxId);
    if (!deleted) {
      return reply.code(404).send({ error: "sandbox not found" });
    }
    return { deleted: true };
  });

  server.get<{
    Params: { matchId: string };
  }>("/api/debug/matches/:matchId/orders", async (req, reply) => {
    if (process.env.DEBUG_API !== "true") {
      return reply.code(403).send({ error: "debug api not enabled" });
    }

    const match = matchManager.getMatch(req.params.matchId);
    if (!match) {
      return reply.code(404).send({ error: "match not found" });
    }

    return {
      orders: match.tickBuffer.map((entry) => ({
        tick: entry.tickNumber,
        packetsByTribe: entry.packetsByTribe,
      })),
    };
  });
}
