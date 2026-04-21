# Rogue Rivals (v2)

Browser client and tooling for **v2** (`RULES.md`, `GDD.md`): 6‑player continent map, diplomacy, and optional **LLM opponents**.

## Run the game (local)

**Game server** (authoritative API + WebSockets):

```bash
pnpm install
pnpm --filter @rr/shared build && pnpm --filter @rr/llm build && pnpm --filter @rr/engine2 build && pnpm --filter @rr/server build
pnpm --filter @rr/server dev
```

**Web client** (proxies `/api` and `/ws` to the server):

```bash
pnpm --filter @rr/web dev
```

Open **http://127.0.0.1:5173**. Configure the Vite proxy target if your API is not on `127.0.0.1:3001` (`packages/web/vite.config.ts`).

### LLM opponents

LLM calls run **inside the game server** via **`@rr/llm`** (TypeScript). Set provider API keys in the environment (same variable names as before), e.g. in a repo-root `.env` file:

- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `ZAI_API_KEY` (or `ZAI_KEY`), `GROQ_API_KEY`, `OPENROUTER_API_KEY`
- Optional: `LLM_PROVIDER` (`anthropic` | `openai` | `zai` | `groq` | `openrouter`), model overrides per provider

No separate HTTP proxy process is required.

## Simulate full LLM matches (TypeScript engine → jsonl)

Uses **`@rr/engine2`** and **`@rr/llm`** for simulation and LLM order generation.

```bash
pnpm --filter @rr/engine2 batch:llm -- --out-dir simulations/my_batch --ticks 20 --matches 1 --map continent6p
```

- `--map expanded` — 4‑tribe expanded map.
- Requires LLM keys in the environment (see above). Run from **repository root** so imports resolve.

## Replay HTML (from any v2 jsonl trace)

```bash
pnpm --filter @rr/engine2 replay:render -- \
  --trace simulations/my_batch/match_000.jsonl \
  --map 6p-continent \
  --out maps/my_batch_match_000_replay.html
```

- `--map` is `minimal` | `expanded` | `6p-continent` (same as the legacy Python CLI).
- Add `--json-out replay.json` to emit the same payload as JSON (for the web Replay debugger).

## Packages

| Package | Role |
|--------|------|
| **`packages/shared`** | Wire types, costs, API shapes |
| **`packages/llm`** | LLM clients + `decideOrdersPacketJson` (prompts ported from legacy Python) |
| **`packages/engine2`** | Authoritative v2 engine (TS), batch + replay CLIs |
| **`packages/server`** | Fastify API, JWT, match manager, WebSockets |
| **`packages/web`** | React UI (v2) |

**Canonical rules** live in `RULES.md` and `GDD.md`. Simulation and replay use **TypeScript only**.
