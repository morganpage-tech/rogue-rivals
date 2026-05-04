/**
 * Run full v2 LLM matches using @rr/engine2 + @rr/llm (same prompts as legacy Python batch).
 *
 * Usage (repo root):
 *   pnpm --filter @rr/engine2 batch:llm -- --out-dir simulations/ts_llm --ticks 10
 *
 * Requires: LLM API keys in env (see README / @rr/llm), repo root as cwd for tsx.
 */

import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertLlmEnvironmentConfigured,
  decideOrdersPacketJson,
  NarrativeBuffer,
  renderKitBonuses,
  type TickHistory,
} from "@rr/llm";
import {
  buildTickHistory,
  computeNarrativeForTribe,
  countOwnedRegions,
  ordersFromChooseIds,
  ordersFromLlmMessageList,
  sanitizePlayerOrders,
  type PrevTickState,
} from "@rr/shared";
import type { ProjectedView, ResolutionEvent } from "@rr/shared";

import {
  CONTINENT_6P_DEFAULT_TRIBES,
  DEFAULT_MATCH_CONFIG,
  initMatch,
  projectForPlayer,
  tick,
  type GameState,
  type Order,
  type OrderPacket,
  type Tribe,
} from "../index.js";

const PERSONA_6P: Record<Tribe, string> = {
  arctic: "frostmarshal",
  tricoloured: "veilweaver",
  red: "opportunist",
  brown: "merchant_prince",
  orange: "warlord",
  grey: "paranoid_isolationist",
};

const PERSONA_4: Record<string, string> = {
  orange: "warlord",
  grey: "paranoid_isolationist",
  brown: "merchant_prince",
  red: "opportunist",
};

function repoRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "..", "..");
}

/** Relative paths are resolved from the repository root (not package cwd). */
function resolveOutDir(dir: string): string {
  if (dir.startsWith("/")) return dir;
  return join(repoRoot(), dir);
}

function orderToTracePayload(o: Order): Record<string, unknown> {
  switch (o.kind) {
    case "move":
      return { force_id: o.forceId, destination_region_id: o.destinationRegionId };
    case "recruit":
      return { region_id: o.regionId, tier: o.tier };
    case "build":
      return o.structure === "road" && o.roadTarget
        ? { region_id: o.regionId, structure: "road", road_target: o.roadTarget }
        : { region_id: o.regionId, structure: o.structure };
    case "scout":
      return { from_region_id: o.fromRegionId, target_region_id: o.targetRegionId };
    case "propose": {
      const p = o.proposal;
      const proposal: Record<string, unknown> = { kind: p.kind, to: p.to };
      if (p.kind === "nap" || p.kind === "shared_vision") {
        proposal.length_ticks = p.lengthTicks;
      }
      if (p.kind === "trade_offer") {
        proposal.amount_influence = p.amountInfluence;
      }
      return { proposal };
    }
    case "respond":
      return { proposal_id: o.proposalId, response: o.response };
    case "message":
      return { to: o.to, text: o.text };
  }
}

async function llmOrders(
  projectedView: object,
  persona: string,
  tickHistory: TickHistory | undefined,
  narrative: NarrativeBuffer | undefined,
  state?: GameState,
): Promise<{ orders: Order[]; chooseIds: string[] }> {
  const view = projectedView as ProjectedView;
  const tribe = view.forTribe;
  let kitBonusesText: string | undefined;
  if (state && tribe) {
    const kitId = state.personaKits[tribe];
    if (kitId) {
      const { getKitForTribe: getKit } = await import("../personaKit.js");
      const kit = getKit(state, tribe);
      kitBonusesText = renderKitBonuses(kitId, kit);
    }
  }
  const json = await decideOrdersPacketJson(view, persona, {
    tickHistory,
    narrative,
    kitBonusesText,
  });
  const { orders: fromChoose } = ordersFromChooseIds(view, json.choose ?? []);
  const fromMessages = ordersFromLlmMessageList(view, json.messages ?? []);
  const merged = [...fromChoose, ...fromMessages];
  const orders = sanitizePlayerOrders(view.myPlayerState.influence, merged);
  return { orders, chooseIds: json.choose ?? [] };
}

