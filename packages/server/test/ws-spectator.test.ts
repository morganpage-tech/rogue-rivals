import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import WebSocket from "ws";

import {
  buildTestApp,
  passOnlyRequest,
  waitForMatchStatus,
  wsClose,
  wsOpen,
} from "./helpers.js";
import type { FastifyInstance } from "fastify";
import type { MatchManager } from "../src/match/matchManager.js";

function collectMessages(ws: WebSocket, timeoutMs = 5_000): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const msgs: Record<string, unknown>[] = [];
    const timer = setTimeout(() => {
      ws.off("message", handler);
      resolve(msgs);
    }, timeoutMs);

    function handler(raw: WebSocket.Data) {
      msgs.push(JSON.parse(raw.toString()) as Record<string, unknown>);
    }

    ws.on("message", handler);
  });
}

describe("Spectator WebSocket", () => {
  let server: FastifyInstance;
  let matchManager: MatchManager;
  let cleanup: () => Promise<void>;
  let port: number;

  beforeAll(async () => {
    const app = await buildTestApp();
    server = app.server;
    matchManager = app.matchManager;
    cleanup = app.cleanup;
    const addr = await server.listen({ port: 0, host: "127.0.0.1" });
    const u = new URL(addr);
    port = parseInt(u.port, 10);
  });

  afterAll(async () => {
    await matchManager.drain();
    await server.close();
    await cleanup();
  });

  it("receives spectator_history on connect for finished match", async () => {
    const created = matchManager.createMatch(passOnlyRequest({ tickLimit: 3 }));
    await waitForMatchStatus(matchManager, created.matchId, "finished", 30_000);

    const ws = await wsOpen(
      `ws://127.0.0.1:${port}/ws/spectator?matchId=${created.matchId}`,
    );

    const msgs = await collectMessages(ws, 3_000);
    ws.close();

    const history = msgs.find((m) => m.type === "spectator_history");
    expect(history).toBeDefined();
    expect(Array.isArray(history!.ticks)).toBe(true);
    expect(history!.matchStatus).toBe("finished");
  });

  it("receives spectator_match_end for finished match on connect", async () => {
    const created = matchManager.createMatch(passOnlyRequest({ tickLimit: 2 }));
    await waitForMatchStatus(matchManager, created.matchId, "finished", 30_000);

    const ws = await wsOpen(
      `ws://127.0.0.1:${port}/ws/spectator?matchId=${created.matchId}`,
    );

    const msgs = await collectMessages(ws, 3_000);
    ws.close();

    const endMsg = msgs.find((m) => m.type === "spectator_match_end");
    expect(endMsg).toBeDefined();
    expect(endMsg!.winner).toBeDefined();
  });

  it("receives spectator_tick for live autoPlay matches", async () => {
    const created = matchManager.createMatch(
      passOnlyRequest({ tickLimit: 200, mapPreset: "continent6p" }),
    );

    await new Promise((r) => setTimeout(r, 50));

    const ws = await wsOpen(
      `ws://127.0.0.1:${port}/ws/spectator?matchId=${created.matchId}`,
    );

    const msgs = await collectMessages(ws, 15_000);
    ws.close();
    await matchManager.drain();

    const tickMsg = msgs.find((m) => m.type === "spectator_tick");
    const endMsg = msgs.find((m) => m.type === "spectator_match_end");

    if (tickMsg) {
      expect(tickMsg.view).toBeDefined();
      expect(tickMsg.tickNumber).toBeGreaterThanOrEqual(1);
    } else {
      expect(endMsg).toBeDefined();
      const histMsg = msgs.find((m) => m.type === "spectator_history");
      expect(histMsg).toBeDefined();
      expect(Array.isArray(histMsg!.ticks)).toBe(true);
    }
  }, 25_000);

  it("closes with 4004 for nonexistent match", async () => {
    const ws = await wsOpen(
      `ws://127.0.0.1:${port}/ws/spectator?matchId=nonexistent`,
    );
    const { code } = await wsClose(ws, 5_000);
    expect(code).toBe(4004);
  });
});
