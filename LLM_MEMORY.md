# LLM Tick Feedback & Narrative Memory

## 1. Overview

Every LLM opponent receives two memory channels on each tick:

1. **TickHistory** — structured feedback about the *previous* tick: which orders succeeded, which failed (and why), and a numeric state delta (influence change, regions gained/lost, forces lost).
2. **NarrativeBuffer** — a rolling log of key match events (captures, combat, pact breaks, eliminations) spanning the entire game, capped at the most recent 15 entries per tick.

Without these, LLMs played each tick blind — repeating failed recruit orders, re-proposing declined trades, and having no sense of match progression. The feedback loop cut the legal-option error rate by giving the LLM explicit "DO NOT REPEAT THIS ACTION" signals and contextual history.

Both channels run in the **CLI batch runner** (`packages/engine2/src/cli/runLlmBatch.ts`) and the **live server** (`packages/server/src/match/resolution.ts` and `packages/server/src/autoplay/loop.ts`).

---

## 2. Data flow

```
Engine tick() produces ResolutionEvent[]
         │
         ▼
┌─────────────────────────────────────────────┐
│  @rr/shared/tickHistory.ts                  │
│                                             │
│  extractFailuresForTribe(events, tribe)     │
│  extractSuccessesForTribe(events, tribe)    │
│  computeNarrativeForTribe(events, tribe)    │
│  countOwnedRegions(view)                    │
│  buildTickHistory(prev, view, events, tribe)│
│         │                      │            │
│         ▼                      ▼            │
│   TickHistory            NarrativeBuffer    │
│   (per-tick delta)      (rolling log)       │
└────────┬───────────────────────┬────────────┘
         │                       │
         ▼                       ▼
   @rr/llm/compactView.ts
   renders into LLM user prompt:
     "=== LAST TICK RESULTS ==="
     "=== MATCH HISTORY (key events) ==="
         │
         ▼
   @rr/llm/decideOrdersPacket.ts
   combined with persona system prompt + rules → LLM API call
```

### Two runtime paths

| Path | Entry point | TickHistory built in | Narrative updated in |
|------|-------------|---------------------|---------------------|
| CLI batch | `runLlmBatch.ts → llmOrders()` | `buildTickHistory()` inline | `computeNarrativeForTribe()` after `tick()` |
| Server (mixed human+LLM) | `resolution.ts → buildPackets()` | `buildTickHistory()` per LLM tribe | `resolveTick()` after `tick()` |
| Server (autoplay-only) | `loop.ts → runAutoPlayLoop()` | `buildTickHistory()` per LLM tribe | Same path through `resolveTick()` |

---

## 3. TickHistory — per-tick feedback

Defined in `@rr/llm/src/compactView.ts` as `TickHistory` (re-exported via `@rr/llm`). Built by `buildTickHistory()` in `@rr/shared/tickHistory.ts`.

### Fields

```ts
interface TickHistoryInput {
  lastChooseIds: readonly string[];          // option IDs the LLM picked last tick
  lastFailedActions: readonly {
    id: string;                              // "build", "recruit", "move", "scout", "respond"
    reason: string;                          // engine failure reason
  }[];
  lastSucceededActions: readonly string[];   // e.g. "build:r_or_vulpgard:fort"
  stateDelta: {
    influenceBefore: number;
    influenceAfter: number;
    regionsGained: number;
    regionsLost: number;
    forcesLost: number;
    structuresBuilt: number;
  };
}
```

### How it's built

`buildTickHistory(prev, currentView, prevEvents, tribe)` takes:

- `prev: PrevTickState` — influence, region count, and choose IDs snapshotted at the end of the previous tick
- `currentView: ProjectedView` — the current tick's projected view (for current influence/region count)
- `prevEvents: ResolutionEvent[]` — events from the previous tick's resolution
- `tribe: Tribe` — which tribe this is for

It calls `extractFailuresForTribe`, `extractSuccessesForTribe`, and `countOwnedRegions` internally.

### Prompt rendering

In `compactView()` (tick > 1 and `prev` exists):

```
=== LAST TICK RESULTS ===
Your orders: recruit_or_vulpgard_t2, move_f_or_1_r_core_moon_ford
Succeeded: recruit:r_or_vulpgard:t2, move:f_or_1:r_core_moon_ford
FAILED: build (reason: region already has 2 structures) -- DO NOT REPEAT THIS ACTION
State change: Influence +5 (now 18), regions +1, 1 structure(s) built
```

