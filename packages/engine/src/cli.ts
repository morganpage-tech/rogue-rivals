#!/usr/bin/env node
/**
 * Local hot-seat harness: stdin commands, stdout public state / thread.
 * Only this module performs I/O.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import type { BuildingType, Tribe } from "./rules.js";
import { REGION_KEYS, RES_KEYS, VP_WIN_THRESHOLD } from "./rules.js";
import type { MatchState } from "./state.js";
import { initMatch } from "./init.js";
import { applyCommand } from "./commands.js";
import { computeStandings } from "./endOfRound.js";
import { computeMatchOutcome } from "./matchEnd.js";
import type { Command } from "./state.js";

function usage(): never {
  process.stderr.write(
    "Usage: rr-engine play --seed <n> --seats orange,grey,brown,red [--turn-order P1,P2,...]\n",
  );
  process.exit(1);
}

function parseArgs(argv: string[]): {
  seed: number;
  seats: Tribe[];
  turnOrder?: string[];
} {
  if (argv[2] !== "play") usage();
  let seed = 42;
  const tribes: Tribe[] = [];
  let turnOrder: string[] | undefined;
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--seed" && argv[i + 1]) {
      seed = parseInt(argv[++i]!, 10);
      continue;
    }
    if (a === "--seats" && argv[i + 1]) {
      const parts = argv[++i]!.split(",").map((s) => s.trim().toLowerCase());
      for (const p of parts) {
        if (["orange", "grey", "brown", "red"].includes(p)) {
          tribes.push(p as Tribe);
        }
      }
      continue;
    }
    if (a === "--turn-order" && argv[i + 1]) {
      turnOrder = argv[++i]!.split(",").map((s) => s.trim());
      continue;
    }
  }
  if (tribes.length < 2 || tribes.length > 4) usage();
  return { seed, seats: tribes, turnOrder };
}

function tribesToInit(seats: Tribe[]): {
  seats: { playerId: string; tribe: Tribe }[];
} {
  const ids = seats.map((_, i) => `P${i + 1}`);
  return {
    seats: seats.map((tribe, i) => ({
      playerId: ids[i]!,
      tribe,
    })),
  };
}

function parseResourceTokens(parts: string[]): Partial<Record<string, number>> {
  const out: Partial<Record<string, number>> = {};
  const keyMap: Record<string, string> = {
    T: "T",
    O: "O",
    F: "F",
    REL: "Rel",
    RELICS: "Rel",
    RELIC: "Rel",
    S: "S",
    SCRAP: "S",
  };
  for (const tok of parts) {
    const m = /^([a-z]+)=(\d+)$/i.exec(tok.trim());
    if (!m) continue;
    const k = keyMap[m[1]!.toUpperCase()] ?? m[1]!.charAt(0).toUpperCase();
    const v = parseInt(m[2]!, 10);
    const rk = k === "R" ? "Rel" : k;
    if (RES_KEYS.includes(rk as (typeof RES_KEYS)[number])) {
      out[rk as keyof typeof out] = v;
    }
  }
  return out;
}

/** Parse tokens after verb; supports `gather plains`, `build shack`, resource pairs `offer T=1 S=1` style */
function parseCommandLine(line: string): Command | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const lower = trimmed.toLowerCase();

  if (lower === "pass") {
    return { kind: "take_action", action: { kind: "pass" } };
  }

  const g = /^gather\s+(\w+)/i.exec(trimmed);
  if (g && REGION_KEYS.includes(g[1]!.toLowerCase() as (typeof REGION_KEYS)[number])) {
    return {
      kind: "take_action",
      action: { kind: "gather", region: g[1]!.toLowerCase() as (typeof REGION_KEYS)[number] },
    };
  }

  const b = /^build\s+(shack|den|watchtower|forge|great_hall)/i.exec(trimmed);
  if (b) {
    return {
      kind: "take_action",
      action: { kind: "build", building: b[1]!.toLowerCase() as BuildingType },
    };
  }

  const amb = /^ambush\s+(\w+)/i.exec(trimmed);
  if (amb && REGION_KEYS.includes(amb[1]!.toLowerCase() as (typeof REGION_KEYS)[number])) {
    return {
      kind: "take_action",
      action: { kind: "ambush", region: amb[1]!.toLowerCase() as (typeof REGION_KEYS)[number] },
    };
  }

  const sc = /^scout\s+(\w+)/i.exec(trimmed);
  if (sc && REGION_KEYS.includes(sc[1]!.toLowerCase() as (typeof REGION_KEYS)[number])) {
    return {
      kind: "take_action",
      action: { kind: "scout", region: sc[1]!.toLowerCase() as (typeof REGION_KEYS)[number] },
    };
  }

  const rej = /^reject\s+(o\S+)/i.exec(trimmed);
  if (rej) {
    return { kind: "reject_trade", offerId: rej[1]! };
  }

  const acc = /^accept\s+(o\S+)/i.exec(trimmed);
  if (acc) {
    return { kind: "accept_trade", offerId: acc[1]! };
  }

  const trade = /^trade\s+/i.exec(trimmed);
  if (trade) {
    const rest = trimmed.slice(trimmed.indexOf("trade") + 5).trim();
    const toIdx = rest.search(/\bto\b/i);
    const offerIdx = rest.search(/\boffer\b/i);
    const reqIdx = rest.search(/\brequest\b/i);
    if (toIdx >= 0 && offerIdx >= 0 && reqIdx >= 0) {
      const toPart = rest.slice(toIdx + 3, offerIdx).trim().split(/\s+/)[0];
      const offeredStr = rest.slice(offerIdx + 5, reqIdx).trim();
      const requestedStr = rest.slice(reqIdx + 7).trim();
      const pid = /^P\d$/i.test(toPart!) ? toPart!.toUpperCase() : null;
      if (!pid) return null;
      const offered = parseResourceTokens(offeredStr.split(/\s+/));
      const requested = parseResourceTokens(requestedStr.split(/\s+/));
      return {
        kind: "propose_trade",
        offer: {
          offerer: "",
          recipient: pid,
          offered,
          requested,
        },
      };
    }
  }

  return null;
}

