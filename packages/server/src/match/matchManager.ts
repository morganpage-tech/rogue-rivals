import { randomUUID } from "node:crypto";

import {
  DEFAULT_MATCH_CONFIG,
  initMatch,
  projectForPlayer,
  projectForSpectator,
} from "@rr/engine2";
import type { GameState, MatchConfig } from "@rr/engine2";
import { assertLlmEnvironmentConfigured } from "@rr/llm";
import type {
  CreateMatchRequest,
  CreateMatchResponse,
  JoinMatchResponse,
  MatchLogStatusResponse,
  PlayerMatchView,
  SharedMatchSummary,
  SubmitOrdersResponse,
} from "@rr/shared";
import type { Order, Tribe } from "@rr/shared";
import type { WebSocket } from "ws";

import { issuePlayerToken } from "../auth/jwt.js";
import { runAutoPlayLoop } from "../autoplay/loop.js";
import {
  appendMatchEnd,
  appendMatchInit,
  countTickRecordsInMatchLog,
  deleteMatchLog,
  getDataDir,
  listMatchLogFiles,
  matchLogAbsolutePath,
  readMatchLogLines,
} from "../persistence/matchLog.js";
import { replayMatchFromLog } from "../persistence/restore.js";
import { resolveTick } from "./resolution.js";
import {
  ActiveMatch,
  type SlotInfo,
} from "./activeMatch.js";

function publicOrigin(): string {
  return process.env.PUBLIC_ORIGIN ?? "http://127.0.0.1:5173";
}

export function jwtSecret(): string {
  return process.env.JWT_SECRET ?? "dev-secret";
}

function matchExpiresSec(): number {
  return Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
}

function toMatchConfig(req: CreateMatchRequest): MatchConfig {
  const tickLimit = req.tickLimit ?? 60;
  return {
    ...DEFAULT_MATCH_CONFIG,
    seed: req.seed ?? Math.floor(Math.random() * 0x7fffffff),
    mapPreset: req.mapPreset,
    tribes: req.tribes,
    tickLimit,
  };
}

/** Human tribes that have not POSTed orders for the current engine tick. */
function humansWaitingOnTick(match: ActiveMatch): Tribe[] {
  const st = match.state;
  const out: Tribe[] = [];
  for (const t of st.tribesAlive) {
    const slot = match.slots.get(t)!;
    if (slot.type !== "human") continue;
    const sub = match.submittedOrders.get(t);
    if (!sub || sub.tick !== st.tick) out.push(t);
  }
  return out;
}

function allHumansSubmitted(match: ActiveMatch): boolean {
  return humansWaitingOnTick(match).length === 0;
}

export class MatchManager {
  private matches = new Map<string, ActiveMatch>();

  getMatch(matchId: string): ActiveMatch | undefined {
    return this.matches.get(matchId);
  }

  listMatches(): SharedMatchSummary[] {
    const out: SharedMatchSummary[] = [];
    for (const [id, m] of this.matches) {
      out.push({
        matchId: id,
        status: m.status,
        tick: m.state.tick,
        tickLimit: m.slotConfig.tickLimit ?? 60,
        tribesAlive: [...m.state.tribesAlive],
        winner: m.state.winner,
        mapPreset: m.slotConfig.mapPreset,
        autoPlay: m.autoPlay,
        createdAt: null,
      });
    }
    return out;
  }

  async stopMatch(matchId: string): Promise<boolean> {
    const match = this.matches.get(matchId);
    if (!match || (match.status !== "running" && match.status !== "lobby" && match.status !== "paused")) return false;
    match.acceptingWork = false;
    if (match.tickTimeoutTimer) {
      clearTimeout(match.tickTimeoutTimer);
      match.tickTimeoutTimer = null;
    }
    await match.withLock(async () => {});
    match.status = "finished";
    appendMatchEnd(matchId, {
      kind: "match_end",
      winner: match.state.winner,
      finishedAt: new Date().toISOString(),
    });
    this.broadcastMatchEnd(match);
    return true;
  }

  resumeMatch(matchId: string): boolean {
    const match = this.matches.get(matchId);
    if (!match || match.status !== "paused") return false;
    match.status = "running";
    if (match.autoPlay) {
      void runAutoPlayLoop(match, matchId, (m, id) => {
        this.afterTickResolved(m, id);
      });
    } else {
      this.scheduleTickTimeout(match);
    }
    return true;
  }