### State tracking

`PrevTickState` is stored after each tick:

```ts
interface PrevTickState {
  influence: number;
  regionCount: number;
  chooseIds: readonly string[];
}
```

- **CLI**: `prevTickState: Map<Tribe, PrevTickState>` local variable in `runMatch()`
- **Server**: `match.prevTickState` on `ActiveMatch`

---

## 4. NarrativeBuffer — match-long memory

Defined in `@rr/llm/src/narrativeBuffer.ts`. A simple append-only log per tribe.

### Interface

```ts
class NarrativeBuffer {
  add(tick: number, text: string): void;
  render(maxEntries?: number): string;  // default 15
  get length(): number;
}
```

### Population

After every `tick()` resolution, `computeNarrativeForTribe(events, tribe)` (from `@rr/shared/tickHistory.ts`) extracts second-person narrative entries from `ResolutionEvent[]`. Events that are tracked:

| Event kind | Narrative entry (if tribe is involved) |
|------------|---------------------------------------|
| `region_captured` | "You captured X from Y" / "You LOST X to Y" |
| `region_claimed` | "You claimed unclaimed region X" |
| `combat` | "Combat: you attacked/defended against X at Y (result)" |
| `pact_broken` | "You broke a pact with X" / "X broke a pact with you" |
| `war_declared` | "War declared between you and X" |
| `tribe_eliminated` | "X was eliminated" / "You were eliminated" |
| `caravan_intercepted` | "Your caravan to X was intercepted by Y (Z Influence lost)" |
| `caravan_delivered` | "Your caravan delivered Z Influence to X" |
| `force_destroyed_no_retreat` | "Your force X was destroyed (no retreat)" |
| `arrival_rejected_garrison_cap` | "Your force X arrived at full region and was destroyed" |
| `victory` | "GAME END: X" |

### Prompt rendering

In `compactView()` (when buffer has entries):

```
=== MATCH HISTORY (key events) ===
Tick 3: You captured r_core_moon_ford from grey
Tick 5: Combat: you attacked brown at r_border_saltfen_crossing (attacker_retreated)
Tick 7: grey broke a pact with you
Tick 12: red was eliminated
```

### State tracking

- **CLI**: `narrativeBuffers: Map<Tribe, NarrativeBuffer>` local variable in `runMatch()`
- **Server**: `match.narrativeBuffers` on `ActiveMatch`, initialized in constructor for each alive tribe
- **Restore**: `restore.ts` replays all historical ticks and repopulates buffers from JSONL events

---

## 5. Persona adaptation rules

Each persona in `@rr/llm/src/personas.ts` has an `adaptation_rules` string injected into the system prompt under an "ADAPTATION RULES" header. These are persona-specific behavioral triggers combined with a universal rule.

### Universal adaptation

Included in every persona:

> CRITICAL: Review your FAILED actions from last tick in the tick results section. Do NOT repeat any action that failed. If recruit failed with 'garrison already present', you must first move or use that force before recruiting there. If build failed with 'full', build in a different region. If an option ID was not found in the legal options list, only use exact IDs from the current tick's Legal order options list. If you have been repeating the same action for multiple ticks with no progress, CHANGE your strategy.

### Per-persona examples

| Persona | Key adaptation triggers |
|---------|------------------------|
| **warlord** | Break NAPs after 6 passive ticks; attack neighbors with no visible military; re-recruit at higher tier after failed attack |
| **merchant_prince** | Stop trading after 3 consecutive rejections; build defensive forces when neighbor masses military; expand when flush with Influence |
| **paranoid_isolationist** | Must expand if all borders secured with watchtowers + NAPs; diversify from watchtower-only after 5 ticks |
| **opportunist** | Form coalition against runaway leader (40%+ regions); take risks if 3rd/4th place after tick 15; exploit gaps when neighbors fight |
| **veilweaver** | Strike overextended neighbors immediately; must scout or expand if passive 5+ ticks |
| **frostmarshal** | Push weakest flank when secure; attack unguarded regions without hesitation |
| **cragwise** | Expand into unclaimed territory when diplomatically saturated; strike overextended opponents even if it breaks NAP |
| **shadowreader** | Rush shrines if close to cultural victory; take decisive action if passive 8+ ticks |
| **palmstalker** | Attack exposed territory when opponents have forces in transit; break NAPs for decisive payoffs; keep scouts active constantly |

