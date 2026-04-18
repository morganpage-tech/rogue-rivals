# @rr/web — Rogue Rivals hot-seat prototype

First-playable browser client for Rogue Rivals (rules v0.8). Runs the
`@rr/engine` workspace package directly in the browser — no server, no auth,
no network. Four humans crowded around one laptop, passing the device between
turns.

This is the **M1 "local hot-seat"** milestone from `PROTOTYPE_SPEC.md`, with
two differences from the original spec:

- Rendered in React + HTML (no Canvas). Good enough for feel-testing v0.8 rules;
  the Canvas map pass can come later.
- Runs in the browser rather than as a Node CLI. Same engine, same determinism.

## What it proves

- v0.8 rules (including the new bead-in-transit "steal" mechanic) are playable
  end-to-end by humans without a referee
- The hot-seat "pass-the-device" UX works for 2–4 seats
- The TS engine is integrable into a real UI, not just a test harness

## What's NOT in scope yet

- Async / multi-device play (that's M2 — needs a server)
- Magic-link invites, auth, persistence (M2)
- Replay scrubber UI (M3)
- Pixel-art / Canvas map (deferred)
- Tutorial / rule tooltips inside the UI
- Mobile-only layout polish (works on phones, but desktop-first in places)

## Running locally

From the repo root:

```bash
pnpm install
pnpm --filter @rr/engine build
pnpm --filter @rr/web dev
```

Dev server comes up on http://127.0.0.1:5173/.

## How a match plays

1. **Setup** — pick 2–4 seats, name them, pick tribes, pick a seed. Seed is
   reproducible: same seed + same inputs = same match (matches `@rr/engine`
   determinism).
2. **Handoff** — between turns a pass-the-device screen hides the previous
   player's private state. The very first handoff shows the shuffled turn
   order so players know what to expect.
3. **Turn** — current player can propose trades freely, then ends their turn
   with one action: Gather / Build / Ambush / Scout / Pass. Each action opens
   a picker (region or building) before committing. Illegal actions are
   disabled by the engine's `listLegalActions`.
4. **Trades** — "Propose trade" opens a modal with resource steppers. The
   recipient reviews on their own turn and can Accept / Reject / Counter.
   Bead conversion and end-of-round steal logic is handled by the engine.
5. **End** — match-end screen shows standings, winner, end trigger (Great
   Hall / VP threshold / round 15), and a collapsible full event log for
   post-mortem.

## Known rough edges (fine for a first-playable, worth smoothing later)

- Forge costs use the engine's auto-picked resource triple. No UI yet for the
  player to pick which three resources to feed in.
- Other players' VP / resource breakdowns are fully visible on the players
  panel. RULES.md §6.1 allows only ordinal VP rank to be public; tightening
  that is deferred until playtest signals whether it matters.
- No Tribute Route or Trailing Bonus UI yet — events emit and the engine
  applies them, but there's no explicit surface. Simulations show low
  utilisation in heuristics, so this is a reasonable deferral.
- No keyboard shortcuts. Tap/click only.

## Where to look

- `src/App.tsx` — match setup, handoff gate, match view, match-end screen
- `src/TradeModal.tsx` — propose / respond / counter flows
- `src/events.tsx` — maps engine `LogEvent` types into thread-style rendered lines
- `src/format.ts` — resource / region / building / tribe display labels
- `src/styles.css` — a small hand-rolled dark theme (no component library)

The engine is consumed as `@rr/engine` via pnpm workspace protocol.
