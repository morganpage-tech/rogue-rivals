import { afterEach, describe, expect, it, vi } from "vitest";

import type { SubmitOrdersResponse, Tribe } from "@rr/shared";

import {
  HAND_MINIMAL_TRIBES,
  makeTempDir,
  removeDir,
} from "./helpers.js";
import { MatchManager } from "../src/match/matchManager.js";
import { countTickRecordsInMatchLog } from "../src/persistence/matchLog.js";

function allHumanRequest(seed?: number) {
  const tribes = [...HAND_MINIMAL_TRIBES];
  return {
    mapPreset: "hand_minimal" as const,
    tribes,
    slots: tribes.map((tribe) => ({
      tribe,
      type: "human" as const,
    })),
    tickLimit: 10,
    ...(seed !== undefined ? { seed } : {}),
  };
}

describe("concurrency: per-match async lock (§4.4a)", () => {
  let dataDir: string;
  const prevDataDir = process.env.DATA_DIR;

  afterEach(() => {
    if (prevDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prevDataDir;
    vi.resetModules();
    if (dataDir) removeDir(dataDir);
  });

  it("exactly one resolution when 4 tribes submit in parallel", async () => {
    dataDir = makeTempDir();
    process.env.DATA_DIR = dataDir;
    vi.resetModules();

    const { MatchManager: MM } = await import("../src/match/matchManager.js");
    const mgr = new MM();

    const res = mgr.createMatch(allHumanRequest());
    const match = mgr.getMatch(res.matchId)!;
    const tick = match.state.tick;

    const submits = HAND_MINIMAL_TRIBES.map((tribe) =>
      mgr.submitOrders(res.matchId, tribe, [], tick, `pkt-${tribe}`),
    );

    const results = await Promise.all(submits);

    const resolvedCount = results.filter(
      (r) => (r as SubmitOrdersResponse).status === "resolved",
    ).length;
    expect(resolvedCount).toBe(1);

    const acceptedCount = results.filter(
      (r) => (r as SubmitOrdersResponse).status === "accepted",
    ).length;
    expect(acceptedCount).toBe(3);

    expect(match.state.tick).toBe(tick + 1);
    expect(match.tickBuffer.length).toBe(1);
    expect(countTickRecordsInMatchLog(res.matchId)).toBe(1);

    await mgr.drain();
  });

  it("sequential and parallel submission produce same state hash", async () => {
    const runSequential = async (): Promise<string> => {
      const dir = makeTempDir();
      process.env.DATA_DIR = dir;
      vi.resetModules();
      const { MatchManager: MM } = await import("../src/match/matchManager.js");
      const mgr = new MM();
      const res = mgr.createMatch(allHumanRequest(42));
      const match = mgr.getMatch(res.matchId)!;
      const tick = match.state.tick;
      for (const t of HAND_MINIMAL_TRIBES) {
        await mgr.submitOrders(res.matchId, t, [], tick, `seq-${t}`);
      }
      const hash = match.tickBuffer[0]?.stateHash ?? "none";
      await mgr.drain();
      removeDir(dir);
      return hash;
    };

    const runParallel = async (): Promise<string> => {
      const dir = makeTempDir();
      process.env.DATA_DIR = dir;
      vi.resetModules();
      const { MatchManager: MM } = await import("../src/match/matchManager.js");
      const mgr = new MM();
      const res = mgr.createMatch(allHumanRequest(42));
      const match = mgr.getMatch(res.matchId)!;
      const tick = match.state.tick;
      await Promise.all(
        HAND_MINIMAL_TRIBES.map((t) =>
          mgr.submitOrders(res.matchId, t, [], tick, `par-${t}`),
        ),
      );
      const hash = match.tickBuffer[0]?.stateHash ?? "none";
      await mgr.drain();
      removeDir(dir);
      return hash;
    };

    const seqHash = await runSequential();
    const parHash = await runParallel();
    expect(parHash).toBe(seqHash);
  });

  it("duplicate clientPacketId returns cached response without double-resolve", async () => {
    dataDir = makeTempDir();
    process.env.DATA_DIR = dataDir;
    vi.resetModules();

    const { MatchManager: MM } = await import("../src/match/matchManager.js");
    const mgr = new MM();

    const tribes: readonly Tribe[] = [...HAND_MINIMAL_TRIBES];
    const res = mgr.createMatch({
      mapPreset: "hand_minimal",
      tribes: [...tribes],
      slots: tribes.map((t) => ({ tribe: t, type: "human" as const })),
      tickLimit: 10,
    });
    const match = mgr.getMatch(res.matchId)!;
    const tick = match.state.tick;

    const r1 = await mgr.submitOrders(res.matchId, "orange", [], tick, "pkt-dupe");
    expect(r1.status).toBe("accepted");

    const r2 = await mgr.submitOrders(res.matchId, "orange", [], tick, "pkt-dupe");
    expect(r2.status).toBe("duplicate");

    expect(match.state.tick).toBe(tick);
    expect(countTickRecordsInMatchLog(res.matchId)).toBe(0);

    await mgr.drain();
  });

  it("different clientPacketId on same tribe/tick throws conflict_packet", async () => {
    dataDir = makeTempDir();
    process.env.DATA_DIR = dataDir;
    vi.resetModules();

    const { MatchManager: MM } = await import("../src/match/matchManager.js");
    const mgr = new MM();

    const tribes: readonly Tribe[] = [...HAND_MINIMAL_TRIBES];
    const res = mgr.createMatch({
      mapPreset: "hand_minimal",
      tribes: [...tribes],
      slots: tribes.map((t) => ({ tribe: t, type: "human" as const })),
      tickLimit: 10,
    });
    const match = mgr.getMatch(res.matchId)!;
    const tick = match.state.tick;

    await mgr.submitOrders(res.matchId, "orange", [], tick, "pkt-a");

    await expect(
      mgr.submitOrders(res.matchId, "orange", [], tick, "pkt-b"),
    ).rejects.toThrow("conflict_packet");

    expect(match.state.tick).toBe(tick);

    await mgr.drain();
  });
});
