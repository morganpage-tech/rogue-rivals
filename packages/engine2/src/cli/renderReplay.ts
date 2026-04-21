/**
 * Render standalone replay HTML / JSON (replaces `python -m tools.v2.render_replay`).
 *
 * Usage (repo root):
 *   pnpm --filter @rr/engine2 replay:render -- --trace simulations/v2_smoke/match_000.jsonl --map expanded --out maps/replay.html
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildReplayPayload } from "./buildReplayPayload.js";

const _here = dirname(fileURLToPath(import.meta.url));

/** Repo root (…/rogue-rivals) when running from packages/engine2/src/cli. */
function repoRoot(): string {
  return join(_here, "..", "..", "..", "..");
}

function resolveTracePath(p: string): string {
  if (p.startsWith("/")) return p;
  return resolve(repoRoot(), p);
}

function renderHtml(payload: Record<string, unknown>): string {
  const shellPath = join(_here, "replayViewerShell.html");
  const shell = readFileSync(shellPath, "utf-8");
  const dataJson = JSON.stringify(payload).replace(/</g, "\\u003c");
  if (!shell.includes("__RR_PAYLOAD__")) {
    throw new Error(`replay viewer shell missing __RR_PAYLOAD__ marker: ${shellPath}`);
  }
  return shell.replace("__RR_PAYLOAD__", dataJson);
}

function parseArgs(argv: string[]) {
  let trace = "";
  let mapKind: "minimal" | "expanded" | "6p-continent" = "expanded";
  let seed: number | undefined;
  let out: string | undefined;
  let jsonOut: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--trace") trace = argv[++i] ?? "";
    else if (a === "--map") {
      const m = argv[++i];
      if (m === "minimal" || m === "expanded" || m === "6p-continent") mapKind = m;
    } else if (a === "--seed") seed = parseInt(argv[++i] ?? "", 10);
    else if (a === "--out") out = argv[++i];
    else if (a === "--json-out") jsonOut = argv[++i];
  }
  return { trace, mapKind, seed, out, jsonOut };
}

function main(): void {
  const { trace, mapKind, seed, out, jsonOut } = parseArgs(process.argv.slice(2));
  if (!trace) {
    console.error("Usage: renderReplay --trace <match.jsonl> [--map minimal|expanded|6p-continent] [--seed N] [--out x.html] [--json-out x.json]");
    process.exit(1);
  }
  if (!out && !jsonOut) {
    console.error("Provide --out and/or --json-out");
    process.exit(1);
  }

  const tracePath = resolveTracePath(trace);
  const payload = buildReplayPayload(tracePath, mapKind, seed);
  const json = JSON.stringify(payload);

  if (out) {
    const html = renderHtml(payload as Record<string, unknown>);
    const outAbs = out.startsWith("/") ? out : resolve(repoRoot(), out);
    mkdirSync(dirname(outAbs), { recursive: true });
    writeFileSync(outAbs, html, "utf-8");
    console.log(`wrote ${outAbs}`);
  }
  if (jsonOut) {
    const jsonAbs = jsonOut.startsWith("/") ? jsonOut : resolve(repoRoot(), jsonOut);
    mkdirSync(dirname(jsonAbs), { recursive: true });
    writeFileSync(jsonAbs, json, "utf-8");
    console.log(`wrote ${jsonAbs}`);
  }
}

main();