  async deleteMatch(matchId: string): Promise<boolean> {
    const match = this.matches.get(matchId);
    if (!match || match.status !== "finished") return false;

    match.acceptingWork = false;
    if (match.tickTimeoutTimer) {
      clearTimeout(match.tickTimeoutTimer);
      match.tickTimeoutTimer = null;
    }
    await match.withLock(async () => {});

    for (const ws of match.spectatorSockets) {
      try { ws.close(4001, "match deleted"); } catch { /* */ }
    }
    for (const ws of match.debugSockets) {
      try { ws.close(4001, "match deleted"); } catch { /* */ }
    }
    for (const ws of match.playerSockets.values()) {
      try { ws.close(4001, "match deleted"); } catch { /* */ }
    }

    this.matches.delete(matchId);
    deleteMatchLog(matchId);
    return true;
  }

  createMatch(request: CreateMatchRequest): CreateMatchResponse {
    if (request.slots.some((s) => s.type === "llm" && s.llmConfig)) {
      assertLlmEnvironmentConfigured();
    }
    const matchId = randomUUID();
    const autoPlay = request.slots.every((s) => s.type !== "human");
    const tickTimeoutSeconds =
      request.tickTimeoutSeconds ??
      (request.slots.some((s) => s.type === "human") ? 300 : 0);

    const config = toMatchConfig(request);
    const state = initMatch(config);

    const slots = new Map<Tribe, SlotInfo>();
    for (const sc of request.slots) {
      slots.set(sc.tribe, {
        tribe: sc.tribe,
        type: sc.type,
        displayName: sc.displayName,
        llmConfig: sc.llmConfig,
      });
    }

    const match = new ActiveMatch(
      matchId,
      request,
      state,
      slots,
      autoPlay,
      tickTimeoutSeconds,
    );

    const origin = publicOrigin();
    const inviteLinks = {} as Record<Tribe, string>;
    const exp = matchExpiresSec();
    const secret = jwtSecret();

    for (const sc of request.slots) {
      if (sc.type === "human") {
        const token = issuePlayerToken(secret, matchId, sc.tribe, exp);
        const s = slots.get(sc.tribe)!;
        s.jwt = token;
        inviteLinks[sc.tribe] = `${origin}/play/${matchId}?token=${encodeURIComponent(token)}`;
      }
    }

    this.matches.set(matchId, match);

    appendMatchInit(matchId, {
      kind: "match_init",
      matchId,
      seed: config.seed,
      mapPreset: request.mapPreset,
      slotConfig: request,
      tickTimeoutSeconds,
      createdAt: new Date().toISOString(),
    });

    match.status = "running";
    if (!autoPlay) {
      this.scheduleTickTimeout(match);
    }

    if (autoPlay) {
      void runAutoPlayLoop(match, matchId, (m, id) => {
        this.afterTickResolved(m, id);
      });
    }

    return {
      matchId,
      spectatorUrl: `${origin}/watch/${matchId}`,
      inviteLinks,
      autoPlay,
    };
  }

  scheduleTickTimeout(match: ActiveMatch): void {
    if (match.tickTimeoutSeconds <= 0 || match.status !== "running") return;
    if (match.tickTimeoutTimer) clearTimeout(match.tickTimeoutTimer);
    match.tickTimeoutTimer = setTimeout(() => {
      void this.onTickTimeout(match.id);
    }, match.tickTimeoutSeconds * 1000);
  }

  private async onTickTimeout(matchId: string): Promise<void> {
    const match = this.matches.get(matchId);
    if (!match || match.status !== "running") return;

    const scheduledForTick = match.state.tick;

    await match.withLock(async () => {
      if (match.state.tick !== scheduledForTick) return;

      for (const tribe of match.state.tribesAlive) {
        const slot = match.slots.get(tribe)!;
        if (slot.type !== "human") continue;
        if (match.submittedOrders.has(tribe)) continue;
        const id = `server:${match.state.tick}:${tribe}:timeout`;
        match.submittedOrders.set(tribe, {
          clientPacketId: id,
          tick: match.state.tick,
          orders: [],
          acceptedResponse: { status: "accepted", pendingTribes: [] },
        });
      }

      if (!allHumansSubmitted(match)) return;

      await resolveTick(match, matchId);
      this.afterTickResolved(match, matchId);
    });
  }

  /** Called after every successful `resolveTick` (human, timeout, or autoplay). */
  afterTickResolved(match: ActiveMatch, matchId: string): void {
    this.broadcastTick(match);
    this.broadcastDebugTick(match);
    if (match.state.winner !== null) {
      appendMatchEnd(matchId, {
        kind: "match_end",
        winner: match.state.winner,
        finishedAt: new Date().toISOString(),
      });
      this.broadcastMatchEnd(match);
    } else if (match.status === "running") {
      this.scheduleTickTimeout(match);
    }
  }