async function runMatch(opts: {
  matchIdx: number;
  seed: number;
  maxTicks: number;
  mapPreset: "continent6p" | "expanded";
  outPath: string;
  verbose: boolean;
}): Promise<Record<string, unknown>> {
  const config =
    opts.mapPreset === "continent6p"
      ? {
          ...DEFAULT_MATCH_CONFIG,
          seed: opts.seed,
          tribes: [...CONTINENT_6P_DEFAULT_TRIBES],
          mapPreset: "continent6p" as const,
        }
      : {
          ...DEFAULT_MATCH_CONFIG,
          seed: opts.seed,
          tribes: ["orange", "grey", "brown", "red"] as const,
          mapPreset: "expanded" as const,
        };

  const state: GameState = initMatch(config);
  const personas: Record<string, string> =
    opts.mapPreset === "continent6p" ? { ...PERSONA_6P } : { ...PERSONA_4 };

  const lines: string[] = [];
  const diagnostics: string[] = [];
  let llmCalls = 0;

  const initialViews: Record<string, object> = Object.fromEntries(
    state.tribesAlive.map((t) => [t, projectForPlayer(state, t) as object]),
  );
  let viewsForDecisions = initialViews as Record<Tribe, object>;

  const narrativeBuffers = new Map<Tribe, NarrativeBuffer>();
  for (const t of state.tribesAlive) {
    narrativeBuffers.set(t, new NarrativeBuffer());
  }

  const prevTickState = new Map<Tribe, PrevTickState>();
  let prevTickEvents: ResolutionEvent[] = [];

  const t0 = Date.now();

  while (state.tick < opts.maxTicks && state.winner == null) {
    const packets: Record<Tribe, OrderPacket> = {} as Record<Tribe, OrderPacket>;
    const currentChooseIds = new Map<Tribe, string[]>();

    for (const tribe of state.tribesAlive) {
      const view = viewsForDecisions[tribe]!;
      const persona = personas[tribe] ?? "opportunist";

      let tickHistory: TickHistory | undefined;
      const prev = prevTickState.get(tribe);
      if (prev) {
        tickHistory = buildTickHistory(prev, view as ProjectedView, prevTickEvents, tribe);
      }

      const narrative = narrativeBuffers.get(tribe);

      let orders: Order[] = [];
      let chooseIds: string[] = [];
      try {
        const result = await llmOrders(view, persona, tickHistory, narrative, state);
        orders = result.orders;
        chooseIds = result.chooseIds;
        llmCalls += 1;
      } catch (e) {
        diagnostics.push(`${tribe}: ${e instanceof Error ? e.message : String(e)}`);
      }
      currentChooseIds.set(tribe, chooseIds);
      packets[tribe] = { tribe, tick: state.tick, orders };
    }

    const prevViews = viewsForDecisions as Record<Tribe, ProjectedView>;
    const result = tick(state, packets);

    for (const tribe of state.tribesAlive) {
      const narrativeEntries = computeNarrativeForTribe(result.events, tribe);
      const buf = narrativeBuffers.get(tribe);
      if (buf) {
        for (const entry of narrativeEntries) {
          buf.add(state.tick, entry);
        }
      }
    }

    const newViews = Object.fromEntries(
      state.tribesAlive.map((t) => [t, projectForPlayer(state, t) as object]),
    ) as Record<Tribe, object>;

    for (const tribe of state.tribesAlive) {
      const oldPv = prevViews[tribe] as ProjectedView | undefined;
      const newPv = newViews[tribe] as ProjectedView | undefined;
      if (!oldPv || !newPv) continue;
      prevTickState.set(tribe, {
        influence: newPv.myPlayerState.influence,
        regionCount: countOwnedRegions(newPv),
        chooseIds: currentChooseIds.get(tribe) ?? [],
      });
    }

    prevTickEvents = result.events as ResolutionEvent[];

    const tribeOrder = Object.keys(packets).sort() as Tribe[];
    const traceRecord = {
      tick: state.tick,
      match_idx: opts.matchIdx,
      seed: opts.seed,
      state_hash: result.stateHash,
      orders_by_tribe: Object.fromEntries(
        tribeOrder.map((t) => {
          const p = packets[t]!;
          return [
            t,
            {
              tribe: p.tribe,
              tick: p.tick,
              orders: p.orders.map((o) => {
                const payload = orderToTracePayload(o);
                return { kind: o.kind, payload };
              }),
            },
          ];
        }),
      ),
      resolution_events: result.events,
    };
    lines.push(JSON.stringify(traceRecord));

    viewsForDecisions = newViews;

    if (opts.verbose) {
      console.error(`[match ${opts.matchIdx}] tick ${state.tick - 1} -> ${state.tick} ok`);
    }
  }

  const elapsed_s = (Date.now() - t0) / 1000;
  const summary = {
    kind: "match_summary",
    match_idx: opts.matchIdx,
    seed: opts.seed,
    persona_assignment: personas,
    winner: state.winner,
    tick_final: state.tick,
    tribes_alive_at_end: [...state.tribesAlive],
    elapsed_s: Math.round(elapsed_s * 100) / 100,
    llm_calls: llmCalls,
    llm_errors: diagnostics.length,
    diagnostics_sample: diagnostics.slice(0, 10),
  };
  lines.push(JSON.stringify(summary));

  writeFileSync(opts.outPath, lines.join("\n") + "\n", "utf-8");
  return summary;
}

