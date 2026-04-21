import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { Tribe } from "@rr/shared";

import {
  buildTestApp,
  createPassMatch,
  extractTokenFromInviteLink,
  HAND_MINIMAL_TRIBES,
  humanPassRequest,
  passOnlyRequest,
  waitForMatchStatus,
} from "./helpers.js";
import type { FastifyInstance } from "fastify";
import type { MatchManager } from "../src/match/matchManager.js";
import { countTickRecordsInMatchLog } from "../src/persistence/matchLog.js";

describe("REST API", () => {
  let server: FastifyInstance;
  let matchManager: MatchManager;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const app = await buildTestApp();
    server = app.server;
    matchManager = app.matchManager;
    cleanup = app.cleanup;
  });

  afterEach(async () => {
    await matchManager.drain();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("GET /health returns ok", async () => {
    const res = await server.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("POST /api/matches creates a pass-only match", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/matches",
      payload: passOnlyRequest(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.matchId).toBeDefined();
    expect(body.autoPlay).toBe(true);
    expect(body.spectatorUrl).toContain("/watch/");
    expect(body.inviteLinks).toEqual({});
  });

  it("POST /api/matches with human slots returns inviteLinks", async () => {
    const req = humanPassRequest();
    const res = await server.inject({
      method: "POST",
      url: "/api/matches",
      payload: req,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.autoPlay).toBe(false);
    expect(Object.keys(body.inviteLinks)).toEqual(["orange"]);
    expect(body.inviteLinks.orange).toContain("/play/");
  });

  it("POST /api/matches/:id/join returns JWT", async () => {
    const req = humanPassRequest();
    const created = await server.inject({
      method: "POST",
      url: "/api/matches",
      payload: req,
    });
    const { matchId } = created.json();

    const res = await server.inject({
      method: "POST",
      url: `/api/matches/${matchId}/join`,
      payload: { tribe: "orange", displayName: "Test" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tribe).toBe("orange");
    expect(body.token).toBeDefined();
    expect(body.playUrl).toContain(`/play/${matchId}`);
  });

  it("POST /api/matches/:id/join for nonexistent match returns 404", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/matches/nonexistent/join",
      payload: { tribe: "orange", displayName: "Test" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /api/matches/:id with valid JWT returns PlayerMatchView", async () => {
    const req = humanPassRequest();
    const created = await server.inject({
      method: "POST",
      url: "/api/matches",
      payload: req,
    });
    const { matchId, inviteLinks } = created.json();
    const token = extractTokenFromInviteLink(inviteLinks, "orange");

    const res = await server.inject({
      method: "GET",
      url: `/api/matches/${matchId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.view).toBeDefined();
    expect(body.matchStatus).toBe("running");
    expect(body.submittedThisTick).toBe(false);
  });

  it("GET /api/matches/:id without JWT returns 401", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/matches/fake",
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/matches/:id with wrong-match JWT returns 401", async () => {
    const req = humanPassRequest();
    const created = await server.inject({
      method: "POST",
      url: "/api/matches",
      payload: req,
    });
    const { matchId, inviteLinks } = created.json();
    const token = extractTokenFromInviteLink(inviteLinks, "orange");

    const res = await server.inject({
      method: "GET",
      url: "/api/matches/different-match-id",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/matches/:id/orders returns accepted when not all submitted", async () => {
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
    const created = await server.inject({
      method: "POST",
      url: "/api/matches",
      payload: req,
    });
    const { matchId, inviteLinks } = created.json();
    const token = extractTokenFromInviteLink(inviteLinks, "orange");

    const match = matchManager.getMatch(matchId)!;
    const tick = match.state.tick;

    const res = await server.inject({
      method: "POST",
      url: `/api/matches/${matchId}/orders`,
      payload: { orders: [], tick, clientPacketId: "pkt-1" },
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("accepted");
    expect(body.pendingTribes).toContain("grey");
  });

  it("POST /api/matches/:id/orders returns resolved when last tribe submits", async () => {
    const created = await server.inject({
      method: "POST",
      url: "/api/matches",
      payload: passOnlyRequest(),
    });
    const { matchId } = created.json();

    await matchManager.drain();
    process.env.DATA_DIR = process.env.DATA_DIR;

    const match = matchManager.getMatch(matchId)!;
    expect(match.tickBuffer.length).toBeGreaterThanOrEqual(1);
  });

  it("POST /api/matches/:id/orders with stale tick returns 409", async () => {
    const tribes: readonly Tribe[] = [...HAND_MINIMAL_TRIBES];
    const req = {
      mapPreset: "hand_minimal" as const,
      tribes: [...tribes],
      slots: tribes.map((t) => ({ tribe: t, type: "human" as const })),
      tickLimit: 10,
    };
    const created = await server.inject({
      method: "POST",
      url: "/api/matches",
      payload: req,
    });
    const { matchId, inviteLinks } = created.json();
    const token = extractTokenFromInviteLink(inviteLinks, "orange");

    const res = await server.inject({
      method: "POST",
      url: `/api/matches/${matchId}/orders`,
      payload: { orders: [], tick: 999, clientPacketId: "pkt-stale" },
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("stale_tick");
  });

  it("POST /api/matches/:id/orders duplicate clientPacketId returns duplicate", async () => {
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
    const created = await server.inject({
      method: "POST",
      url: "/api/matches",
      payload: req,
    });
    const { matchId, inviteLinks } = created.json();
    const token = extractTokenFromInviteLink(inviteLinks, "orange");
    const match = matchManager.getMatch(matchId)!;
    const tick = match.state.tick;

    await server.inject({
      method: "POST",
      url: `/api/matches/${matchId}/orders`,
      payload: { orders: [], tick, clientPacketId: "pkt-dup" },
      headers: { authorization: `Bearer ${token}` },
    });

    const res = await server.inject({
      method: "POST",
      url: `/api/matches/${matchId}/orders`,
      payload: { orders: [], tick, clientPacketId: "pkt-dup" },
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("duplicate");
  });

  it("POST /api/matches/:id/orders different clientPacketId same tribe returns 409", async () => {
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
    const created = await server.inject({
      method: "POST",
      url: "/api/matches",
      payload: req,
    });
    const { matchId, inviteLinks } = created.json();
    const token = extractTokenFromInviteLink(inviteLinks, "orange");
    const match = matchManager.getMatch(matchId)!;
    const tick = match.state.tick;

    await server.inject({
      method: "POST",
      url: `/api/matches/${matchId}/orders`,
      payload: { orders: [], tick, clientPacketId: "pkt-a" },
      headers: { authorization: `Bearer ${token}` },
    });

    const res = await server.inject({
      method: "POST",
      url: `/api/matches/${matchId}/orders`,
      payload: { orders: [], tick, clientPacketId: "pkt-b" },
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("conflict_packet");
  });

  it("GET /api/matches/:id/spectator returns SpectatorView for autoPlay match", async () => {
    const res_created = await server.inject({
      method: "POST",
      url: "/api/matches",
      payload: passOnlyRequest(),
    });
    const { matchId } = res_created.json();

    const res = await server.inject({
      method: "GET",
      url: `/api/matches/${matchId}/spectator`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tick).toBeDefined();
    expect(body.regions).toBeDefined();
  });

  it("GET /api/matches/:id/spectator/history returns tick array", async () => {
    const res_created = await server.inject({
      method: "POST",
      url: "/api/matches",
      payload: passOnlyRequest(),
    });
    const { matchId } = res_created.json();

    const res = await server.inject({
      method: "GET",
      url: `/api/matches/${matchId}/spectator/history`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.ticks)).toBe(true);
    expect(body.matchStatus).toBeDefined();
  });

  it("GET /api/matches returns array of match summaries", async () => {
    await server.inject({
      method: "POST",
      url: "/api/matches",
      payload: passOnlyRequest(),
    });

    const res = await server.inject({ method: "GET", url: "/api/matches" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0].matchId).toBeDefined();
    expect(body[0].autoPlay).toBe(true);
  });

  it("DELETE /api/matches/:id on running match stops it", async () => {
    const req = humanPassRequest();
    const created = await server.inject({
      method: "POST",
      url: "/api/matches",
      payload: req,
    });
    const { matchId } = created.json();

    const res = await server.inject({
      method: "DELETE",
      url: `/api/matches/${matchId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().stopped).toBe(true);

    const match = matchManager.getMatch(matchId);
    expect(match?.status).toBe("finished");
  });

  it("DELETE /api/matches/:id on finished match deletes it", async () => {
    const created = await server.inject({
      method: "POST",
      url: "/api/matches",
      payload: passOnlyRequest({ tickLimit: 3 }),
    });
    const { matchId } = created.json();

    await waitForMatchStatus(matchManager, matchId, "finished", 30_000);

    const res = await server.inject({
      method: "DELETE",
      url: `/api/matches/${matchId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().deleted).toBe(true);
    expect(matchManager.getMatch(matchId)).toBeUndefined();
  });

  it("DELETE /api/matches/:id on nonexistent returns 404", async () => {
    const res = await server.inject({
      method: "DELETE",
      url: "/api/matches/nonexistent",
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /api/matches/:id/spectator for nonexistent returns 404", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/matches/nonexistent/spectator",
    });
    expect(res.statusCode).toBe(404);
  });
});