function printPublic(state: MatchState, logLines: string[]): void {
  const cp = state.currentPlayerId;
  process.stdout.write(
    `\n━━ Round ${state.round}/${15} ━━ Current: ${cp} ━━ scrap_pool=${state.scrapPool} ━━\n`,
  );
  const standings = computeStandings(state);
  for (const pid of state.turnOrder) {
    const ps = state.players[pid];
    const st = standings[pid];
    process.stdout.write(
      `  ${pid} (${ps.tribe}) VP=${ps.vp} rank=${st?.rank ?? "?"} beads=${ps.beads} buildings=${ps.buildings.join(",") || "none"}\n`,
    );
    process.stdout.write(
      `    stockpile T:${ps.resources.T} O:${ps.resources.O} F:${ps.resources.F} Rel:${ps.resources.Rel} S:${ps.resources.S}\n`,
    );
  }
  process.stdout.write(`Pending offers: ${state.pendingOffers.length}\n`);
  process.stdout.write("--- Thread (recent) ---\n");
  for (const ln of logLines.slice(-24)) {
    process.stdout.write(`  ${ln}\n`);
  }
  process.stdout.write(
    ` (${cp}'s turn — trade: trade to P2 offer T=1 request O=1 | accept o1_2 | gather plains | pass)\n`,
  );
}