function parseArgs(argv: string[]) {
  let outDir = "simulations/ts_llm_batch";
  let matches = 1;
  let ticks = 30;
  let seed = 2026100;
  let mapPreset: "continent6p" | "expanded" = "continent6p";
  let verbose = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out-dir") outDir = argv[++i] ?? outDir;
    else if (a === "--matches") matches = parseInt(argv[++i] ?? "1", 10);
    else if (a === "--ticks") ticks = parseInt(argv[++i] ?? "30", 10);
    else if (a === "--seed") seed = parseInt(argv[++i] ?? "2026100", 10);
    else if (a === "--map") {
      const m = argv[++i];
      if (m === "expanded" || m === "continent6p") mapPreset = m;
    } else if (a === "--verbose") verbose = true;
  }
  return { outDir, matches, ticks, seed, mapPreset, verbose };
}

async function main(): Promise<void> {
  assertLlmEnvironmentConfigured();
  const opts = parseArgs(process.argv.slice(2));
  const outDir = resolveOutDir(opts.outDir);
  mkdirSync(outDir, { recursive: true });

  const summaries: Record<string, unknown>[] = [];
  for (let i = 0; i < opts.matches; i++) {
    const outPath = join(outDir, `match_${String(i).padStart(3, "0")}.jsonl`);
    const s = await runMatch({
      matchIdx: i,
      seed: opts.seed + i,
      maxTicks: opts.ticks,
      mapPreset: opts.mapPreset,
      outPath,
      verbose: opts.verbose,
    });
    summaries.push(s);
    console.log(`wrote ${outPath}`);
  }

  const batch = {
    kind: "batch_summary",
    engine: "typescript",
    map_kind: opts.mapPreset === "continent6p" ? "6p-continent" : "expanded",
    num_matches: opts.matches,
    base_seed: opts.seed,
    max_ticks: opts.ticks,
    matches: summaries,
  };
  writeFileSync(join(outDir, "batch_summary.json"), JSON.stringify(batch, null, 2), "utf-8");
  console.log(`wrote ${join(outDir, "batch_summary.json")}`);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
