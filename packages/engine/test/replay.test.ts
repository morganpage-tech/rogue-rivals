import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { initMatch } from "../src/init.js";
import { RES_KEYS, type Tribe } from "../src/rules.js";
import type { MatchState } from "../src/state.js";
import { replayOneTurn } from "../src/replay.js";
import type { SimTurnEvent } from "../src/replay.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BATCH_PATH = path.resolve(__dirname, "../../../simulations/batch_v0.7.3.jsonl");

interface BatchMatch {
  match_id: string;
  seed: number;
  config: { turn_order: string[] };
  players: Array<{ id: string; tribe: string }>;
  rounds: Array<{ events: unknown[] }>;
  outcome: {
    winner_ids: string[];
    end_trigger: string;
    final_scores: Record<string, number>;
    shared_victory: boolean;
  };
  aggregates: {
    buildings_by_player: Record<string, string[]>;
    resources_held_at_end: Record<string, Record<string, number>>;
  };
}

function loadMatches(): BatchMatch[] {
  const text = readFileSync(BATCH_PATH, "utf8");
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as BatchMatch);
}

function assertSnapshotMatchesLog(
  state: MatchState,
  outcome: BatchMatch["outcome"],
  aggregates: BatchMatch["aggregates"],
): void {
  expect(state.matchEnded).toBe(true);
  expect(state.endTrigger).toBe(outcome.end_trigger);

  const w = [...outcome.winner_ids].sort();
  const winners = computeWinnersFromState(state, outcome);
  expect([...winners].sort()).toEqual(w);

  for (const pid of Object.keys(outcome.final_scores)) {
    expect(state.players[pid]?.vp).toBe(outcome.final_scores[pid]);
  }

  for (const pid of state.seatPlayerIds) {
    const snap = state.players[pid]!;
    const logScore = outcome.final_scores[pid];
    expect(snap.vp).toBe(logScore);
    const logBuildings = [...(aggregates.buildings_by_player[pid] ?? [])].sort();
    expect([...snap.buildings].sort()).toEqual(logBuildings);
    const logRes = aggregates.resources_held_at_end[pid];
    if (logRes) {
      for (const k of RES_KEYS) {
        expect(snap.resources[k]).toBe(logRes[k] ?? 0);
      }
    }
  }
}

function computeWinnersFromState(
  state: MatchState,
  outcome: BatchMatch["outcome"],
): string[] {
  const ids = [...state.seatPlayerIds];
  ids.sort((a, b) => {
    const pa = state.players[a]!;
    const pb = state.players[b]!;
    if (pb.vp !== pa.vp) return pb.vp - pa.vp;
    if (pb.buildings.length !== pa.buildings.length) {
      return pb.buildings.length - pa.buildings.length;
    }
    if (pb.partnersTraded.length !== pa.partnersTraded.length) {
      return pb.partnersTraded.length - pa.partnersTraded.length;
    }
    return a.localeCompare(b);
  });
  const top = ids[0]!;
  const topVp = state.players[top]!.vp;
  const tied = ids.filter((p) => state.players[p]!.vp === topVp);
  if (tied.length === 1) return [tied[0]!];
  const mb = Math.max(...tied.map((p) => state.players[p]!.buildings.length));
  const t2 = tied.filter((p) => state.players[p]!.buildings.length === mb);
  if (t2.length === 1) return [t2[0]!];
  const mp = Math.max(...t2.map((p) => state.players[p]!.partnersTraded.length));
  const t3 = t2.filter((p) => state.players[p]!.partnersTraded.length === mp);
  if (t3.length === 1) return [t3[0]!];
  if (outcome.shared_victory) return [...t3].sort();
  return [...outcome.winner_ids];
}

describe("v0.7.3 replay determinism", () => {
  const matches = loadMatches();
  expect(matches.length).toBe(50);

  for (const m of matches) {
    test(`match ${m.match_id} replays to identical final state`, () => {
      const seats = m.players.map((p) => ({
        playerId: p.id,
        tribe: p.tribe as Tribe,
      }));
      let state = initMatch({
        seed: m.seed,
        seats,
        turnOrder: m.config.turn_order,
      });
      const now = new Date(0);
      for (const rnd of m.rounds) {
        for (const ev of rnd.events) {
          const e = ev as { type?: string };
          if (e.type === "turn") {
            state = replayOneTurn(state, ev as SimTurnEvent, now);
          }
        }
      }

      assertSnapshotMatchesLog(state, m.outcome, m.aggregates);
    });
  }
});
