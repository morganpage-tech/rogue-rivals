import { readFileSync } from "node:fs";

import type { ForceTier, Order, OrderPacket, Proposal, StructureKind, Tribe } from "@rr/shared";

import {
  CONTINENT_6P_DEFAULT_TRIBES,
  DEFAULT_MATCH_CONFIG,
  initMatch,
  projectForPlayer,
  tick,
  type GameState,
} from "../index.js";
import { serializeGameStateForReplay } from "../replay/serializeGameStateForReplay.js";
import replayLayouts from "./replayLayouts.json" with { type: "json" };
import { REPLAY_TERRAIN_FILL, REPLAY_TRIBE_STROKE } from "./replayTheme.js";

const LAYOUTS = replayLayouts as unknown as Record<string, Record<string, [number, number]>>;

function normalizeOrderPayload(kind: string, payload: Record<string, unknown>): Record<string, unknown> {
  if (kind !== "propose") return payload;
  const p = { ...payload };
  const prop = { ...((p.proposal as Record<string, unknown>) ?? {}) };
  if (prop.to == null && prop.to_tribe != null) prop.to = prop.to_tribe;
  p.proposal = prop;
  return p;
}

function orderFromTraceRow(row: {
  kind: string;
  payload?: Record<string, unknown>;
}): Order {
  const pl = normalizeOrderPayload(row.kind, row.payload ?? {}) as Record<string, unknown>;
  const S = (a: string, b?: string) => String(pl[a] ?? (b ? pl[b] : ""));
  switch (row.kind) {
    case "move":
      return {
        kind: "move",
        forceId: S("force_id", "forceId"),
        destinationRegionId: S("destination_region_id", "destinationRegionId"),
      };
    case "recruit":
      return {
        kind: "recruit",
        regionId: S("region_id", "regionId"),
        tier: Number(pl.tier ?? 1) as ForceTier,
      };
    case "build": {
      const rid = S("region_id", "regionId");
      const struct = S("structure") as StructureKind;
      const rt = pl.road_target ?? pl.roadTarget;
      if (struct === "road" && typeof rt === "string" && rt) {
        return { kind: "build", regionId: rid, structure: "road", roadTarget: rt };
      }
      return { kind: "build", regionId: rid, structure: struct };
    }
    case "scout":
      return {
        kind: "scout",
        fromRegionId: S("from_region_id", "fromRegionId"),
        targetRegionId: S("target_region_id", "targetRegionId"),
      };
    case "propose": {
      const raw = (pl.proposal ?? {}) as Record<string, unknown>;
      const proposal: Proposal = {
        id: String(raw.id ?? "pending"),
        kind: raw.kind as Proposal["kind"],
        from: String(raw.from_tribe ?? raw.from ?? "") as Tribe,
        to: String(raw.to_tribe ?? raw.to ?? "") as Tribe,
        lengthTicks: Number(raw.length_ticks ?? raw.lengthTicks ?? 0),
        amountInfluence: Number(raw.amount_influence ?? raw.amountInfluence ?? 0),
        expiresTick: Number(raw.expires_tick ?? raw.expiresTick ?? 0),
      };
      return { kind: "propose", proposal };
    }
    case "respond":
      return {
        kind: "respond",
        proposalId: S("proposal_id", "proposalId"),
        response: (pl.response === "decline" ? "decline" : "accept") as "accept" | "decline",
      };
    case "message":
      return {
        kind: "message",
        to: S("to") as Tribe,
        text: String(pl.text ?? ""),
      };
    default:
      throw new Error(`unknown order kind in trace: ${row.kind}`);
  }
}

function packetsFromRecord(record: Record<string, unknown>): Record<Tribe, OrderPacket> {
  const raw = record.orders_by_tribe as Record<string, { tick: number; orders: { kind: string; payload?: Record<string, unknown> }[] }>;
  const out: Record<string, OrderPacket> = {};
  for (const [tribe, pkt] of Object.entries(raw ?? {})) {
    const orders = (pkt.orders ?? []).map((o) => orderFromTraceRow(o));
    out[tribe] = { tribe: tribe as Tribe, tick: pkt.tick, orders };
  }
  return out as Record<Tribe, OrderPacket>;
}

