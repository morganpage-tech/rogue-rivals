/**
 * Replays a server `data/matches/<id>.jsonl` file and validates, for every tick:
 * - Engine state hash matches the logged `stateHash`
 * - `getSpectatorMapKind` is stable (same as first tick)
 * - `getSpectatorMapLayout` is non-null
 * - `spectatorViewToParsedReplayState` + `buildOmniscientProjectedViewFromState` + `trailBaseTicksMap` run without throwing
 *
 * Usage (from repo root):
 *   pnpm --filter @rr/engine2 exec tsx scripts/validateServerLogSpectatorMap.ts packages/server/data/matches/<id>.jsonl
 */

import { readFileSync } from "node:fs";

import type { OrderPacket, ResolutionEvent, Tribe } from "@rr/shared";

import {
  DEFAULT_MATCH_CONFIG,
  hashState,
  initMatch,
  projectForSpectator,
  tick,
  type GameState,
  type MatchConfig,
} from "../src/index.js";
import {
  getSpectatorMapKind,
  getSpectatorMapLayout,
  type SpectatorMapKind,
} from "../../web/src/replay/spectatorMapLayout.ts";
import { buildOmniscientProjectedViewFromState } from "../../web/src/replay/parseReplayStateSnapshot.ts";
import { trailBaseTicksMap } from "../../web/src/replay/trailBaseTicksMap.ts";
import { spectatorViewToParsedReplayState } from "../../web/src/replay/spectatorViewToParsedReplayState.ts";

type MatchInit = {
  kind: "match_init";
  seed: number;
  mapPreset: MatchConfig["mapPreset"];
  slotConfig: {
    mapPreset: MatchConfig["mapPreset"];
    tribes: Tribe[];
    tickLimit?: number;
  };
};

type TickLine = {
  kind: "tick";
  tick: number;
  packetsByTribe: Record<Tribe, OrderPacket>;
  stateHash: string;
  events: ResolutionEvent[];
};

function loadLines(path: string): unknown[] {
  const raw = readFileSync(path, "utf8");
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}

function main(): void {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: tsx scripts/validateServerLogSpectatorMap.ts <match.jsonl>");
    process.exit(2);
  }

  const rows = loadLines(path);
  const init = rows[0] as MatchInit;
  if (!init || init.kind !== "match_init") {
    throw new Error("first line must be match_init");
  }

  const sc = init.slotConfig;
  const cfg: MatchConfig = {
    ...DEFAULT_MATCH_CONFIG,
    seed: init.seed,
    mapPreset: sc.mapPreset,
    tribes: sc.tribes,
    tickLimit: sc.tickLimit ?? DEFAULT_MATCH_CONFIG.tickLimit,
  };

  let state = initMatch(cfg) as GameState;
  const tickLimit = cfg.tickLimit;

  let lockedKind: SpectatorMapKind | null = null;
  let tickCount = 0;

  for (const row of rows.slice(1)) {
    const r = row as { kind: string };
    if (r.kind === "match_end") break;
    if (r.kind !== "tick") continue;

    const t = row as TickLine;
    tickCount += 1;
    const result = tick(state, t.packetsByTribe as Readonly<Record<Tribe, OrderPacket>>);
    const gotHash = hashState(result.state);
    if (gotHash !== t.stateHash) {
      throw new Error(
        `stateHash mismatch at log tick line ${t.tick}: expected ${t.stateHash}, got ${gotHash}`,
      );
    }

    const spec = projectForSpectator(result.state, result.events, { tickLimit });
    const regionIds = Object.keys(spec.regions);
    const kind = getSpectatorMapKind(regionIds);
    if (kind === "unknown") {
      throw new Error(`unknown map kind at engine tick ${spec.tick} (regions: ${regionIds.length})`);
    }
    if (lockedKind === null) lockedKind = kind;
    if (kind !== lockedKind) {
      throw new Error(
        `map kind changed at engine tick ${spec.tick}: ${lockedKind} -> ${kind} (scrub-stability check)`,
      );
    }

    const layout = getSpectatorMapLayout(regionIds);
    if (!layout || Object.keys(layout).length === 0) {
      throw new Error(`getSpectatorMapLayout empty at engine tick ${spec.tick}`);
    }

    const parsed = spectatorViewToParsedReplayState(spec);
    const roster = (parsed.tribesAlive[0] ?? "orange") as Tribe;
    buildOmniscientProjectedViewFromState(parsed, roster);
    trailBaseTicksMap(parsed);

    state = result.state;
  }

  console.log(
    JSON.stringify(
      {
        file: path,
        mapKind: lockedKind,
        ticksValidated: tickCount,
        finalEngineTick: state.tick,
      },
      null,
      2,
    ),
  );
}

main();
