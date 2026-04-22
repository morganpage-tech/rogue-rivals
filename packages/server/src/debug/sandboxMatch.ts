import { randomUUID } from "node:crypto";

import {
  cloneState,
  initMatch,
  projectForPlayer,
  projectForSpectator,
  rebuildStateAtTick,
  tick,
  DEFAULT_MATCH_CONFIG,
} from "@rr/engine2";
import type { GameState } from "@rr/engine2";
import type {
  OrderPacket,
  ProjectedView,
  ResolutionEvent,
  SpectatorView,
  Tribe,
} from "@rr/shared";

import type { MatchLogRecord } from "../persistence/matchLog.js";
import { readMatchLogLines } from "../persistence/matchLog.js";

export interface SandboxTickFrame {
  tickNumber: number;
  stateHash: string;
  spectatorView: SpectatorView;
  projectedViews: Record<Tribe, ProjectedView>;
  events: ResolutionEvent[];
  packetsByTribe: Record<Tribe, OrderPacket>;
}

export class SandboxMatch {
  readonly id: string;
  readonly sourceMatchId: string;
  readonly forkedAtTick: number;
  readonly originalTickRecords: Array<{
    tick: number;
    packetsByTribe: Record<Tribe, OrderPacket>;
  }>;
  readonly tickLimit: number;

  state: GameState;
  frames: SandboxTickFrame[];

  constructor(
    id: string,
    sourceMatchId: string,
    forkedAtTick: number,
    state: GameState,
    originalTickRecords: Array<{
      tick: number;
      packetsByTribe: Record<Tribe, OrderPacket>;
    }>,
    tickLimit: number,
  ) {
    this.id = id;
    this.sourceMatchId = sourceMatchId;
    this.forkedAtTick = forkedAtTick;
    this.state = state;
    this.originalTickRecords = originalTickRecords;
    this.tickLimit = tickLimit;
    this.frames = [];
  }

  step(packetsByTribe: Record<Tribe, OrderPacket>): SandboxTickFrame {
    const cloned = cloneState(this.state);
    const result = tick(cloned, packetsByTribe);

    const spec = projectForSpectator(result.state, result.events, {
      tickLimit: this.tickLimit,
    });
    const projectedViews = {} as Record<Tribe, ProjectedView>;
    for (const t of result.state.tribesAlive) {
      projectedViews[t] = projectForPlayer(result.state, t);
    }

    const frame: SandboxTickFrame = {
      tickNumber: result.state.tick,
      stateHash: result.stateHash,
      spectatorView: spec,
      projectedViews,
      events: [...result.events],
      packetsByTribe,
    };

    this.state = result.state;
    this.frames.push(frame);
    return frame;
  }

  resimulate(
    alternateOrders: Record<number, Record<Tribe, OrderPacket>>,
    untilTick: number,
  ): SandboxTickFrame[] {
    this.frames = [];

    const startTick = this.state.tick;
    const newFrames: SandboxTickFrame[] = [];

    for (let t = startTick; t < untilTick; t++) {
      const alt = alternateOrders[t];
      const packets =
        alt ?? this.originalTickRecords[t]?.packetsByTribe;
      if (!packets) break;

      const frame = this.step(packets);
      newFrames.push(frame);

      if (this.state.winner !== null) break;
    }

    return newFrames;
  }
}

const sandboxes = new Map<string, SandboxMatch>();

export function getSandbox(sandboxId: string): SandboxMatch | undefined {
  return sandboxes.get(sandboxId);
}

export function deleteSandbox(sandboxId: string): boolean {
  return sandboxes.delete(sandboxId);
}

export function createSandboxFromMatch(
  matchId: string,
  forkAtTick: number,
): SandboxMatch | { error: string } {
  const lines = readMatchLogLines(matchId);
  if (lines.length === 0) return { error: "match not found" };

  const records: MatchLogRecord[] = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line) as MatchLogRecord);
    } catch {
      /* skip */
    }
  }

  const init = records[0];
  if (!init || init.kind !== "match_init") return { error: "invalid match log" };

  const tickRecords = records
    .filter((r): r is Extract<typeof r, { kind: "tick" }> => r.kind === "tick")
    .map((r) => ({ tick: r.tick, packetsByTribe: r.packetsByTribe }));

  if (forkAtTick < 0 || forkAtTick > tickRecords.length) {
    return { error: `forkAtTick ${forkAtTick} out of range (0-${tickRecords.length})` };
  }

  const tickLimit = init.slotConfig.tickLimit ?? 60;
  const seed = init.seed;
  const mapPreset = init.mapPreset;
  const tribes = init.slotConfig.tribes;

  let state: GameState;
  if (forkAtTick === 0) {
    state = initMatch({
      ...DEFAULT_MATCH_CONFIG,
      seed,
      mapPreset: mapPreset as "hand_minimal" | "expanded" | "continent6p",
      tribes,
      tickLimit,
    });
  } else {
    const result = rebuildStateAtTick(
      seed,
      mapPreset,
      tribes,
      tickLimit,
      tickRecords,
      forkAtTick,
    );
    state = result.state;
  }

  const sandboxId = randomUUID();
  const sandbox = new SandboxMatch(
    sandboxId,
    matchId,
    forkAtTick,
    state,
    tickRecords,
    tickLimit,
  );

  sandboxes.set(sandboxId, sandbox);
  return sandbox;
}

export function listSandboxes(): Array<{
  id: string;
  sourceMatchId: string;
  forkedAtTick: number;
  currentTick: number;
  frameCount: number;
}> {
  return Array.from(sandboxes.values()).map((s) => ({
    id: s.id,
    sourceMatchId: s.sourceMatchId,
    forkedAtTick: s.forkedAtTick,
    currentTick: s.state.tick,
    frameCount: s.frames.length,
  }));
}
