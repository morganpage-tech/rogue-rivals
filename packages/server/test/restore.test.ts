import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

import type { CreateMatchRequest, Tribe } from "@rr/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

const CONTINENT_6: readonly Tribe[] = [
  "arctic",
  "tricoloured",
  "red",
  "brown",
  "orange",
  "grey",
];

async function freshMatchManager() {
  vi.resetModules();
  const { MatchManager } = await import("../src/match/matchManager.js");
  return new MatchManager();
}

describe("restoreMatches", () => {
  const prevDataDir = process.env.DATA_DIR;

  afterEach(() => {
    if (prevDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prevDataDir;
    vi.resetModules();
  });

  it("rehydrates a finished autoPlay match from disk with identical tick buffer", async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "rr-restore-"));
    process.env.DATA_DIR = tmp;

    try {
      const req: CreateMatchRequest = {
        seed: 424242,
        mapPreset: "continent6p",
        tribes: [...CONTINENT_6],
        tickLimit: 5,
        slots: CONTINENT_6.map((tribe) => ({ tribe, type: "pass" as const })),
      };

      const mgr1 = await freshMatchManager();
      const { matchId } = mgr1.createMatch(req);

      await new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + 30_000;
        const step = () => {
          const m = mgr1.getMatch(matchId);
          if (!m) return reject(new Error("match missing"));
          if (m.status === "finished") return resolve();
          if (Date.now() > deadline) {
            return reject(new Error(`timeout status=${m.status}`));
          }
          setTimeout(step, 15);
        };
        step();
      });

      const origMatch = mgr1.getMatch(matchId)!;
      const origTicks = origMatch.tickBuffer.length;
      const origFinalHash = origMatch.tickBuffer[origTicks - 1]!.stateHash;
      await mgr1.drain();

      const mgr2 = await freshMatchManager();
      mgr2.restoreMatches();
      const restored = mgr2.getMatch(matchId);

      expect(restored).toBeDefined();
      expect(restored!.status).toBe("finished");
      expect(restored!.autoPlay).toBe(true);
      expect(restored!.tickBuffer.length).toBe(origTicks);
      expect(restored!.tickBuffer[origTicks - 1]!.stateHash).toBe(origFinalHash);
      expect(restored!.tickTimeoutSeconds).toBe(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("restores an in-progress match missing match_end and auto-resumes", async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "rr-restore-paused-"));
    process.env.DATA_DIR = tmp;

    try {
      const req: CreateMatchRequest = {
        seed: 424242,
        mapPreset: "continent6p",
        tribes: [...CONTINENT_6],
        tickLimit: 5,
        slots: CONTINENT_6.map((tribe) => ({ tribe, type: "pass" as const })),
      };

      const mgr1 = await freshMatchManager();
      const { matchId } = mgr1.createMatch(req);

      await new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + 30_000;
        const step = () => {
          const m = mgr1.getMatch(matchId);
          if (!m) return reject(new Error("match missing"));
          if (m.status === "finished") return resolve();
          if (Date.now() > deadline) {
            return reject(new Error(`timeout status=${m.status}`));
          }
          setTimeout(step, 15);
        };
        step();
      });

      await mgr1.drain();

      const logPath = path.join(tmp, `${matchId}.jsonl`);
      const raw = readFileSync(logPath, "utf8");
      const linesAll = raw.split("\n").filter(Boolean);
      const withoutEnd = linesAll.filter((l) => !l.includes('"kind":"match_end"'));
      const truncated = withoutEnd.slice(0, 2);
      writeFileSync(logPath, truncated.join("\n") + "\n");

      const mgr2 = await freshMatchManager();
      mgr2.restoreMatches();
      const restored = mgr2.getMatch(matchId);
      expect(restored).toBeDefined();
      expect(restored!.status).toBe("running");
      expect(restored!.tickBuffer.length).toBeGreaterThanOrEqual(1);
      await mgr2.drain();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("drives a restored in-progress autoPlay match to completion without manual resume", { timeout: 30_000 }, async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "rr-restore-resume-"));
    process.env.DATA_DIR = tmp;

    try {
      const req: CreateMatchRequest = {
        seed: 424242,
        mapPreset: "continent6p",
        tribes: [...CONTINENT_6],
        tickLimit: 5,
        slots: CONTINENT_6.map((tribe) => ({ tribe, type: "pass" as const })),
      };

      const mgr1 = await freshMatchManager();
      const { matchId } = mgr1.createMatch(req);

      await new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + 30_000;
        const step = () => {
          const m = mgr1.getMatch(matchId);
          if (!m) return reject(new Error("match missing"));
          if (m.status === "finished") return resolve();
          if (Date.now() > deadline) {
            return reject(new Error(`timeout status=${m.status}`));
          }
          setTimeout(step, 15);
        };
        step();
      });

      await mgr1.drain();

      const logPath = path.join(tmp, `${matchId}.jsonl`);
      const raw = readFileSync(logPath, "utf8");
      const linesAll = raw.split("\n").filter(Boolean);
      const withoutEnd = linesAll.filter((l) => !l.includes('"kind":"match_end"'));
      const truncated = withoutEnd.slice(0, 2);
      writeFileSync(logPath, truncated.join("\n") + "\n");

      const mgr2 = await freshMatchManager();
      mgr2.restoreMatches();
      const restored = mgr2.getMatch(matchId);
      expect(restored).toBeDefined();
      expect(restored!.status).toBe("running");

      await new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + 30_000;
        const step = () => {
          if (restored!.status === "finished") return resolve();
          if (Date.now() > deadline) {
            return reject(new Error(`resume timeout status=${restored!.status}`));
          }
          setTimeout(step, 25);
        };
        step();
      });
      expect(restored!.status).toBe("finished");
      await mgr2.drain();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("throws clearly on stored-hash drift", async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "rr-restore-drift-"));
    process.env.DATA_DIR = tmp;

    try {
      const req: CreateMatchRequest = {
        seed: 7,
        mapPreset: "continent6p",
        tribes: [...CONTINENT_6],
        tickLimit: 3,
        slots: CONTINENT_6.map((tribe) => ({ tribe, type: "pass" as const })),
      };

      const mgr1 = await freshMatchManager();
      const { matchId } = mgr1.createMatch(req);
      await new Promise<void>((resolve) => {
        const step = () => {
          if (mgr1.getMatch(matchId)?.status === "finished") return resolve();
          setTimeout(step, 10);
        };
        step();
      });
      await mgr1.drain();

      // Corrupt one stored stateHash on disk.
      const logPath = path.join(tmp, `${matchId}.jsonl`);
      const lines = readFileSync(logPath, "utf8").split("\n").filter(Boolean);
      const idx = lines.findIndex((l) => l.includes('"kind":"tick"'));
      expect(idx).toBeGreaterThan(0);
      lines[idx] = lines[idx]!.replace(/"stateHash":"[^"]+"/, '"stateHash":"deadbeef"');
      writeFileSync(logPath, lines.join("\n") + "\n");

      const { replayMatchFromLog } = await import("../src/persistence/restore.js");
      expect(() => replayMatchFromLog(lines)).toThrow(/engine drift/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
