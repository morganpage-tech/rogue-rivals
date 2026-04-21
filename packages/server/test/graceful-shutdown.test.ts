import { afterEach, describe, expect, it, vi } from "vitest";

import { readFileSync } from "node:fs";

import {
  buildTestApp,
  makeTempDir,
  passOnlyRequest,
  removeDir,
  waitForMatchStatus,
} from "./helpers.js";

describe("graceful shutdown", () => {
  let dataDir: string;
  const prevDataDir = process.env.DATA_DIR;

  afterEach(() => {
    if (prevDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prevDataDir;
    vi.resetModules();
    if (dataDir) removeDir(dataDir);
  });

  it("drain finishes autoPlay and writes match_end to JSONL", async () => {
    dataDir = makeTempDir();
    process.env.DATA_DIR = dataDir;
    vi.resetModules();

    const { buildApp } = await import("../src/index.js");
    const { server, matchManager } = await buildApp({ logger: false });

    const created = matchManager.createMatch(passOnlyRequest({ tickLimit: 60 }));

    await new Promise<void>((resolve) => {
      const check = () => {
        const m = matchManager.getMatch(created.matchId);
        if (m && m.tickBuffer.length >= 3) return resolve();
        setTimeout(check, 15);
      };
      check();
    });

    await matchManager.drain({ timeoutMs: 30_000 });
    await server.close();

    const lines = readFileSync(`${dataDir}/${created.matchId}.jsonl`, "utf8")
      .split("\n")
      .filter(Boolean);
    const kinds = lines.map((l) => JSON.parse(l).kind);

    expect(kinds[0]).toBe("match_init");
    expect(kinds.filter((k) => k === "tick").length).toBeGreaterThanOrEqual(3);
  });

  it("drain stops autoplay loop cleanly", async () => {
    dataDir = makeTempDir();
    process.env.DATA_DIR = dataDir;
    vi.resetModules();

    const { buildApp } = await import("../src/index.js");
    const { server, matchManager } = await buildApp({ logger: false });

    matchManager.createMatch(passOnlyRequest({ tickLimit: 60 }));

    await matchManager.drain({ timeoutMs: 30_000 });
    await server.close();

    for (const m of matchManager.listMatches()) {
      const match = matchManager.getMatch(m.matchId);
      expect(match?.acceptingWork).toBe(false);
    }
  });
});
