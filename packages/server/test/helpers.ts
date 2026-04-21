import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { vi } from "vitest";
import type { FastifyInstance } from "fastify";
import WebSocket from "ws";

import type {
  CreateMatchRequest,
  CreateMatchResponse,
  Tribe,
} from "@rr/shared";

import type { MatchManager } from "../src/match/matchManager.js";
import { buildApp } from "../src/index.js";

export function makeTempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "rr-test-"));
}

export function removeDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export async function buildTestApp(): Promise<{
  server: FastifyInstance;
  matchManager: MatchManager;
  dataDir: string;
  cleanup: () => Promise<void>;
}> {
  const dataDir = makeTempDir();
  process.env.DATA_DIR = dataDir;
  vi.resetModules();

  const { server, matchManager } = await buildApp({ logger: false });

  return {
    server,
    matchManager,
    dataDir,
    cleanup: async () => {
      await server.close();
      removeDir(dataDir);
      delete process.env.DATA_DIR;
    },
  };
}

export const HAND_MINIMAL_TRIBES: readonly Tribe[] = [
  "orange",
  "grey",
  "brown",
  "red",
] as const;

export function passOnlyRequest(
  overrides?: Partial<CreateMatchRequest>,
): CreateMatchRequest {
  const tribes = [...HAND_MINIMAL_TRIBES];
  return {
    mapPreset: "hand_minimal",
    tribes,
    slots: tribes.map((tribe) => ({ tribe, type: "pass" as const })),
    tickLimit: 10,
    ...overrides,
  };
}

export function humanPassRequest(): CreateMatchRequest {
  const tribes = [...HAND_MINIMAL_TRIBES];
  return {
    mapPreset: "hand_minimal",
    tribes,
    slots: tribes.map((tribe, i) => ({
      tribe,
      type: (i === 0 ? "human" : "pass") as const,
    })),
    tickLimit: 10,
  };
}

export function createPassMatch(mgr: MatchManager): CreateMatchResponse {
  return mgr.createMatch(passOnlyRequest());
}

export function waitForMatchStatus(
  mgr: MatchManager,
  matchId: string,
  status: "lobby" | "running" | "finished",
  timeoutMs = 30_000,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const step = () => {
      const m = mgr.getMatch(matchId);
      if (!m) return reject(new Error("match missing"));
      if (m.status === status) return resolve();
      if (Date.now() > deadline)
        return reject(new Error(`timeout: status=${m.status}, wanted=${status}`));
      setTimeout(step, 15);
    };
    step();
  });
}

export function waitForTickCount(
  mgr: MatchManager,
  matchId: string,
  count: number,
  timeoutMs = 30_000,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const step = () => {
      const m = mgr.getMatch(matchId);
      if (!m) return reject(new Error("match missing"));
      if (m.tickBuffer.length >= count) return resolve();
      if (Date.now() > deadline)
        return reject(
          new Error(`timeout: tickBuffer.length=${m.tickBuffer.length}, wanted>=${count}`),
        );
      setTimeout(step, 15);
    };
    step();
  });
}

export function waitForWsMessage<T = Record<string, unknown>>(
  ws: WebSocket,
  type: string,
  timeoutMs = 5_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", handler);
      reject(new Error(`waitForWsMessage timeout: type=${type}`));
    }, timeoutMs);

    function handler(raw: WebSocket.Data) {
      const msg = JSON.parse(raw.toString()) as { type: string } & Record<string, unknown>;
      if (msg.type === type) {
        clearTimeout(timer);
        ws.off("message", handler);
        resolve(msg as T);
      }
    }

    ws.on("message", handler);
  });
}

export function wsOpen(url: string, timeoutMs = 5_000): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("ws open timeout")), timeoutMs);
    const ws = new WebSocket(url);
    ws.once("open", () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export function wsClose(ws: WebSocket, timeoutMs = 3_000): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ code: -1, reason: "timeout" }), timeoutMs);
    ws.once("close", (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });
  });
}

export function wsSend(ws: WebSocket, msg: Record<string, unknown>): void {
  ws.send(JSON.stringify(msg));
}

export interface PlayerAuthResult {
  ws: WebSocket;
  initialView: { type: "view"; projectedView: unknown; tick: number };
}

export async function connectPlayerWs(
  port: number,
  matchId: string,
  token: string,
): Promise<PlayerAuthResult> {
  const ws = await wsOpen(`ws://127.0.0.1:${port}/ws/play?matchId=${matchId}`);
  wsSend(ws, { type: "auth", token });
  const initialView = await waitForWsMessage(ws, "view");
  return { ws, initialView };
}

export function extractTokenFromInviteLink(inviteLinks: Record<string, string>, tribe: Tribe): string {
  const link = inviteLinks[tribe];
  const url = new URL(link);
  return url.searchParams.get("token")!;
}