function tickSummaryFromRecord(record: Record<string, unknown>): { messages: unknown[]; diplomacy: unknown[] } {
  const messages: unknown[] = [];
  const diplomacy: unknown[] = [];
  const obt = record.orders_by_tribe as Record<string, { orders: { kind: string; payload?: Record<string, unknown> }[] }>;
  for (const [tribe, pkt] of Object.entries(obt ?? {})) {
    for (const order of pkt.orders ?? []) {
      const kind = order.kind;
      const payload = order.payload ?? {};
      if (kind === "message") {
        messages.push({
          from: tribe,
          to: payload.to,
          text: payload.text ?? "",
        });
      } else if (kind === "propose") {
        const proposal = (payload.proposal ?? {}) as Record<string, unknown>;
        diplomacy.push({
          kind: "proposal_order",
          from: tribe,
          to: proposal.to ?? proposal.to_tribe,
          proposal_kind: proposal.kind,
          length_ticks: proposal.length_ticks,
          amount_influence: proposal.amount_influence,
        });
      } else if (kind === "respond") {
        diplomacy.push({
          kind: "respond_order",
          from: tribe,
          proposal_id: payload.proposal_id,
          response: payload.response,
        });
      }
    }
  }
  for (const event of (record.resolution_events as unknown[]) ?? []) {
    const e = event as Record<string, unknown>;
    const k = e.kind;
    if (
      k === "proposal_sent" ||
      k === "proposal_declined" ||
      k === "proposal_expired" ||
      k === "pact_formed" ||
      k === "pact_broken" ||
      k === "pact_broken_by_move" ||
      k === "war_declared" ||
      k === "caravan_delivered" ||
      k === "caravan_intercepted"
    ) {
      diplomacy.push(event);
    }
  }
  return { messages, diplomacy };
}

function readTrace(tracePath: string): { tickRecords: Record<string, unknown>[]; summary: Record<string, unknown> } {
  const text = readFileSync(tracePath, "utf-8");
  const tickRecords: Record<string, unknown>[] = [];
  let summary: Record<string, unknown> = {};
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const rec = JSON.parse(t) as Record<string, unknown>;
    if (rec.kind === "match_summary") summary = rec;
    else tickRecords.push(rec);
  }
  if (!tickRecords.length) throw new Error(`no tick records found in ${tracePath}`);
  return { tickRecords, summary };
}

export function buildReplayPayload(
  tracePath: string,
  mapKind: "minimal" | "expanded" | "6p-continent",
  seedOverride: number | undefined,
): Record<string, unknown> {
  const { tickRecords, summary } = readTrace(tracePath);
  const first = tickRecords[0]!;
  const seedVal = first.seed ?? summary.seed ?? seedOverride;
  if (seedVal == null) {
    throw new Error("trace does not contain a seed; pass --seed when rendering this replay");
  }
  const seed = Number(seedVal);

  const config =
    mapKind === "6p-continent"
      ? {
          ...DEFAULT_MATCH_CONFIG,
          seed,
          tribes: [...CONTINENT_6P_DEFAULT_TRIBES],
          mapPreset: "continent6p" as const,
        }
      : mapKind === "expanded"
        ? {
            ...DEFAULT_MATCH_CONFIG,
            seed,
            tribes: ["orange", "grey", "brown", "red"] as const,
            mapPreset: "expanded" as const,
          }
        : {
            ...DEFAULT_MATCH_CONFIG,
            seed,
            tribes: ["orange", "grey", "brown", "red"] as const,
            mapPreset: "hand_minimal" as const,
          };

  const state: GameState = initMatch(config);
  const layout = LAYOUTS[mapKind];
  const roster =
    mapKind === "6p-continent" ? [...CONTINENT_6P_DEFAULT_TRIBES] : (["orange", "grey", "brown", "red"] as const);

  const warnings: string[] = [];

  const frames: Record<string, unknown>[] = [
    {
      tick: 0,
      label: "Initial state",
      state_hash: null,
      orders_by_tribe: {},
      resolution_events: [],
      tick_summary: { messages: [], diplomacy: [] },
      projected_views: Object.fromEntries(roster.map((t) => [t, projectForPlayer(state, t)])),
      state: serializeGameStateForReplay(state),
    },
  ];

  for (const record of tickRecords) {
    const packets = packetsFromRecord(record);
    const result = tick(state, packets);
    if (result.stateHash !== record.state_hash) {
      warnings.push(
        `trace replay mismatch at tick ${String(record.tick)}: expected ${String(record.state_hash)}, got ${result.stateHash}`,
      );
    }
    const alive = [...state.tribesAlive].sort();
    frames.push({
      tick: state.tick,
      label: `Tick ${state.tick}`,
      state_hash: result.stateHash,
      orders_by_tribe: record.orders_by_tribe ?? {},
      resolution_events: record.resolution_events ?? [],
      tick_summary: tickSummaryFromRecord(record),
      projected_views: Object.fromEntries(alive.map((t) => [t, projectForPlayer(state, t)])),
      state: serializeGameStateForReplay(state),
    });
  }

  return {
    meta: {
      trace_path: tracePath,
      map_kind: mapKind,
      seed,
      match_idx: first.match_idx,
      tick_final: summary.tick_final ?? (frames[frames.length - 1] as { tick: number }).tick,
      winner: summary.winner,
      roster,
      warnings,
    },
    layout,
    terrain_fill: REPLAY_TERRAIN_FILL,
    tribe_stroke: REPLAY_TRIBE_STROKE,
    frames,
  };
}
