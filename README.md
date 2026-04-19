# Rogue Rivals (v2)

Browser client and tooling for **rules v2** (`RULES_v2.md`): 6‑player continent map, diplomacy, and optional **LLM opponents**.

## Run the game (local)

```bash
pnpm install
pnpm --filter @rr/web dev
```

Open **http://127.0.0.1:5173**. Opponents default to **HTTP LLM**; run the CORS proxy:

```bash
python -m tools.v2.llm_http_server
```

Set **Proxy URL** to `http://127.0.0.1:8787/v2/llm` (or `VITE_V2_LLM_URL`). LLM API keys: see `tools/llm_client.py` / `.env`.

## Simulate full LLM matches (TypeScript engine → jsonl)

Uses **`@rr/engine2`** for all simulation; Python is only used for **`decide_orders`** (same prompts as `tools/v2/run_batch.py`).

```bash
pnpm --filter @rr/engine2 batch:llm -- --out-dir simulations/my_batch --ticks 20 --matches 1 --map continent6p
```

- `--map expanded` — 4‑tribe expanded map (same personas as legacy Python batch).
- Requires `python3` on `PATH`, repo root as cwd, and LLM keys in the environment.

## Replay HTML (from any v2 jsonl trace)

```bash
python -m tools.v2.render_replay \
  --trace simulations/my_batch/match_000.jsonl \
  --map 6p-continent \
  --out maps/my_batch_match_000_replay.html
```

## Packages

| Package | Role |
|--------|------|
| **`packages/engine2`** | Authoritative v2 engine (TS), parity‑tested vs `tools/v2` Python |
| **`packages/web`** | React UI (v2 only) |
| **`tools/v2`** | Python oracle, batch runner (`run_batch.py`), LLM agents, replay renderer |

Legacy **v0.8** hot‑seat lived in `@rr/engine`; it has been removed from the web app but the package remains for older tests if needed.
