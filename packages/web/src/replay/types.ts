/**
 * JSON shape aligned with `packages/engine2` `buildReplayPayload` output
 * (snake_case in `state` and `projected_views`).
 */

export interface ReplayMeta {
  trace_path?: string;
  map_kind: string;
  seed: number;
  match_idx?: number;
  tick_final: number;
  winner?: unknown;
  roster: string[];
  warnings: string[];
}

export interface OrderRow {
  kind: string;
  payload?: Record<string, unknown>;
}

export interface OrderPacketRow {
  tribe: string;
  tick: number;
  orders: OrderRow[];
}

export interface TickSummary {
  messages: unknown[];
  diplomacy: unknown[];
}

export interface ReplayFrame {
  tick: number;
  label: string;
  state_hash?: string | null;
  orders_by_tribe: Record<string, OrderPacketRow>;
  resolution_events: unknown[];
  tick_summary: TickSummary;
  projected_views: Record<string, unknown>;
  state: unknown;
}

export interface ReplayPayload {
  meta: ReplayMeta;
  layout: Record<string, readonly [number, number]>;
  terrain_fill: Record<string, string>;
  tribe_stroke: Record<string, string>;
  frames: ReplayFrame[];
}
