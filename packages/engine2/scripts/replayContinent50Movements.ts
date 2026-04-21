/**
 * Replays 50 ticks of continent6p with empty orders (same shape as the server
 * integration test: all tribes "pass"). Prints submitted orders and movement-related
 * resolution events each tick.
 *
 *   pnpm --filter @rr/engine2 exec tsx scripts/replayContinent50Movements.ts
 *   pnpm --filter @rr/engine2 exec tsx scripts/replayContinent50Movements.ts -- --ticks 50 --seed 42
 */

import type { OrderPacket, Tribe } from "@rr/shared";

import { CONTINENT_6P_DEFAULT_TRIBES } from "../src/continent6pMap.js";
import { DEFAULT_MATCH_CONFIG, initMatch, tick, type GameState } from "../src/index.js";
import type { MatchConfig } from "../src/matchConfig.js";

function parseArgs(argv: string[]): { ticks: number; seed: number; verbose: boolean } {
  let ticks = 50;
  let seed = 42;
  let verbose = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--ticks") ticks = Math.max(1, parseInt(argv[++i] ?? "50", 10));
    else if (argv[i] === "--seed") seed = parseInt(argv[++i] ?? "42", 10);
    else if (argv[i] === "--verbose" || argv[i] === "-v") verbose = true;
  }
  return { ticks, seed, verbose };
}

function passPackets(state: GameState): Record<Tribe, OrderPacket> {
  const out = {} as Record<Tribe, OrderPacket>;
  for (const t of state.tribesAlive) {
    out[t] = { tribe: t, tick: state.tick, orders: [] };
  }
  return out as Record<Tribe, OrderPacket>;
}

function isMovementRelated(ev: { kind: string }): boolean {
  const k = ev.kind;
  return (
    k === "dispatch_move" ||
    k === "move_failed" ||
    k === "force_arrived" ||
    k === "force_retreated" ||
    k === "force_destroyed_no_retreat" ||
    k.includes("scout") ||
    k.includes("transit") ||
    k === "combat" ||
    k.includes("caravan")
  );
}

function summarizeOrder(o: { kind: string } & Record<string, unknown>): string {
  switch (o.kind) {
    case "move":
      return `move force ${String(o.forceId)} → ${String(o.destinationRegionId)}`;
    case "scout":
      return `scout ${String(o.fromRegionId)} → ${String(o.targetRegionId)}`;
    case "recruit":
      return `recruit tier ${String(o.tier)} @ ${String(o.regionId)}`;
    case "build":
      return `build ${String(o.structure)} @ ${String(o.regionId)}`;
    default:
      return `${o.kind} ${JSON.stringify(o)}`;
  }
}

function eventKindHistogram(events: readonly { kind: string }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of events) {
    m.set(e.kind, (m.get(e.kind) ?? 0) + 1);
  }
  return m;
}

function formatHistogram(m: Map<string, number>): string {
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, n]) => `${k}×${n}`)
    .join(", ");
}

function main(): void {
  const { ticks, seed, verbose } = parseArgs(process.argv.slice(2));

  const config: MatchConfig = {
    ...DEFAULT_MATCH_CONFIG,
    seed,
    mapPreset: "continent6p",
    tribes: [...CONTINENT_6P_DEFAULT_TRIBES],
    tickLimit: 120,
  };

  let state = initMatch(config) as GameState;

  console.log(
    `Continent 6p replay: ${ticks} ticks, seed=${seed}, tribes=${CONTINENT_6P_DEFAULT_TRIBES.join(", ")}`,
  );
  console.log(
    "Mode: empty orders every tick (same as all-pass autoplay). No LLM / no human moves.",
  );
  console.log(
    "Player movements (move/scout/etc. orders): none — every tribe submits [].\n",
  );

  let totalMoveEvents = 0;
  const allMoveEvents: string[] = [];

  for (let n = 0; n < ticks; n++) {
    const packets = passPackets(state);
    const orderSummary: string[] = [];
    for (const t of state.tribesAlive) {
      const ords = packets[t]!.orders;
      if (ords.length === 0) orderSummary.push(`${t}: (no orders)`);
      else {
        orderSummary.push(`${t}: ${ords.map((o) => summarizeOrder(o as never)).join("; ")}`);
      }
    }

    const result = tick(state, packets);
    state = result.state;

    const moveEvents = result.events.filter((e) => isMovementRelated(e as { kind: string }));
    totalMoveEvents += moveEvents.length;
    for (const ev of moveEvents) {
      allMoveEvents.push(`tick ${state.tick}: ${JSON.stringify(ev)}`);
    }

    if (verbose) {
      console.log(`\n--- Step ${n + 1} / ${ticks}  (engine tick after resolve: ${state.tick}) ---`);
      console.log("Submitted orders:");
      for (const line of orderSummary) console.log(`  ${line}`);

      if (moveEvents.length === 0) {
        console.log("Movement-related resolution events: (none this tick)");
      } else {
        console.log("Movement-related resolution events:");
        for (const ev of moveEvents) {
          console.log(`  ${JSON.stringify(ev)}`);
        }
      }
    } else {
      const hist = formatHistogram(eventKindHistogram(result.events));
      console.log(
        `tick ${state.tick}: resolution [${hist}] | movement-like events: ${moveEvents.length}`,
      );
    }
  }

  console.log(
    `\nSummary: ${ticks} ticks, total movement-related events: ${totalMoveEvents} (dispatch_move, force_arrived, scout*, combat, …)`,
  );
  if (totalMoveEvents > 0 && !verbose) {
    console.log("Re-run with --verbose to print each movement event.");
  }
  if (verbose && allMoveEvents.length > 0) {
    console.log("\nAll movement-related events (chronological):");
    for (const line of allMoveEvents) console.log(line);
  }
  console.log(`Done. Final engine tick=${state.tick}, tribesAlive=${state.tribesAlive.join(", ")}`);
}

main();