  private broadcastTick(match: ActiveMatch): void {
    const last = match.tickBuffer[match.tickBuffer.length - 1];
    if (!last) return;

    const enc = JSON.stringify;
    for (const ws of match.spectatorSockets) {
      if (ws.readyState === 1) {
        ws.send(
          enc({
            type: "spectator_tick",
            view: last.spectatorView,
            tickNumber: last.tickNumber,
          }),
        );
      }
    }

    for (const [tribe, ws] of match.playerSockets) {
      const pv = last.projectedViews[tribe];
      if (pv && ws.readyState === 1) {
        ws.send(
          enc({
            type: "view",
            projectedView: pv,
            tick: match.state.tick,
          }),
        );
      }
    }
  }

  private broadcastMatchEnd(match: ActiveMatch): void {
    const enc = JSON.stringify;
    const p1 = enc({
      type: "spectator_match_end",
      winner: match.state.winner,
    });
    const p2 = enc({ type: "match_end", winner: match.state.winner });
    for (const ws of match.spectatorSockets) {
      if (ws.readyState === 1) ws.send(p1);
    }
    for (const ws of match.playerSockets.values()) {
      if (ws.readyState === 1) ws.send(p2);
    }
    const debugEnd = enc({ type: "debug_match_end", winner: match.state.winner });
    for (const ws of match.debugSockets) {
      if (ws.readyState === 1) ws.send(debugEnd);
    }
  }

  private broadcastDebugTick(match: ActiveMatch): void {
    const last = match.debugBuffer[match.debugBuffer.length - 1];
    if (!last) return;
    const msg = JSON.stringify({ type: "debug_tick", tick: last });
    for (const ws of match.debugSockets) {
      if (ws.readyState === 1) ws.send(msg);
    }
  }

  registerDebugSocket(matchId: string, ws: WebSocket): void {
    this.matches.get(matchId)?.debugSockets.add(ws);
  }

  unregisterDebugSocket(matchId: string, ws: WebSocket): void {
    this.matches.get(matchId)?.debugSockets.delete(ws);
  }

  joinMatch(
    matchId: string,
    tribe: Tribe,
    displayName: string,
  ): JoinMatchResponse | null {
    const match = this.matches.get(matchId);
    if (!match) return null;
    const slot = match.slots.get(tribe);
    if (!slot || slot.type !== "human") return null;
    slot.displayName = displayName;
    slot.joinedAt = new Date();
    const token =
      slot.jwt ??
      issuePlayerToken(jwtSecret(), matchId, tribe, matchExpiresSec());
    slot.jwt = token;
    const origin = publicOrigin();
    return {
      tribe,
      token,
      playUrl: `${origin}/play/${matchId}`,
    };
  }

  async submitOrders(
    matchId: string,
    tribe: Tribe,
    orders: Order[],
    clientTick: number,
    clientPacketId: string,
  ): Promise<SubmitOrdersResponse> {
    const match = this.matches.get(matchId);
    if (!match) throw new Error("not_found");

    const { sanitizePlayerOrders } = await import("@rr/shared");

    let shouldResolve = false;

    const phase1 = await match.withLock(async () => {
      if (match.status !== "running") throw new Error("not_running");
      if (clientTick !== match.state.tick) throw new Error("stale_tick");

      const existing = match.submittedOrders.get(tribe);
      if (existing && existing.tick === clientTick) {
        if (existing.clientPacketId === clientPacketId) {
          return { kind: "dup" as const, body: existing.acceptedResponse };
        }
        throw new Error("conflict_packet");
      }

      const inf = match.state.players[tribe]!.influence;
      const clean = sanitizePlayerOrders(inf, orders);

      match.submittedOrders.set(tribe, {
        clientPacketId,
        tick: clientTick,
        orders: clean,
        acceptedResponse: { status: "accepted", pendingTribes: [] },
      });

      const waiting = humansWaitingOnTick(match);
      const sub = match.submittedOrders.get(tribe)!;
      sub.acceptedResponse = { status: "accepted", pendingTribes: waiting };

      this.broadcastWaiting(match, waiting);

      if (allHumansSubmitted(match)) {
        shouldResolve = true;
      }
      return { kind: "ok" as const, body: sub.acceptedResponse };
    });

    if (phase1.kind === "dup") {
      return { ...phase1.body, status: "duplicate" };
    }

    if (!shouldResolve) {
      return phase1.body;
    }

    await match.withLock(async () => {
      await resolveTick(match, matchId);
      this.afterTickResolved(match, matchId);
    });

    const last = match.tickBuffer[match.tickBuffer.length - 1];
    return {
      status: "resolved",
      view: last?.projectedViews[tribe],
    };
  }

  private broadcastWaiting(match: ActiveMatch, pending: Tribe[]): void {
    const msg = JSON.stringify({
      type: "waiting_for",
      tribes: pending,
      tick: match.state.tick,
    });
    for (const ws of match.playerSockets.values()) {
      if (ws.readyState === 1) ws.send(msg);
    }
  }

