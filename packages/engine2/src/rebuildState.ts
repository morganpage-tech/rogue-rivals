import { DEFAULT_MATCH_CONFIG, initMatch, tick } from "./index.js";
import type { GameState } from "./gameState.js";
import type { ResolutionEvent, Tribe, OrderPacket } from "@rr/shared";

export interface TickPacketRecord {
  tick: number;
  packetsByTribe: Record<Tribe, OrderPacket>;
}

export interface RebuildResult {
  state: GameState;
  events: ResolutionEvent[];
  tickCount: number;
}

export function rebuildStateAtTick(
  seed: number,
  mapPreset: string,
  tribes: Tribe[],
  tickLimit: number,
  tickRecords: TickPacketRecord[],
  targetTick: number,
): RebuildResult {
  const config = {
    ...DEFAULT_MATCH_CONFIG,
    seed,
    mapPreset: mapPreset as "hand_minimal" | "expanded" | "continent6p",
    tribes,
    tickLimit,
  };

  const state = initMatch(config);
  let allEvents: ResolutionEvent[] = [];

  for (let i = 0; i < targetTick && i < tickRecords.length; i++) {
    const rec = tickRecords[i];
    const result = tick(state, rec.packetsByTribe);
    allEvents = [...allEvents, ...result.events];
  }

  return { state, events: allEvents, tickCount: Math.min(targetTick, tickRecords.length) };
}
