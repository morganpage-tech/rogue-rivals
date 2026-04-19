# @rr/web — Rogue Rivals v2

React + Vite client for **v2** rules (`@rr/engine2`): 6?player continent map, order queue, diplomacy, fog of war.

## Run

From the **repository root**:

```bash
pnpm install
pnpm --filter @rr/web dev
```

Dev server: **http://127.0.0.1:5173**

## LLM opponents (optional)

1. Start the local CORS proxy (repo root):

   ```bash
   python -m tools.v2.llm_http_server
   ```

2. In the UI, set **Proxy URL** to `http://127.0.0.1:8787/v2/llm` (default), or set `VITE_V2_LLM_URL` before build.

3. Configure LLM API keys (`tools/llm_client.py`).

## Full?match simulation & replays

See the **repository root `README.md`**: TypeScript batch runner and Python replay renderer.