async function main(): Promise<void> {
  const argv = parseArgs(process.argv);
  const init = tribesToInit(argv.seats);
  let state = initMatch({
    seed: argv.seed,
    seats: init.seats,
    turnOrder: argv.turnOrder,
  });

  const logLines: string[] = [];
  const allEvents: Record<string, unknown>[] = [];

  function pushEvents(evs: Record<string, unknown>[]): void {
    for (const ev of evs) {
      allEvents.push(ev);

      const t = ev.type as string;
      if (t === "trade_proposed") {
        logLines.push(`${ev.from} proposed trade ${ev.offer_id} → ${ev.to}`);
      } else if (t === "trade_resolved") {
        logLines.push(`Trade ${ev.offer_id}: ${ev.offerer_id} ↔ ${ev.acceptor_id}`);
      } else if (t === "trade_rejected") {
        logLines.push(`Rejected ${ev.offer_id}`);
      } else if (t === "trade_expired") {
        logLines.push(`Expired ${ev.offer_id}`);
      } else if (t === "bead_converted") {
        logLines.push(`${ev.player_id}: bead → +${ev.vp_gained} VP`);
      } else if (t === "ambush_triggered") {
        logLines.push(`${ev.ambusher_id} ambushed ${ev.victim_id} @ ${ev.region}`);
      } else if (t === "round_end") {
        logLines.push(`Round ${ev.round} end`);
      } else if (t === "turn") {
        const action = ev.action as Record<string, unknown>;
        logLines.push(`${ev.player_id}: ${JSON.stringify(action)}`);
      }
    }
  }

  printPublic(state, logLines);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const now = new Date();

  await new Promise<void>((resolve) => {
    function prompt(): void {
      if (state.matchEnded) {
        rl.close();
        resolve();
        return;
      }
      rl.question(`${state.currentPlayerId}> `, (line) => {
        void (async () => {
          try {
            const trimmed = line.trim().toLowerCase();
            if (trimmed === "quit" || trimmed === "exit") {
              rl.close();
              resolve();
              return;
            }

            let cmd = parseCommandLine(line);
            if (!cmd && trimmed === "help") {
              process.stdout.write(
                "gather <region> | build <kind> | ambush <region> | scout <region> | pass | trade to Pn offer … request … | accept <id> | reject <id>\n",
              );
              prompt();
              return;
            }

            if (cmd?.kind === "propose_trade") {
              cmd.offer.offerer = state.currentPlayerId;
            }

            if (!cmd) {
              process.stdout.write("Unknown command.\n");
              prompt();
              return;
            }

            const out = applyCommand(state, state.currentPlayerId, cmd, now);
            if ("error" in out) {
              process.stdout.write(`Illegal: ${out.error.code} — ${out.error.message}\n`);
              prompt();
              return;
            }

            state = out.newState;
            pushEvents(out.events as Record<string, unknown>[]);

            printPublic(state, logLines);

            prompt();
          } catch (e) {
            process.stderr.write(String(e) + "\n");
            prompt();
          }
        })();
      });
    }
    prompt();
  });

  const matchesDir = path.resolve(process.cwd(), "matches");
  fs.mkdirSync(matchesDir, { recursive: true });
  const matchId = `m_hotseat_${argv.seed}_${Date.now().toString(36)}`;
  const outPath = path.join(matchesDir, `${matchId}.jsonl`);

  const vpCurve: Record<string, number[]> = {};
  for (const pid of state.seatPlayerIds) vpCurve[pid] = [0];

  const tradesByPair: Record<string, number> = {};
  let tradesTotal = 0;
  let ambA = 0,
    ambH = 0,
    ambSc = 0,
    ambEx = 0,
    scoutN = 0;

  const roundMap = new Map<number, Record<string, unknown>[]>();
  for (const ev of allEvents) {
    const r = typeof ev.round === "number" ? ev.round : 1;
    if (!roundMap.has(r)) roundMap.set(r, []);
    roundMap.get(r)!.push(ev);
  }
  const roundEvents = [...roundMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, events]) => ({ round, events }));

  for (const bucket of roundEvents) {
    for (const ev of bucket.events) {
      const t = ev.type as string;
      if (t === "trade_resolved") {
        tradesTotal++;
        const a = ev.offerer_id as string;
        const b = ev.acceptor_id as string;
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        tradesByPair[key] = (tradesByPair[key] ?? 0) + 1;
      }
      if (t === "ambush_triggered") ambH++;
      if (t === "ambush_scouted") ambSc++;
      if (t === "ambush_expired") ambEx++;
      if (t === "turn") {
        const act = ev.action as Record<string, unknown>;
        if (act?.type === "ambush") ambA++;
        if (act?.type === "scout") scoutN++;
      }
    }
  }

  const outcome = computeMatchOutcome(state);
  const buildingsByPlayer: Record<string, string[]> = {};
  const resEnd: Record<string, Record<string, number>> = {};
  for (const pid of state.seatPlayerIds) {
    buildingsByPlayer[pid] = [...state.players[pid].buildings];
    resEnd[pid] = Object.fromEntries(RES_KEYS.map((k) => [k, state.players[pid].resources[k]]));
  }

  const record = {
    schema_version: "1.0",
    rules_version: "v0.7.3",
    match_id: matchId,
    seed: argv.seed,
    run_metadata: {
      runner: "human",
      runner_model: "cli-hotseat",
      started_at: now.toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: 0,
      notes: "packages/engine CLI",
    },
    config: {
      num_players: state.seatPlayerIds.length,
      tribes_in_play: argv.seats,
      max_rounds: 15,
      vp_win_threshold: VP_WIN_THRESHOLD,
      scrap_pool_initial: 5 * state.seatPlayerIds.length,
      turn_order: state.turnOrder,
    },
    players: init.seats.map((s) => ({
      id: s.playerId,
      tribe: s.tribe,
      agent: "human",
      agent_params: {},
    })),
    rounds: roundEvents.map((r) => ({
      round: r.round,
      events: r.events,
      standings_after: computeStandings(state),
      scrap_pool_after: state.scrapPool,
      trailing_bonus_recipients: state.seatPlayerIds.filter(
        (id) => state.players[id].trailingBonusActive,
      ),
      vp_gap_after:
        Math.max(...state.seatPlayerIds.map((id) => state.players[id].vp)) -
        Math.min(...state.seatPlayerIds.map((id) => state.players[id].vp)),
    })),
    outcome: {
      winner_ids: outcome.winner_ids,
      end_trigger: outcome.end_trigger,
      final_round: state.round,
      final_scores: Object.fromEntries(
        state.seatPlayerIds.map((p) => [p, state.players[p].vp]),
      ),
      tiebreaker_used: outcome.tiebreaker_used,
      shared_victory: outcome.shared_victory,
    },
    aggregates: {
      trades_completed_total: tradesTotal,
      trades_by_pair: tradesByPair,
      buildings_by_player: buildingsByPlayer,
      ambushes_attempted: ambA,
      ambushes_hit: ambH,
      ambushes_scouted: ambSc,
      ambushes_expired: ambEx,
      scouts_attempted: scoutN,
      vp_curve: vpCurve,
      trailing_player_won: false,
      leader_changed_count: 0,
      resources_held_at_end: resEnd,
    },
  };

  fs.writeFileSync(outPath, JSON.stringify(record) + "\n", "utf8");
  process.stdout.write(`\nMatch log written to ${outPath}\n`);
}

main().catch((e) => {
  process.stderr.write(String(e) + "\n");
  process.exit(1);
});
