import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { Tribe } from "@rr/shared";

import { issuePlayerToken } from "../src/auth/jwt.js";
import {
  buildTestApp,
  connectPlayerWs,
  extractTokenFromInviteLink,
  HAND_MINIMAL_TRIBES,
  humanPassRequest,
  passOnlyRequest,
  waitForMatchStatus,
  waitForWsMessage,
  wsClose,
  wsOpen,
  wsSend,
} from "./helpers.js";
import { jwtSecret } from "../src/match/matchManager.js";
import type { FastifyInstance } from "fastify";
import type { MatchManager } from "../src/match/matchManager.js";

describe("Player WebSocket", () => {
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
    await cleanup();
  });

  it("sends initial view after valid auth", async () => {
    const req = humanPassRequest();
    const created = matchManager.createMatch(req);
    const token = extractTokenFromInviteLink(created.inviteLinks, "orange");

    const { ws, initialView } = await connectPlayerWs(port, created.matchId, token);
    expect(initialView.type).toBe("view");
    expect(initialView.projectedView).toBeDefined();
    expect(initialView.tick).toBe(0);

    ws.close();
  });

  it("closes with 4401 when no auth within timeout", async () => {
    const req = humanPassRequest();
    const created = matchManager.createMatch(req);

    const ws = await wsOpen(`ws://127.0.0.1:${port}/ws/play?matchId=${created.matchId}`);

    const { code } = await wsClose(ws, 10_000);
    expect(code).toBe(4401);
  }, 10_000);

  it("closes with 4401 when first message is not auth", async () => {
    const req = humanPassRequest();
    const created = matchManager.createMatch(req);

    const ws = await wsOpen(`ws://127.0.0.1:${port}/ws/play?matchId=${created.matchId}`);
    wsSend(ws, { type: "heartbeat" });

    const { code } = await wsClose(ws, 5_000);
    expect(code).toBe(4401);
  });

  it("closes with 4401 for invalid JWT", async () => {
    const req = humanPassRequest();
    const created = matchManager.createMatch(req);

    const ws = await wsOpen(`ws://127.0.0.1:${port}/ws/play?matchId=${created.matchId}`);
    wsSend(ws, { type: "auth", token: "garbage" });

    const { code } = await wsClose(ws, 5_000);
    expect(code).toBe(4401);
  });

  it("closes with 4401 for JWT with wrong matchId", async () => {
    const req = humanPassRequest();
    const created = matchManager.createMatch(req);

    const wrongToken = issuePlayerToken(
      jwtSecret(),
      "different-match-id",
      "orange" as Tribe,
      Math.floor(Date.now() / 1000) + 3600,
    );

    const ws = await wsOpen(`ws://127.0.0.1:${port}/ws/play?matchId=${created.matchId}`);
    wsSend(ws, { type: "auth", token: wrongToken });

    const { code } = await wsClose(ws, 5_000);
    expect(code).toBe(4401);
  });

  it("closes with 4004 for nonexistent match", async () => {
    const ws = await wsOpen(`ws://127.0.0.1:${port}/ws/play?matchId=nonexistent`);
    const { code } = await wsClose(ws, 5_000);
    expect(code).toBe(4004);
  });

  it("receives view update after tick resolution", async () => {
    const req = humanPassRequest();
    const created = matchManager.createMatch(req);
    const token = extractTokenFromInviteLink(created.inviteLinks, "orange");

    const { ws } = await connectPlayerWs(port, created.matchId, token);

    const match = matchManager.getMatch(created.matchId)!;

    const tribes: readonly Tribe[] = [...HAND_MINIMAL_TRIBES];
    for (const t of tribes.slice(1)) {
      match.submittedOrders.set(t, {
        clientPacketId: `server:${match.state.tick}:${t}`,
        tick: match.state.tick,
        orders: [],
        acceptedResponse: { status: "accepted", pendingTribes: [] },
      });
    }

    await matchManager.submitOrders(
      created.matchId,
      "orange",
      [],
      match.state.tick,
      "pkt-player-view",
    );

    const viewMsg = await waitForWsMessage(ws, "view", 5_000);
    expect(viewMsg.tick).toBeGreaterThan(0);

    ws.close();
  });

  it("receives waiting_for after another tribe submits", async () => {
    const tribes: readonly Tribe[] = [...HAND_MINIMAL_TRIBES];
    const req = {
      mapPreset: "hand_minimal" as const,
      tribes: [...tribes],
      slots: [
        { tribe: "orange" as Tribe, type: "human" as const },
        { tribe: "grey" as Tribe, type: "human" as const },
        ...tribes.slice(2).map((t) => ({ tribe: t, type: "pass" as const })),
      ],
      tickLimit: 10,
    };
    const created = matchManager.createMatch(req);
    const orangeToken = extractTokenFromInviteLink(created.inviteLinks, "orange");

    const { ws } = await connectPlayerWs(port, created.matchId, orangeToken);

    await matchManager.submitOrders(
      created.matchId,
      "grey",
      [],
      matchManager.getMatch(created.matchId)!.state.tick,
      "pkt-grey",
    );

    const msg = await waitForWsMessage(ws, "waiting_for", 5_000);
    expect(msg.tribes).toBeDefined();

    ws.close();
  });
});
