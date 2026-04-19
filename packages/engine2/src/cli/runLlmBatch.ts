/**
 * Run full v2 LLM matches using @rr/engine2 + Python `tools.v2.llm_orders_stdio`
 * (same LLM stack as `python -m tools.v2.run_batch`, but simulation is TypeScript).
 *
 * Writes jsonl traces compatible with `python -m tools.v2.render_replay`.
 *
 * Usage (repo root):
 *   pnpm --filter @rr/engine2 batch:llm -- --out-dir simulations/ts_llm --ticks 10
 *
 * Requires: LLM API keys in env (see tools/llm_client.py), python3 on PATH.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CONTINENT_6P_DEFAULT_TRIBES,
  DEFAULT_MATCH_CONFIG,
  initMatch,
  projectForPlayer,
  tick,
  type ForceTier,
  type GameState,
  type Order,
  type OrderPacket,
  type Proposal,
  type Tribe,
} from "../index.js";
import type { StructureKind } from "../types.js";

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

/** Python `decide_orders` emits `{ kind, payload }` with snake_case payload keys. */
function orderFromPythonRow(row: {
  kind: string;
  payload?: Record<string, unknown>;
}): Order {
  const pl = row.payload ?? {};
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
      throw new Error(`unknown order kind from LLM: ${row.kind}`);
  }
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
      // Align with tools/v2/fog.py legal_order_options — Python engine_tick reads proposal["to"].
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

function llmOrders(projectedView: object, persona: string): Order[] {
  const py = process.env.PYTHON ?? "python3";
  const r = spawnSync(
    py,
    ["-m", "tools.v2.llm_orders_stdio"],
    {
      cwd: repoRoot(),
      input: JSON.stringify({ projectedView, persona }),
      encoding: "utf-8",
      maxBuffer: 128 * 1024 * 1024,
    },
  );
  if (r.error) {
    throw r.error;
  }
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    throw new Error(`llm_orders_stdio failed with ${r.status}`);
  }
  const out = JSON.parse(r.stdout) as { orders?: { kind: string; payload?: Record<string, unknown> }[] };
  const raw = out.orders ?? [];
  return raw.map((o) => orderFromPythonRow(o));
}

function runMatch(opts: {
  matchIdx: number;
  seed: number;
  maxTicks: number;
  mapPreset: "continent6p" | "expanded";
  outPath: string;
  verbose: boolean;
}): Record<string, unknown> {
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

  const t0 = Date.now();

  while (state.tick < opts.maxTicks && state.winner == null) {
    const packets: Record<Tribe, OrderPacket> = {} as Record<Tribe, OrderPacket>;

    for (const tribe of state.tribesAlive) {
      const view = viewsForDecisions[tribe]!;
      const persona = personas[tribe] ?? "opportunist";
      let orders: Order[] = [];
      try {
        orders = llmOrders(view, persona);
        llmCalls += 1;
      } catch (e) {
        diagnostics.push(`${tribe}: ${e instanceof Error ? e.message : String(e)}`);
      }
      packets[tribe] = { tribe, tick: state.tick, orders };
    }

    const result = tick(state, packets);

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

    viewsForDecisions = Object.fromEntries(
      state.tribesAlive.map((t) => [t, projectForPlayer(state, t) as object]),
    ) as Record<Tribe, object>;

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

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const outDir = resolveOutDir(opts.outDir);
  mkdirSync(outDir, { recursive: true });

  const summaries: Record<string, unknown>[] = [];
  for (let i = 0; i < opts.matches; i++) {
    const outPath = join(outDir, `match_${String(i).padStart(3, "0")}.jsonl`);
    const s = runMatch({
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

main();