  getPlayerView(matchId: string, tribe: Tribe): PlayerMatchView | null {
    const match = this.matches.get(matchId);
    if (!match) return null;
    return {
      view: projectForPlayer(match.state as GameState, tribe),
      submittedThisTick: !!match.submittedOrders.get(tribe),
      waitingFor: humansWaitingOnTick(match),
      matchStatus: match.status,
    };
  }

  getSpectatorView(matchId: string) {
    const match = this.matches.get(matchId);
    if (!match) return null;
    const last = match.tickBuffer[match.tickBuffer.length - 1];
    if (last) return last.spectatorView;
    const tickLimit = match.slotConfig.tickLimit ?? 60;
    return projectForSpectator(match.state as GameState, [], { tickLimit });
  }

  getSpectatorHistory(matchId: string) {
    const match = this.matches.get(matchId);
    if (!match) return null;
    return match.tickBuffer.map((e) => e.spectatorView);
  }

  getMatchLogStatus(matchId: string): MatchLogStatusResponse | null {
    const match = this.matches.get(matchId);
    if (!match) return null;
    const tickRecordsOnDisk = countTickRecordsInMatchLog(matchId);
    const tickBufferLength = match.tickBuffer.length;
    return {
      dataDir: getDataDir(),
      absolutePath: matchLogAbsolutePath(matchId),
      tickRecordsOnDisk,
      tickBufferLength,
      inSync: tickRecordsOnDisk === tickBufferLength,
    };
  }

  registerPlayerSocket(matchId: string, tribe: Tribe, ws: WebSocket): void {
    const m = this.matches.get(matchId);
    if (!m) return;
    const old = m.playerSockets.get(tribe);
    if (old && old !== ws) {
      try {
        old.close(4000, "replaced");
      } catch {
        /* ignore */
      }
    }
    m.playerSockets.set(tribe, ws);
  }

  unregisterPlayerSocket(matchId: string, tribe: Tribe): void {
    this.matches.get(matchId)?.playerSockets.delete(tribe);
  }

  registerSpectatorSocket(matchId: string, ws: WebSocket): void {
    this.matches.get(matchId)?.spectatorSockets.add(ws);
  }

  unregisterSpectatorSocket(matchId: string, ws: WebSocket): void {
    this.matches.get(matchId)?.spectatorSockets.delete(ws);
  }

  restoreMatches(): void {
    for (const file of listMatchLogFiles()) {
      const matchId = file.split("/").pop()!.replace(".jsonl", "");
      if (this.matches.has(matchId)) continue;

      const lines = readMatchLogLines(matchId);
      if (lines.length === 0) continue;

      let replay: ReturnType<typeof replayMatchFromLog>;
      try {
        replay = replayMatchFromLog(lines);
      } catch (e) {
        console.error(`[restore] skipping ${matchId}:`, e);
        continue;
      }

      const slots = new Map<Tribe, SlotInfo>();
      for (const sc of replay.slotConfig.slots) {
        slots.set(sc.tribe, {
          tribe: sc.tribe,
          type: sc.type,
          displayName: sc.displayName,
          llmConfig: sc.llmConfig,
        });
      }

      const autoPlay = replay.slotConfig.slots.every((s) => s.type !== "human");

      const match = new ActiveMatch(
        matchId,
        replay.slotConfig,
        replay.state,
        slots,
        autoPlay,
        replay.tickTimeoutSeconds,
      );
      match.tickBuffer = replay.tickBuffer;
      match.narrativeBuffers = replay.narrativeBuffers;
      match.prevTickState = replay.prevTickState;
      match.prevTickEvents = replay.prevTickEvents;
      const isFinished = replay.finished || match.state.winner !== null;
      match.status = isFinished ? "finished" : "paused";
      this.matches.set(matchId, match);
    }
  }

  async drain(options?: { timeoutMs?: number }): Promise<void> {
    const timeoutMs = options?.timeoutMs ?? 30_000;
    const pending: Promise<void>[] = [];

    for (const [matchId, match] of this.matches) {
      if (match.status === "finished") continue;

      match.acceptingWork = false;
      if (match.tickTimeoutTimer) {
        clearTimeout(match.tickTimeoutTimer);
        match.tickTimeoutTimer = null;
      }

      pending.push(
        match.withLock(async () => {
          match.status = "finished";
          appendMatchEnd(matchId, {
            kind: "match_end",
            winner: match.state.winner,
            finishedAt: new Date().toISOString(),
          });
          this.broadcastMatchEnd(match);
        }),
      );
    }

    const timeout = new Promise<void>((resolve) =>
      setTimeout(resolve, timeoutMs),
    );
    await Promise.race([Promise.allSettled(pending), timeout]);
  }
}
