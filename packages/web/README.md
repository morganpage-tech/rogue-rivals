# @rr/web — Rogue Rivals v2

React + Vite client for **v2** rules (`@rr/engine2`): 6?player continent map, order queue, diplomacy, fog of war.

## Run

From the **repository root**:

```bash
pnpm install
pnpm --filter @rr/web dev
```

Dev server: **http://127.0.0.1:5173**

## LLM opponents

LLM runs on the **game server** (`@rr/server` + `@rr/llm`). Start the server with API keys in the environment (see repository root `README.md`). The match wizard lets you set **persona** and optional **extra system prompt** text per match.

## Full-match simulation & replays

See the **repository root `README.md`**: TypeScript batch runner (`batch:llm`) and replay renderer (`replay:render`).
