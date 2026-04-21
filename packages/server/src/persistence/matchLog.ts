import fs from "node:fs";
import path from "node:path";

import type {
  CreateMatchRequest,
  MapPreset,
  OrderPacket,
  ResolutionEvent,
  Tribe,
} from "@rr/shared";

/** Resolved at call time so tests can set `process.env.DATA_DIR` before first write. */
export function getDataDir(): string {
  return path.resolve(process.env.DATA_DIR ?? "./data/matches");
}

export type MatchInitRecord = {
  kind: "match_init";
  matchId: string;
  seed: number;
  mapPreset: MapPreset;
  slotConfig: CreateMatchRequest;
  /** Effective value after server-side defaults are resolved (300 if any human, else 0). Persisted so restore is defaults-agnostic. */
  tickTimeoutSeconds: number;
  createdAt: string;
};

export type TickRecord = {
  kind: "tick";
  tick: number;
  packetsByTribe: Record<Tribe, OrderPacket>;
  stateHash: string;
  events: ResolutionEvent[];
};

export type MatchEndRecord = {
  kind: "match_end";
  winner: Tribe | Tribe[] | null;
  finishedAt: string;
};

export type MatchLogRecord =
  | MatchInitRecord
  | TickRecord
  | MatchEndRecord;

function linePath(matchId: string): string {
  return path.join(getDataDir(), `${matchId}.jsonl`);
}

/** Absolute path to this match's append-only JSONL log. */
export function matchLogAbsolutePath(matchId: string): string {
  return path.resolve(linePath(matchId));
}

/** Number of `{ kind: "tick" }` lines in the log file. */
export function countTickRecordsInMatchLog(matchId: string): number {
  const lines = readMatchLogLines(matchId);
  let n = 0;
  for (const line of lines) {
    try {
      const row = JSON.parse(line) as { kind?: string };
      if (row.kind === "tick") n += 1;
    } catch {
      /* ignore malformed line */
    }
  }
  return n;
}

/**
 * After each `appendPacketTick`, the file must contain exactly `expectedTickRecords` tick lines
 * (equal to `tickBuffer.length` on the match).
 */
export function assertMatchLogTickCount(matchId: string, expectedTickRecords: number): void {
  const n = countTickRecordsInMatchLog(matchId);
  if (n !== expectedTickRecords) {
    throw new Error(
      `Match log out of sync for ${matchId}: JSONL has ${n} tick record(s), expected ${expectedTickRecords} (see ${matchLogAbsolutePath(matchId)})`,
    );
  }
}

export function ensureDataDir(): void {
  fs.mkdirSync(getDataDir(), { recursive: true });
}

export function appendMatchInit(matchId: string, init: MatchInitRecord): void {
  ensureDataDir();
  fs.appendFileSync(linePath(matchId), JSON.stringify(init) + "\n");
}

export function appendPacketTick(matchId: string, entry: TickRecord): void {
  ensureDataDir();
  fs.appendFileSync(linePath(matchId), JSON.stringify(entry) + "\n");
}

export function appendMatchEnd(matchId: string, end: MatchEndRecord): void {
  ensureDataDir();
  fs.appendFileSync(linePath(matchId), JSON.stringify(end) + "\n");
}

export function listMatchLogFiles(): string[] {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => path.join(dir, f));
}

export function readMatchLogLines(matchId: string): string[] {
  const p = linePath(matchId);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf8").split("\n").filter(Boolean);
}