### Temperature

All personas use 0.4–0.45 temperature (up from 0.2). More aggressive personas (opportunist, palmstalker) use 0.45.

---

## 6. Where state lives

### CLI batch runner

```
runMatch() in runLlmBatch.ts
├── narrativeBuffers: Map<Tribe, NarrativeBuffer>    (local, one per tribe)
├── prevTickState: Map<Tribe, PrevTickState>         (local)
├── prevTickEvents: ResolutionEvent[]                (local)
└── loop iteration:
    ├── buildTickHistory(prev, view, prevEvents, tribe)
    ├── llmOrders(view, persona, tickHistory, narrative)
    ├── tick(state, packets)
    ├── computeNarrativeForTribe → buf.add()
    └── update prevTickState, prevTickEvents
```

### Live server

```
ActiveMatch (match/activeMatch.ts)
├── narrativeBuffers: Map<Tribe, NarrativeBuffer>    (class field)
├── prevTickState: Map<Tribe, PrevTickState>         (class field)
├── prevTickEvents: ResolutionEvent[]                (class field)
│
├── resolution.ts (human+mixed path)
│   ├── buildPackets():
│   │   └── per LLM tribe: buildTickHistory() → generateLlmOrders()
│   └── resolveTick():
│       ├── computeNarrativeForTribe → buf.add()  (per alive tribe)
│       ├── update match.prevTickState              (per alive tribe)
│       └── update match.prevTickEvents
│
├── autoplay/loop.ts (LLM-only path)
│   └── per LLM tribe: buildTickHistory() → generateLlmOrders()
│   └── then calls resolveTick() which does the narrative/prevState updates
│
└── persistence/restore.ts (server restart)
    ├── replays all ticks from JSONL
    ├── computeNarrativeForTribe per tick → populates narrativeBuffers
    ├── populates prevTickState from final projected views
    └── stores final prevTickEvents
```

---

## 7. Shared helpers reference

All in `packages/shared/src/tickHistory.ts`, exported via `@rr/shared`.

| Function | Signature | Returns |
|----------|-----------|---------|
| `countOwnedRegions` | `(view: ProjectedView) → number` | Regions owned by `view.forTribe` |
| `extractFailuresForTribe` | `(events, tribe) → {id, reason}[]` | Failed actions (build/recruit/move/scout/respond) |
| `extractSuccessesForTribe` | `(events, tribe) → string[]` | Succeeded actions as short labels |
| `computeNarrativeForTribe` | `(events, tribe) → string[]` | Second-person narrative entries |
| `buildTickHistory` | `(prev, currentView, prevEvents, tribe) → TickHistoryInput` | Assembles full TickHistory object |

### Types

| Type | Location | Purpose |
|------|----------|---------|
| `PrevTickState` | `@rr/shared` | Snapshot: influence, regionCount, chooseIds |
| `TickHistoryInput` | `@rr/shared` | Full tick feedback (built by `buildTickHistory()`) |
| `TickHistory` | `@rr/llm` | Structurally identical to `TickHistoryInput`; separate declaration in `@rr/llm/compactView.ts`. Server imports the *type* from `@rr/llm` and the *function* (`buildTickHistory`) from `@rr/shared`, relying on structural typing. |
| `NarrativeBuffer` | `@rr/llm` | Append-only rolling event log |

---

## 8. Adding new event types

When a new `ResolutionEvent.kind` is added to the engine:

1. **`computeNarrativeForTribe()`** — add a branch if the event is narratively meaningful for the acting tribe (captures, combat, pact changes, eliminations, force losses). Write in second person ("You captured…", "You lost…").

2. **`extractFailuresForTribe()`** — add a branch if the event represents an order failure (build_failed, recruit_failed, etc.). Provide the `id` (action category) and `reason`.

3. **`extractSuccessesForTribe()`** — add a branch if the event represents a successful order (built, recruited, dispatched, etc.). Provide a short label like `"build:r_core_moon_ford:fort"`.

4. **`buildTickHistory()`** — update the `forcesLost` / `structuresBuilt` counters if the new event kind is relevant.

No other changes needed — the prompt rendering in `compactView()` is generic and will include whatever entries the helpers produce.
