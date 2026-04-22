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
  type TickHistory,
} from "@rr/llm";
import {
  ordersFromChooseIds,
  ordersFromLlmMessageList,
  sanitizePlayerOrders,
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

function countOwnedRegions(view: ProjectedView): number {
  return Object.values(view.visibleRegions).filter((r) => r.owner === view.forTribe).length;
}

function extractFailuresForTribe(
  events: readonly ResolutionEvent[],
  tribe: Tribe,
): { id: string; reason: string }[] {
  const failures: { id: string; reason: string }[] = [];
  for (const e of events) {
    if (e.kind === "build_failed" && e.tribe === tribe) {
      failures.push({ id: "build", reason: String(e.reason ?? "unknown") });
    } else if (e.kind === "recruit_failed") {
      failures.push({ id: "recruit", reason: String(e.reason ?? "unknown") });
    } else if (e.kind === "move_failed" && e.tribe === tribe) {
      failures.push({ id: "move", reason: String(e.reason ?? "unknown") });
    } else if (e.kind === "scout_failed" && e.tribe === tribe) {
      failures.push({ id: "scout", reason: String(e.reason ?? "unknown") });
    } else if (e.kind === "respond_failed") {
      failures.push({ id: "respond", reason: String(e.reason ?? "unknown") });
    }
  }
  return failures;
}

function extractSuccessesForTribe(
  events: readonly ResolutionEvent[],
  tribe: Tribe,
): string[] {
  const successes: string[] = [];
  for (const e of events) {
    if (e.kind === "built" && e.tribe === tribe) {
      successes.push(`build:${String(e.region_id)}:${String(e.structure)}`);
    } else if (e.kind === "recruited" && e.tribe === tribe) {
      successes.push(`recruit:${String(e.region_id)}:t${String(e.tier)}`);
    } else if (e.kind === "dispatch_move" && e.tribe === tribe) {
      successes.push(`move:${String(e.force_id)}:${String(e.to)}`);
    } else if (e.kind === "dispatch_scout" && e.tribe === tribe) {
      successes.push(`scout:${String(e.to)}`);
    } else if (e.kind === "proposal_sent" && e.from === tribe) {
      successes.push(`propose:${String(e.proposal_kind)}:${String(e.to)}`);
    } else if (e.kind === "pact_formed" && (e.parties as string[]).includes(tribe)) {
      successes.push(`pact:${String(e.pact)}`);
    }
  }
  return successes;
}

function computeNarrativeForTribe(
  events: readonly ResolutionEvent[],
  tribe: Tribe,
): string[] {
  const entries: string[] = [];
  for (const e of events) {
    if (e.kind === "region_captured" && e.tribe === tribe) {
      entries.push(`You captured ${String(e.region_id)} from ${String(e.previous_owner ?? "unclaimed")}`);
    } else if (e.kind === "region_claimed" && e.tribe === tribe) {
      entries.push(`You claimed unclaimed region ${String(e.region_id)}`);
    } else if (e.kind === "region_captured" && e.previous_owner === tribe) {
      entries.push(`You LOST ${String(e.region_id)} to ${String(e.tribe)}`);
    } else if (e.kind === "combat" && (e.attacker === tribe || e.defender === tribe)) {
      const role = e.attacker === tribe ? "attacked" : "defended against";
      const result = String(e.result);
      entries.push(`Combat: you ${role} ${e.attacker === tribe ? String(e.defender) : String(e.attacker)} at ${String(e.region)} (${result})`);
    } else if (e.kind === "pact_broken" && (e.parties as string[]).includes(tribe)) {
      const breaker = String(e.breaker);
      if (breaker === tribe) {
        entries.push(`You broke a pact with ${(e.parties as string[]).find((p) => p !== tribe)}`);
      } else {
        entries.push(`${breaker} broke a pact with you`);
      }
    } else if (e.kind === "war_declared" && (e.parties as string[]).includes(tribe)) {
      const other = (e.parties as string[]).find((p) => p !== tribe);
      entries.push(`War declared between you and ${other}`);
    } else if (e.kind === "tribe_eliminated" && e.tribe !== tribe) {
      entries.push(`${String(e.tribe)} was eliminated`);
    } else if (e.kind === "tribe_eliminated" && e.tribe === tribe) {
      entries.push(`You were eliminated`);
    } else if (e.kind === "caravan_intercepted" && e.from === tribe) {
      entries.push(`Your caravan to ${String(e.to)} was intercepted by ${String(e.interceptor)} (${String(e.amount)} Influence lost)`);
    } else if (e.kind === "caravan_delivered" && e.from === tribe) {
      entries.push(`Your caravan delivered ${String(e.amount)} Influence to ${String(e.to)}`);
    } else if (e.kind === "force_destroyed_no_retreat" && String(e.force_id).startsWith(`f_${tribe}_`)) {
      entries.push(`Your force ${String(e.force_id)} was destroyed (no retreat)`);
    } else if (e.kind === "arrival_rejected_garrison_cap" && String(e.force_id).startsWith(`f_${tribe}_`)) {
      entries.push(`Your force ${String(e.force_id)} arrived at full region and was destroyed`);
    } else if (e.kind === "victory") {
      entries.push(`GAME END: ${String(e.condition)}`);
    }
  }
  return entries;
}

async function llmOrders(
  projectedView: object,
  persona: string,
  tickHistory: TickHistory | undefined,
  narrative: NarrativeBuffer | undefined,
): Promise<{ orders: Order[]; chooseIds: string[] }> {
  const view = projectedView as ProjectedView;
  const json = await decideOrdersPacketJson(view, persona, {
    tickHistory,
    narrative,
  });
  const fromChoose = ordersFromChooseIds(view, json.choose ?? []);
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

  const prevTickState = new Map<Tribe, {
    influence: number;
    regionCount: number;
    chooseIds: string[];
  }>();
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
        const pv = view as ProjectedView;
        const failed = extractFailuresForTribe(prevTickEvents, tribe);
        const succeeded = extractSuccessesForTribe(prevTickEvents, tribe);
        let forcesLost = 0;
        let structuresBuilt = 0;
        for (const e of prevTickEvents) {
          if (e.kind === "force_destroyed_no_retreat" && String(e.force_id).startsWith(`f_${tribe}_`)) {
            forcesLost++;
          }
          if (e.kind === "arrival_rejected_garrison_cap" && String(e.force_id).startsWith(`f_${tribe}_`)) {
            forcesLost++;
          }
          if (e.kind === "built" && e.tribe === tribe) {
            structuresBuilt++;
          }
        }
        tickHistory = {
          lastChooseIds: prev.chooseIds,
          lastFailedActions: failed,
          lastSucceededActions: succeeded,
          stateDelta: {
            influenceBefore: prev.influence,
            influenceAfter: pv.myPlayerState.influence,
            regionsGained: Math.max(0, countOwnedRegions(pv) - prev.regionCount),
            regionsLost: Math.max(0, prev.regionCount - countOwnedRegions(pv)),
            forcesLost,
            structuresBuilt,
          },
        };
      }

      const narrative = narrativeBuffers.get(tribe);

      let orders: Order[] = [];
      let chooseIds: string[] = [];
      try {
        const result = await llmOrders(view, persona, tickHistory, narrative);
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
