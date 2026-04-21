import { mkdtempSync, rmSync } from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";

import type { CreateMatchRequest, Tribe } from "@rr/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Default 6-tribe roster for `continent6p` (same as engine `CONTINENT_6P_DEFAULT_TRIBES`). */
const CONTINENT_6: readonly Tribe[] = [
  "arctic",
  "tricoloured",
  "red",
  "brown",
  "orange",
  "grey",
];

describe("match log vs tickBuffer (continent6p, ≥50 ticks)", () => {
  const prevDataDir = process.env.DATA_DIR;

  afterEach(() => {
    if (prevDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prevDataDir;
    vi.resetModules();
  });

  it(
    "keeps JSONL tick records aligned after many ticks on the large map",
    async () => {
      const tmpDir = mkdtempSync(path.join(tmpdir(), "rr-mlsync-"));
      process.env.DATA_DIR = tmpDir;
      vi.resetModules();

      const { MatchManager } = await import("../src/match/matchManager.js");
      const { countTickRecordsInMatchLog } = await import("../src/persistence/matchLog.js");

      const req: CreateMatchRequest = {
        mapPreset: "continent6p",
        tribes: [...CONTINENT_6],
        tickLimit: 120,
        slots: CONTINENT_6.map((tribe) => ({ tribe, type: "pass" as const })),
      };
      const mgr = new MatchManager();
      const { matchId } = mgr.createMatch(req);

      await new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + 90_000;
        const step = () => {
          const m = mgr.getMatch(matchId);
          if (!m) {
            reject(new Error("match missing"));
            return;
          }
          if (m.tickBuffer.length >= 50) {
            resolve();
            return;
          }
          if (Date.now() > deadline) {
            reject(new Error(`timeout with tickBuffer=${m.tickBuffer.length}`));
            return;
          }
          setTimeout(step, 15);
        };
        step();
      });

      const m = mgr.getMatch(matchId);
      expect(m).toBeDefined();
      const bufLen = m!.tickBuffer.length;
      expect(bufLen).toBeGreaterThanOrEqual(50);

      expect(countTickRecordsInMatchLog(matchId)).toBe(bufLen);

      const st = mgr.getMatchLogStatus(matchId);
      expect(st).not.toBeNull();
      expect(st!.inSync).toBe(true);
      expect(st!.tickRecordsOnDisk).toBe(st!.tickBufferLength);
      expect(st!.tickBufferLength).toBeGreaterThanOrEqual(50);

      await mgr.drain();

      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
    120_000,
  );
});
