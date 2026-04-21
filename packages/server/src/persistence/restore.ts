import {
  DEFAULT_MATCH_CONFIG,
  initMatch,
  projectForPlayer,
  projectForSpectator,
  tick,
} from "@rr/engine2";
import type { GameState } from "@rr/engine2";
import type { CreateMatchRequest, ProjectedView, Tribe } from "@rr/shared";

import type { TickBufferEntry } from "../match/activeMatch.js";
import type { MatchLogRecord } from "./matchLog.js";

export interface ReplayResult {
  matchId: string;
  slotConfig: CreateMatchRequest;
  seed: number;
  tickTimeoutSeconds: number;
  state: GameState;
  tickBuffer: TickBufferEntry[];
  finished: boolean;
}

function parseLines(rawLines: string[]): MatchLogRecord[] {
  const out: MatchLogRecord[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw) as MatchLogRecord);
    } catch (e) {
      if (i === rawLines.length - 1) {
        console.warn(
          `[restore] ignoring malformed final log line (line ${i} of ${rawLines.length}): ${String(e)}`,
        );
        continue;
      }
      throw new Error(`[restore] unparseable log line ${i}: ${String(e)}`);
    }
  }
  return out;
}

export function replayMatchFromLog(rawLines: string[]): ReplayResult {
  const records = parseLines(rawLines);
  if (records.length === 0) throw new Error("[restore] empty match log");

  const first = records[0];
  if (first.kind !== "match_init") {
    throw new Error(
      `[restore] first record must be match_init, got ${first.kind}`,
    );
  }

  const tickLimit = first.slotConfig.tickLimit ?? 60;
  const config = {
    ...DEFAULT_MATCH_CONFIG,
    seed: first.seed,
    mapPreset: first.mapPreset,
    tribes: first.slotConfig.tribes,
    tickLimit,
  };

  let state: GameState = initMatch(config);
  const tickBuffer: TickBufferEntry[] = [];
  let finished = false;

  for (let i = 1; i < records.length; i++) {
    const rec = records[i];
    if (rec.kind === "tick") {
      const result = tick(state, rec.packetsByTribe);
      if (result.stateHash !== rec.stateHash) {
        throw new Error(
          `[restore] engine drift in ${first.matchId} at tick ${rec.tick}: ` +
            `stored hash ${rec.stateHash} != recomputed ${result.stateHash}`,
        );
      }

      const spec = projectForSpectator(result.state, result.events, { tickLimit });
      const projectedViews = {} as Record<Tribe, ProjectedView>;
      for (const t of result.state.tribesAlive) {
        projectedViews[t] = projectForPlayer(result.state, t);
      }

      tickBuffer.push({
        tickNumber: result.state.tick,
        stateHash: result.stateHash,
        spectatorView: spec,
        projectedViews,
        events: [...result.events],
        packetsByTribe: rec.packetsByTribe,
      });
      state = result.state;
    } else if (rec.kind === "match_end") {
      finished = true;
    }
  }

  return {
    matchId: first.matchId,
    slotConfig: first.slotConfig,
    seed: first.seed,
    tickTimeoutSeconds: first.tickTimeoutSeconds,
    state,
    tickBuffer,
    finished,
  };
}
