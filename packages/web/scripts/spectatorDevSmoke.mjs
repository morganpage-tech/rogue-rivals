/**
 * Smoke-check: create an all-pass autoplay match and verify spectator state
 * includes hand_minimal regions (no LLM keys required).
 *
 * Requires the game server: `pnpm --filter @rr/server dev` (default http://127.0.0.1:3001)
 *
 * Usage: node scripts/spectatorDevSmoke.mjs
 *    or: API_BASE=http://127.0.0.1:3001 node scripts/spectatorDevSmoke.mjs
 */

const API_BASE = process.env.API_BASE ?? "http://127.0.0.1:3001";

const createBody = {
  mapPreset: "hand_minimal",
  tribes: ["orange", "grey", "brown", "red"],
  tickLimit: 8,
  slots: [
    { tribe: "orange", type: "pass" },
    { tribe: "grey", type: "pass" },
    { tribe: "brown", type: "pass" },
    { tribe: "red", type: "pass" },
  ],
};

async function main() {
  const res = await fetch(`${API_BASE}/api/matches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createBody),
  });
  if (!res.ok) {
    throw new Error(`POST /api/matches ${res.status}: ${await res.text()}`);
  }
  const created = await res.json();
  const { matchId } = created;
  if (!matchId) throw new Error("no matchId in response");

  // Autoplay may finish quickly; poll spectator until regions appear.
  let view = null;
  for (let i = 0; i < 40; i++) {
    const g = await fetch(`${API_BASE}/api/matches/${matchId}/spectator`);
    if (g.ok) {
      view = await g.json();
      if (view?.regions?.r_orange_plains) break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  if (!view?.regions?.r_orange_plains) {
    throw new Error("spectator snapshot missing hand_minimal region r_orange_plains");
  }

  const ids = Object.keys(view.regions);
  const need = [
    "r_orange_plains",
    "r_grey_mountains",
    "r_brown_swamps",
    "r_red_desert",
    "r_ruins_center",
    "r_desert_wastes",
  ];
  for (const id of need) {
    if (!ids.includes(id)) throw new Error(`missing region ${id}, got ${ids.join(", ")}`);
  }

  console.log(`spectatorDevSmoke ok matchId=${matchId} tick=${view.tick} regions=${ids.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
