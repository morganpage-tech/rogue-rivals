# Rogue Rivals — Server-Authoritative Migration Plan

**Version:** 1.4
**Date:** 2026-04-20
**Status:** Ready for implementation
**Companion docs:** `GDD.md`, `RULES.md`, `PROTOTYPE_SPEC.md`

---

## 0. Purpose

Move all game simulation from the browser client to a dedicated server so that:

1. The client is a **thin UI** — it renders views and sends orders, nothing more.
2. **Cheating is structurally impossible** — the client never has the full `GameState` or engine code.
3. **Multi-human multiplayer** is supported (async, wait-for-all tick resolution).
4. **LLM-only matches can be spectated live** with god-mode visibility and playback controls.

### What changes


| Before (current)                                 | After                                                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `@rr/engine2` runs in the browser                | `@rr/engine2` runs only on the server                                                              |
| `GameState` lives in a React `useRef`            | `GameState` lives in server memory                                                                 |
| Client calls `tick()` locally                    | Client sends orders via REST; server resolves                                                      |
| Client calls `projectForPlayer()` for all tribes | Server projects per-player; client receives one `ProjectedView`                                    |
| LLM opponent orchestration in browser            | Server calls LLM APIs directly                                                                     |
| No auth, no persistence                          | JWT auth per tribe; JSONL packet log on disk (deterministic replay from seed — no state snapshots) |


### What does NOT change

- `packages/engine2` — **game logic untouched**. Every rule, every resolution step, every hash output is byte-identical before and after this migration. Package boundaries do change in Phase 1 (wire types, cost constants, and the pure preview helpers relocate to `@rr/shared`, and engine2 imports them back). The `tick()` / `initMatch()` / `projectForPlayer()` / `hashState()` behavior does not. Conformance tests passing with unchanged state hashes is the proof point.
- `RULES.md` — normative rules unchanged.
- `GDD.md` — design pillars unchanged.
- `projectForPlayer()` fog-of-war semantics unchanged (just moves to server).

---

## 1. Architecture

```
Browser (thin client)                 Server (authoritative)
┌──────────────────────┐              ┌───────────────────────────────────┐
│ React + Vite         │              │ Fastify (Node.js)                 │
│                      │              │                                   │
│ /create ─────────────┤── REST ────► │ POST /api/matches                 │
│ (match wizard)       │              │   creates match, starts auto-play │
│                      │              │   if all slots are LLM/pass       │
│ /watch/:id ──────────┤── WS ──────►│ WS /ws/spectator?matchId=X        │
│ (spectator, no auth) │              │   pushes SpectatorView            │
│                      │◄─ WS push ──│   (live ticks + full history)     │
│ /play/:id ───────────┤── REST ────►│ POST /api/matches/:id/orders      │
│ (player, JWT auth)   │              │   submits Order[] for current tick│
│                      │◄─ WS push ──│ WS /ws/play?matchId=X             │
│                      │              │   (JWT via first message §3.2)    │
│                      │              │   pushes ProjectedView            │
│                      │              │                                   │
│                      │              │ ┌─────────────────────────────┐   │
│                      │              │ │ @rr/engine2                 │   │
│                      │              │ │ initMatch / tick /          │   │
│                      │              │ │ projectForPlayer /          │   │
│                      │              │ │ projectForSpectator /       │   │
│                      │              │ │ hashState                   │   │
│                      │              │ └──────────────┬──────────────┘   │
│                      │              │                │ imports           │
│                      │              │                ▼                   │
│                      │              │ ┌─────────────────────────────┐   │
│                      │              │ │ @rr/shared                  │   │
│                      │              │ │ engineTypes / costs /       │   │
│                      │              │ │ orderPreview                │   │
│                      │              │ │ (sanitizePlayerOrders etc.) │   │
│                      │              │ └─────────────────────────────┘   │
│                      │              │                                   │
│                      │              │ In-memory match state             │
│                      │              │ JSONL packet log on disk          │
└──────────────────────┘              └───────────────────────────────────┘
```

The client has **zero engine code**. `@rr/engine2` is removed from `packages/web/package.json`.

---

## 2. Monorepo layout

```
rogue-rivals/
├── packages/
│   ├── shared/            # NEW — wire types, preview helpers, cost constants
│   │   ├── src/
│   │   │   ├── api.ts           # REST request/response shapes
│   │   │   ├── spectator.ts     # SpectatorView and related types
│   │   │   ├── wsMessages.ts    # WebSocket message discriminated unions
│   │   │   ├── auth.ts          # JWT claims shape
│   │   │   ├── engineTypes.ts   # wire-facing types
│   │   │   │                    # (Tribe, RegionId, Order, OrderPacket,
│   │   │   │                    #  ProjectedView, Region, Pact, etc.)
│   │   │   ├── costs.ts         # FORCE_RECRUIT_COST, SCOUT_COST,
│   │   │   │                    # STRUCTURE_COST — owned by shared
│   │   │   ├── orderPreview.ts  # pure helpers: filterOrdersByInfluenceBudget,
│   │   │   │                    # ordersExceedInfluenceBudget,
│   │   │   │                    # dedupeMovesOnePerForce,
│   │   │   │                    # sanitizePlayerOrders, wouldClipOrders
│   │   │   └── index.ts         # re-exports
│   │   ├── package.json         # no workspace deps
│   │   └── tsconfig.json
│   │
│   │   # Dependency direction at runtime:
│   │   #   @rr/shared  → (nothing)
│   │   #   @rr/engine2 → @rr/shared     (types, costs, preview helpers)
│   │   #   @rr/server  → @rr/engine2, @rr/shared
│   │   #   @rr/web     → @rr/shared     (and ONLY @rr/shared)
│   │   # @rr/engine2 is NEVER in @rr/web's dependency closure.
│   │
│   ├── engine2/           # UNCHANGED — game rules
│   │   └── ...
│   │
│   ├── server/            # NEW — Fastify server
│   │   ├── src/
│   │   │   ├── index.ts              # Fastify bootstrap + startup
│   │   │   ├── routes/
│   │   │   │   ├── createMatch.ts         # POST /api/matches
│   │   │   │   ├── joinMatch.ts           # POST /api/matches/:id/join
│   │   │   │   ├── getMatch.ts            # GET  /api/matches/:id
│   │   │   │   ├── submitOrders.ts        # POST /api/matches/:id/orders
│   │   │   │   ├── spectator.ts           # GET  /api/matches/:id/spectator
│   │   │   │   └── spectatorHistory.ts    # GET  /api/matches/:id/spectator/history
│   │   │   ├── ws/
│   │   │   │   ├── playerHub.ts           # WS /ws/play — authed, pushes ProjectedView
│   │   │   │   └── spectatorHub.ts        # WS /ws/spectator — open, pushes SpectatorView
│   │   │   ├── match/
│   │   │   │   ├── matchManager.ts        # in-memory match registry, lifecycle
│   │   │   │   ├── activeMatch.ts         # per-match state + tick buffer
│   │   │   │   └── resolution.ts          # tick resolution + projection + broadcast
│   │   │   ├── autoplay/
│   │   │   │   ├── loop.ts                # auto-play loop for LLM-only matches
│   │   │   │   └── llmOpponent.ts         # generate orders via LLM API
│   │   │   ├── persistence/
│   │   │   │   └── matchLog.ts            # JSONL packet log: append + restore
│   │   │   └── auth/
│   │   │       └── jwt.ts                 # issue/verify player JWTs
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/               # REFACTORED — thin client
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx                  # router setup
│       │   ├── routes/
│       │   │   ├── Landing.tsx              # / — landing page
│       │   │   ├── CreateMatch.tsx          # /create — LLM match wizard
│       │   │   ├── WatchMatch.tsx           # /watch/:matchId — spectator view
│       │   │   └── PlayMatch.tsx            # /play/:matchId — player view
│       │   ├── state/
│       │   │   ├── spectatorStore.ts        # Zustand: SpectatorView buffer, playback
│       │   │   └── playerStore.ts           # Zustand: ProjectedView, order submission
│       │   ├── components/
│       │   │   ├── SpectatorMap.tsx         # V2Map adapter for SpectatorView
│       │   │   ├── SpectatorTimeline.tsx    # pause/play/scrub + event log
│       │   │   ├── SpectatorScoreboard.tsx  # all tribes, all stats
│       │   │   ├── PlayerOrderQueue.tsx     # adapted OrderQueue
│       │   │   └── MatchWizard.tsx          # tribe/persona/LLM config form
│       │   └── replay/
│       │       └── (kept — works with server replay data)
│       └── package.json                # depends on @rr/shared only, NOT @rr/engine2
│
├── data/                   # NEW — created at runtime
│   └── matches/            # JSONL packet logs (match_init + tick + match_end)
│       └── {matchId}.jsonl
│
├── GDD.md
├── RULES.md
├── PROTOTYPE_SPEC.md
└── SERVER_MIGRATION.md     # this file
```

---

## 3. `packages/shared` — API contract

> **Type-boundary rule:** all engine types referenced below (`Order`,
> `ProjectedView`, `Tribe`, `RegionId`, `OrderPacket`, `Region`, `Pact`,
> `Proposal`, `ResolutionEvent`, `Announcement`, `MapPreset`, etc.) are
> **owned by** `@rr/shared/engineTypes.ts`. `@rr/engine2` imports them
> from `@rr/shared`; clients do the same. `@rr/engine2` itself is
> never in `@rr/web`'s dependency closure.

### 3.1 REST endpoints

#### `POST /api/matches` — Create match

```
Request: CreateMatchRequest
  seed?: number
  mapPreset: MapPreset
  tribes: Tribe[]
  slots: SlotConfig[]         // one per tribe
  tickTimeoutSeconds?: number // auto-pass timeout (default: 300 for human, 0 for LLM)
  tickLimit?: number          // default: 60

  SlotConfig:
    tribe: Tribe
    type: "human" | "llm" | "pass"
    displayName?: string       // for human slots
    llmConfig?: {
      url: string
      token?: string
      persona?: string         // warlord | merchant | paranoid | opportunist | kingmaker | random
      systemPrompt?: string    // free-form override
    }

Response: CreateMatchResponse
  matchId: string
  spectatorUrl: string         // https://host/watch/{matchId}
  inviteLinks: Record<Tribe, string>
                               // One entry per HUMAN slot only: tribe →
                               // https://host/play/{matchId}?token={jwt}
                               // For autoPlay matches (zero human slots)
                               // this is an empty object ({}), never omitted.
  autoPlay: boolean            // derived — see below
```

**`autoPlay` is derived, not requested.** The server computes
`autoPlay = slots.every(s => s.type !== "human")` at match creation
and stores it on the `ActiveMatch`. It is **not** a field on
`CreateMatchRequest`. Everywhere else in this document that says
"autoPlay matches" (spectator endpoints §3.1–§3.2, server gating
§4.5, §4.7), the rule is exactly this derivation: a match is an
autoPlay match iff it has zero human slots. If a later revision wants
host-controlled "start paused" or "manual start" semantics, that's a
new explicit field — not overloading `autoPlay`.

#### `POST /api/matches/:id/join` — Join as human player

```
Request: JoinMatchRequest
  tribe: Tribe
  displayName: string

Response: JoinMatchResponse
  tribe: Tribe
  token: string                // JWT for all subsequent requests
  playUrl: string              // https://host/play/{matchId}
```

#### `GET /api/matches/:id` — Get current state

```
Auth: Bearer JWT (player)
Response: PlayerMatchView
  view: ProjectedView          // server-computed projection for this tribe
  submittedThisTick: boolean
  waitingFor: Tribe[]          // tribes that haven't submitted yet
  matchStatus: "lobby" | "running" | "finished"
```

#### `POST /api/matches/:id/orders` — Submit orders

```
Auth: Bearer JWT (player)
Request: SubmitOrdersRequest
  orders: Order[]              // plain Order[] (types via @rr/shared)
  tick: number                 // client's expected tick (rejects stale)
  clientPacketId: string       // UUID v4, generated once per submit
                               // action; used for idempotent retries

Response: SubmitOrdersResponse
  status: "accepted" | "resolved" | "duplicate"
  pendingTribes?: Tribe[]      // if accepted but not all submitted
  view?: ProjectedView         // if resolved immediately

  // "duplicate" is returned when the tuple
  //   (matchId, tribe, tick, clientPacketId)
  // has already been accepted. The body mirrors the original
  // acceptance response so client retries are safe.
  //
  // If the tribe has already submitted this tick with a DIFFERENT
  // clientPacketId, the server rejects with HTTP 409 Conflict —
  // never silently overwriting prior orders.
```

#### `GET /api/matches/:id/spectator` — Current spectator view

```
Auth: none (open)
Only available for autoPlay matches.
Response: SpectatorView        // god-mode view
```

#### `GET /api/matches/:id/spectator/history` — Full tick history

```
Auth: none (open)
Only available for autoPlay matches.
Response: SpectatorHistoryResponse
  ticks: SpectatorView[]       // one per resolved tick
  matchStatus: "running" | "finished"
```

### 3.2 WebSocket messages

#### Player channel: `WS /ws/play?matchId=X`

**Do not put the JWT in the query string** — it leaks via access logs, Referer, and browser history. Only `matchId` is in the URL.

**Auth handshake:** The client must send, as the **first** application message after the socket opens:

```typescript
{ type: "auth"; token: string } // Bearer-equivalent: match-scoped JWT from join (§3.4)
```

The server verifies `token` (`matchId` from URL must equal claim, tribe extracted). On success: send the initial `view` (same as today) and register the socket. On failure: close the socket with code **4401** (or **1008** policy violation with reason `unauthorized`) **before** accepting `heartbeat` or relaying game traffic. If no valid `auth` arrives within **5 seconds** of connect, close unauthorized.

**Invite links** (`https://host/play/{matchId}?token={jwt}`) may still use `?token=` for the **HTTP** play page (deep link / clipboard); the **WebSocket** connection opened from that page must pass the same JWT in the `auth` message, not in `ws://…?token=`.

One authenticated connection per tribe per match (duplicate: close older socket or reject new — implementation choice, document in server).

**Client → Server:**

```typescript
type WsPlayerIn =
  | { type: "auth"; token: string }
  | { type: "heartbeat" }
```

**Server → Client:**

```typescript
type WsPlayerOut =
  | { type: "view"; projectedView: ProjectedView; tick: number }
  | { type: "waiting_for"; tribes: Tribe[]; tick: number }
  | { type: "match_end"; winner: Tribe | Tribe[] | null }
  | { type: "error"; message: string }
```

#### Spectator channel: `WS /ws/spectator?matchId=X`

No auth. Read-only. Only for `autoPlay` matches.

**Server → Client:**

```typescript
type WsSpectatorOut =
  | { type: "spectator_history"; ticks: SpectatorView[]; matchStatus: string }
  | { type: "spectator_tick"; view: SpectatorView; tickNumber: number }
  | { type: "spectator_match_end"; winner: Tribe | Tribe[] | null }
  | { type: "error"; message: string }
```

On connect, the server immediately sends `spectator_history` with all ticks available for that match (from in-memory `tickBuffer` while the match is hot, or rebuilt from JSONL replay if the match was evicted from RAM — §4.9), then streams `spectator_tick` for each new resolution.

### 3.3 `SpectatorView` type

God-mode view with no fog of war. All information visible.

```typescript
interface SpectatorView {
  readonly tick: number;
  readonly tickLimit: number;
  readonly tribesAlive: Tribe[];
  readonly winner: Tribe | Tribe[] | null;

  readonly regions: Record<RegionId, Region>;
  readonly forces: Record<ForceId, SpectatorForce>;
  readonly transits: SpectatorTransit[];
  readonly scouts: SpectatorScoutInfo[];
  readonly caravans: SpectatorCaravanInfo[];
  readonly pacts: Pact[];
  readonly announcements: Announcement[];
  readonly players: Record<Tribe, SpectatorPlayerState>;
  readonly resolutionEvents: ResolutionEvent[];
}

interface SpectatorForce {
  readonly id: ForceId;
  readonly owner: Tribe;
  readonly tier: ForceTier;            // exact tier, not fuzzy
  readonly location: ForceLocation;
}

interface SpectatorTransit {
  readonly forceId: ForceId;
  readonly owner: Tribe;
  readonly tier: ForceTier;
  readonly trailIndex: number;
  readonly directionFrom: RegionId;
  readonly directionTo: RegionId;
  readonly ticksRemaining: number;     // exact, not hidden
}

interface SpectatorScoutInfo {
  readonly id: ScoutId;
  readonly owner: Tribe;
  readonly targetRegionId: RegionId;
  readonly location: ScoutLocation;
}

interface SpectatorCaravanInfo {
  readonly id: CaravanId;
  readonly owner: Tribe;
  readonly recipient: Tribe;
  readonly amountInfluence: number;
  readonly path: RegionId[];
  readonly currentIndex: number;
  readonly ticksToNextRegion: number;
}

interface SpectatorPlayerState {
  readonly tribe: Tribe;
  readonly influence: number;
  readonly reputationPenaltyExpiresTick: number;
}
```

**Producer function:** `projectForSpectator(state: GameState): SpectatorView`

This function is **new** in `@rr/engine2`, added alongside the existing
`projectForPlayer(state, tribe)`. It is the only sanctioned way to
construct a `SpectatorView`; §4.4 step 4.d and §4.5 call it directly,
and the server never hand-builds the shape inline.

```typescript
// packages/engine2/src/projectForSpectator.ts (NEW — Phase 3)
//
// Pure projection: GameState → SpectatorView. No fog-of-war filtering,
// exact force tiers, exact transit ticks-remaining, all pacts visible.
// Output type is imported from @rr/shared/spectator (per §3 type-
// boundary rule). No RNG, no state mutation — safe to call on a
// finished tick's result.state.
export function projectForSpectator(state: GameState): SpectatorView;
```

Exported from `packages/engine2/src/index.ts` alongside `projectForPlayer`.
**Not** in the `@rr/shared` surface: its input is `GameState`, which
is engine-internal and never crosses the wire. Only the *output* type
(`SpectatorView`) lives in `@rr/shared`. Web never imports this
function; only the server does.

### 3.4 Auth

- JWT signed with HS256 using a server-side secret
- Claims: `{ matchId: string, tribe: Tribe, role: "player", iat, exp }`
- Token is match-scoped — not valid for other matches
- Expires: match end + 1 hour, or 30 days (whichever is sooner)
- Spectator endpoints require no auth
- **WebSocket:** the JWT is sent in the first `{ type: "auth", token }` message (§3.2), not in the WS URL. HTTP invite links may still use `?token=` on `/play/...` for convenience; that is separate from the socket.

### 3.5 Client-side preview helpers (`@rr/shared/orderPreview.ts`)

The order-queue UX needs to tell the player, in real time, whether the
orders they've queued will fit their Influence budget and which would
be clipped before the server even sees them. Making that round-trip
to the server for every checkbox toggle is poor UX; bundling the full
`@rr/engine2` to do it client-side would defeat the anti-cheat goal.

Resolution: the **pure, state-free** preview helpers live in
`@rr/shared/orderPreview.ts` and are imported by both the web client
(for live preview) and the server (for authoritative sanitization).
One implementation, bit-identical behavior on both sides.

Exposed functions (moved from `packages/engine2/src/`):

```typescript
// All operate on (startInfluence: number, orders: Order[]) — no
// GameState, no RNG, no hidden state. Safe to ship in the client bundle.

function filterOrdersByInfluenceBudget(
  startInfluence: number,
  orders: readonly Order[],
): Order[];

function ordersExceedInfluenceBudget(
  startInfluence: number,
  orders: readonly Order[],
): boolean;

function dedupeMovesOnePerForce(orders: readonly Order[]): Order[];

function sanitizePlayerOrders(
  startInfluence: number,
  orders: readonly Order[],
): Order[];

function wouldClipOrders(
  startInfluence: number,
  orders: readonly Order[],
): boolean;
```

Cost constants (`FORCE_RECRUIT_COST`, `SCOUT_COST`, `STRUCTURE_COST`)
also move to `@rr/shared/costs.ts`; `@rr/engine2`'s internal
`tick.ts` imports them from shared. This means the costs have exactly
one definition — no preview/authority drift is possible.

**Legal-option discovery** (which moves are permitted given terrain,
adjacency, garrison presence, etc.) is NOT in the preview helpers —
those need the full game state and therefore stay server-side. The
server includes a `legalOrderOptions` array on the `ProjectedView` it
pushes to each player; the client picks from that list and uses the
preview helpers to show budget/clip hints.

**Anti-cheat posture:** the preview helpers are purely advisory
client-side. The server runs `sanitizePlayerOrders()` authoritatively
in §4.4 step 2.e regardless of what the client submits. A malicious
client that skips preview and submits over-budget orders simply has
those orders dropped by the server; preview is UX, not enforcement.

---

## 4. `packages/server` — Implementation

### 4.1 Dependencies

```json
{
  "dependencies": {
    "@rr/engine2": "workspace:*",
    "@rr/shared": "workspace:*",
    "fastify": "^5.0.0",
    "@fastify/websocket": "^11.0.0",
    "@fastify/jwt": "^9.0.0",
    "@fastify/cors": "^10.0.0",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.17.14",
    "@types/uuid": "^10.0.0",
    "typescript": "^5.7.3",
    "vitest": "^3.0.5"
  }
}
```

### 4.2 `ActiveMatch` — per-match state

```typescript
interface SlotInfo {
  tribe: Tribe;
  type: "human" | "llm" | "pass";
  displayName?: string;
  jwt?: string;                    // issued when human joins
  joinedAt?: Date;
  llmConfig?: {
    url: string;
    token?: string;
    persona?: string;
    systemPrompt?: string;
  };
}

interface TickBufferEntry {
  tickNumber: number;
  stateHash: string;
  spectatorView: SpectatorView;
  projectedViews: Record<Tribe, ProjectedView>;
  events: ResolutionEvent[];
  packetsByTribe: Record<Tribe, OrderPacket>;
}

interface SubmittedOrderEntry {
  clientPacketId: string;                      // dedupe key for retries
  tick: number;                                // must match current tick
  orders: Order[];
  acceptedResponse: SubmitOrdersResponse;      // cached for "duplicate" replies
}

class ActiveMatch {
  id: string;
  config: MatchConfig;
  slotConfig: CreateMatchRequest;
  state: GameState;                            // authoritative engine state
  slots: Map<Tribe, SlotInfo>;
  submittedOrders: Map<Tribe, SubmittedOrderEntry>; // orders for current tick
  tickBuffer: TickBufferEntry[];               // one entry per resolved tick — O(resolved) ≤ O(tickLimit); see §4.9 eviction
  tickTimeoutTimer: ReturnType<typeof setTimeout> | null; // §4.4b; null when tickTimeoutSeconds === 0 or between ticks
  spectatorSockets: Set<WebSocket>;
  playerSockets: Map<Tribe, WebSocket>;
  status: "lobby" | "running" | "finished";
  autoPlay: boolean;                            // derived from slots (§3.1)

  // Per-match async lock — see §4.4a. All writers (submit, resolve,
  // autoplay iteration) serialize through `withLock()`. Reads that
  // tolerate seeing either tick N or N+1 (GET view, spectator history
  // slice) bypass it.
  private _lock: Promise<void>;
  withLock<T>(op: () => Promise<T>): Promise<T>;
}
```

### 4.3 `MatchManager` — match registry

```typescript
class MatchManager {
  private matches: Map<string, ActiveMatch>;

  // Lifecycle
  createMatch(request: CreateMatchRequest): {
    matchId: string;
    spectatorUrl: string;
    inviteLinks: Record<Tribe, string>;      // one entry per human slot;
                                             // {} if autoPlay (never omitted)
    autoPlay: boolean;                        // derived from slots
  };
  joinMatch(matchId: string, tribe: Tribe, displayName: string): { token: string };
  restoreMatches(): void;                     // called once on server boot;
                                              // rehydrates all .jsonl files in
                                              // DATA_DIR via match log replay (§4.9)
                                              // and restarts autoPlay loops

  // Player actions
  submitOrders(
    matchId: string,
    tribe: Tribe,
    orders: Order[],
    tick: number,
    clientPacketId: string,               // UUID v4 from client (§3.1)
  ): Promise<SubmitOrdersResponse>;        // "accepted" | "resolved" | "duplicate";
                                          // REST handler awaits this. Throws / rejects
                                          // HTTP 409 on conflicting packetId for same
                                          // (tribe, tick) — see §4.4 step 3.d
  getView(matchId: string, tribe: Tribe): {
    view: ProjectedView;
    submittedThisTick: boolean;
    waitingFor: Tribe[];
  };

  // Spectator
  getSpectatorView(matchId: string): SpectatorView;
  getSpectatorHistory(matchId: string): SpectatorView[];
  getSpectatorSocketSet(matchId: string): Set<WebSocket>;

  // WebSocket registration
  registerPlayerSocket(matchId: string, tribe: Tribe, ws: WebSocket): void;
  unregisterPlayerSocket(matchId: string, tribe: Tribe): void;
  registerSpectatorSocket(matchId: string, ws: WebSocket): void;
  unregisterSpectatorSocket(matchId: string, ws: WebSocket): void;

  // Shutdown (§4.11)
  drain(options?: { timeoutMs: number }): Promise<void>;

  // Internal
  private checkAndResolve(match: ActiveMatch): Promise<void>;
  private broadcastToPlayers(match: ActiveMatch, entry: TickBufferEntry): void;
  private broadcastToSpectators(match: ActiveMatch, view: SpectatorView): void;
}
```

### 4.4 Tick resolution flow

**Concurrency** matches **§4.4a**: mutations to `state`, `submittedOrders`, and `tickBuffer` happen only inside `match.withLock`. On the human submission path, use **two** critical sections—(1) accept orders and decide whether the tick is ready to resolve, (2) run **`async` `resolveTick(match)`** (always **`await`ed** inside the second section). That mirrors §4.4a: step 3’s “all submitted?” decision is atomic with the last stored submission; resolution—including LLM **`await`s** inside step 4.a—runs in a separate acquisition so mixed human+LLM matches are correct. The `POST /orders` route is **`async`** and **`return await matchManager.submitOrders(...)`** so the caller can receive `{ status: "resolved", view }` in-band when this request triggered resolution (step 4.l).

```
1. Player POST /api/matches/:id/orders { orders, tick, clientPacketId }

2. Async route handler → return await matchManager.submitOrders(...)

3. First critical section — await match.withLock(async () => { ... }):
   │  (Any read/write of match.submittedOrders for this tick happens here.)
   │
   a. Validate JWT → extract (matchId, tribe)
   b. Verify match exists and is "running"
   c. Verify tick number matches current state.tick
      (stale tick → reject 409, tells client to refetch view)
   d. Idempotency check on match.submittedOrders[tribe]:
      - If entry exists with SAME clientPacketId + SAME tick:
          respond with cached response, status "duplicate". STOP.
      - If entry exists with DIFFERENT clientPacketId + SAME tick:
          reject HTTP 409 Conflict ("already submitted"). STOP.
      - Otherwise: continue.
   e. Run sanitizePlayerOrders() server-side (await if the implementation is async)
   f. Store SubmittedOrderEntry in match.submittedOrders
      (clientPacketId + orders + tick + acceptedResponse placeholder)
   │
   g. Check: have all alive tribes submitted?
   │
   ├─ No
   │  ├─ Cache acceptedResponse = { status: "accepted", pendingTribes }
   │  ├─ Respond { status: "accepted", pendingTribes: [...] }
   │  └─ Broadcast WS { type: "waiting_for", tribes: [...] }
   │     (then exit this withLock; do not start step 4)
   │
   └─ Yes
         (exit first withLock; then enter second withLock — §4.4a)

4. Second critical section — only when step 3g is "Yes":
   await match.withLock(async () => {
     await resolveTick(match);   // resolveTick is async — LLM fetch, etc.
   });

   Inside resolveTick(match) — still holding the second critical section until done:
   a. For any LLM/pass slots that haven't submitted:
      - LLM: await generateLlmOrders(state, tribe, slot.llmConfig)
      - Pass: use empty orders
      (these get synthetic clientPacketIds: `server:{tick}:{tribe}`)
   b. Assemble OrderPackets from all submissions
   c. Call engine.tick(state, packets)
   d. Compute SpectatorView via projectForSpectator(result.state) (§3.3)
   e. Compute ProjectedView for each alive tribe via projectForPlayer(result.state, tribe)
   f. Create TickBufferEntry, append to match.tickBuffer
   g. appendPacketTick(matchId, { tick, packetsByTribe, stateHash, events })
      (packet log is the durable source of truth — see §4.9)
   h. Clear match.submittedOrders
   i. Broadcast to player sockets: { type: "view", projectedView, tick }
   j. Broadcast to spectator sockets: { type: "spectator_tick", view, tickNumber }
   k. If winner:
      - set status "finished"
      - appendMatchEnd(matchId, { winner, finishedAt })
      - broadcast match_end
   l. For the human submitter whose POST triggered this resolution:
      HTTP body { status: "resolved", view }
      (other players who already got "accepted" receive the new view via WS only — step i)
```

### 4.4a Concurrency model — per-match async lock

**Pair with §4.4.** The human `POST /orders` path acquires `withLock` twice: first for submission + the “all tribes submitted?” decision (§4.4 step 3), then—only when resolving—for `await resolveTick(match)` (§4.4 step 4). Autoplay wraps gather + resolve in a single `withLock` per iteration (§4.5). The “step 2 / step 3 / step 4” bullets below are the same logical phases as in §4.4.

Node.js is single-threaded for JS execution, but `submitOrders` and
`resolveTick` both `await` inside their body (sanitize, LLM fetch,
JSONL write, WS broadcasts). Any `await` yields the event loop, and
a different route handler for the same match can run before the first
one finishes. Without explicit serialization, the following races
are realistic:

- **Double-resolve.** Two players submit the last-two orders within
  a few ms. Both handlers observe "all tribes submitted" (step 3),
  both call `resolveTick()`, the engine advances two ticks instead
  of one, `state.tick` drifts, hashes diverge from the packet log.
- **Read-then-write on `submittedOrders`.** Player A's handler reads
  `submittedOrders.get(tribe) === undefined` (no prior submission)
  → `await sanitizePlayerOrders(...)` → sets entry. Player A's retry
  races during that `await` and both handlers set different entries
  for the same tribe/tick.
- **Autoplay ↔ human overlap.** Not possible given the derivation
  rule (autoPlay implies zero humans), but autoplay still needs
  serialization against itself: its `await Promise.all(llmCalls)`
  → `resolveTick()` must not interleave with a second tick triggered
  by some future host-pause toggle.
- **Resolve ↔ late submission.** Player's submit POST arrives mid-
  resolution (between step 4.c `engine.tick()` and step 4.h "Clear
  match.submittedOrders"). The late handler sees `state.tick` ==
  old tick (hasn't advanced yet in the mid-resolution window) and
  queues orders that will be dropped on clear.

Rule: every mutation of `ActiveMatch.state`, `ActiveMatch.submittedOrders`,
or `ActiveMatch.tickBuffer` happens inside a per-match critical section.

```typescript
// packages/server/src/match/activeMatch.ts

class ActiveMatch {
  // ... (fields from §4.2)

  // Per-match mutex. Resolves once the current critical section
  // completes. All writers chain off this promise.
  private _lock: Promise<void> = Promise.resolve();

  /**
   * Serialize an async operation against this match. All submit and
   * resolve paths go through here; reads that tolerate stale state
   * (e.g. GET view, spectator broadcasts of already-buffered frames)
   * do not need the lock.
   */
  async withLock<T>(op: () => Promise<T>): Promise<T> {
    const prev = this._lock;
    let release!: () => void;
    this._lock = new Promise((r) => { release = r; });
    try {
      await prev;
      return await op();
    } finally {
      release();
    }
  }
}
```

Route-side rule (applied to §4.4 flow):

- Step 2 (validate / idempotency check / store orders) runs inside
  `match.withLock(async () => { ... })`.
- Step 3 (all-submitted check) runs in the same critical section as
  step 2 — the decision to trigger resolution is made atomically
  with the last submission.
- Step 4 (`resolveTick`, including LLM fetches, `engine.tick()`,
  projection, JSONL append, socket broadcasts, state mutation) runs
  in its **own** critical section, acquired before the first `await`
  and held until all mutation is complete and sockets have been
  notified.
- Step 4.a LLM fetches are launched in parallel via `Promise.all`
  **inside** the lock — still serialized against other resolutions
  of the same match. Parallelism is between tribes within one tick,
  not between ticks.

Autoplay loop (§4.5) uses the same lock: each iteration wraps its
"gather LLM orders → resolve" pair in one `withLock` call so autoplay
cannot begin a new tick until the previous one's broadcasts have flushed.

JSONL append (§4.9) happens inside the lock so the packet-log order
always reflects the engine's resolution order. `fs.appendFileSync`
is already synchronous; the lock guarantees record ordering across
concurrent requests even if we later swap to async writes.

**What is not locked:**

- `GET /api/matches/:id` → returns the current projection. Reads
  `match.state` without the lock; a racing resolve may cause a
  reader to see either tick N or tick N+1, never a partial state
  (engine.tick returns a new immutable-by-convention object).
- Spectator socket broadcasts of **already-buffered** frames (§4.7
  initial `spectator_history`) — the tick buffer is append-only;
  reading a slice is safe.
- WS registration/unregistration — uses its own separate data
  structure (`spectatorSockets`, `playerSockets`), touched only
  from connection handlers.

**Unit-test target:** a Phase 3 integration test fires 6 parallel
`submitOrders` calls (one per tribe) for the same tick and asserts
(a) exactly one resolution occurs, (b) final `stateHash` matches
a reference run with sequential submission, (c) JSONL file contains
exactly one `tick` record for that tick number.

### 4.4b Human tick timeout (`tickTimeoutSeconds`)

`CreateMatchRequest.tickTimeoutSeconds` (§3.1) is **implemented**, not decorative:

- **`0`** (default for autoPlay / LLM-only): no wall-clock timeout. The tick waits until every alive tribe has a submission (humans via POST; LLM/pass filled inside `resolveTick` per §4.4 step 4.a).
- **`> 0`** (typical default **300** when the match has ≥1 human slot): when a tick **starts** (match transitions to `"running"` for the first tick, or immediately after a resolution advances `state.tick`), schedule **one** `setTimeout` on that `ActiveMatch` for `tickTimeoutSeconds`, stored in `tickTimeoutTimer` (§4.2). **Clear** that timer when the tick **fully** resolves (end of §4.4 step 4, when `submittedOrders` is cleared and broadcasts are done). When the timer fires, run `await match.withLock(async () => { ... })` and:
  - If `state.tick` has **already** advanced since this timer was scheduled, **no-op** (stale fire).
  - Else, for each **human** slot whose tribe is alive and has **no** `SubmittedOrderEntry` for the current `state.tick`, insert synthetic `orders: []` with `clientPacketId: \`server:${state.tick}:${tribe}:timeout\`` (same id namespace as other server-generated packet ids).
  - Then run the same **“all tribes submitted?” → second `withLock` → `await resolveTick`** path as in §4.4 (timeout injections count as submissions for humans who missed the deadline).

**Races:** Human `POST /orders` and the timeout callback both serialize through `withLock`. If the human submits in time, the callback may inject nothing. If the callback runs first, a **late** POST for that tribe/tick sees an existing entry → **duplicate** or **409** per §4.4 step 3.d.

**Scheduling the next tick’s timer:** After step 4 completes successfully and the match is still `"running"`, if `tickTimeoutSeconds > 0`, schedule the timer again for the **new** `state.tick`.

### 4.5 Auto-play loop (LLM-only matches)

When `createMatch` is called with all slots being `llm` or `pass` (which derives `autoPlay: true` per §3.1):

```typescript
async function runAutoPlayLoop(match: ActiveMatch): Promise<void> {
  match.status = "running";

  while (match.state.winner === null) {
    // Each iteration acquires the per-match lock (§4.4a) so that one
    // tick completes — resolution, JSONL append, socket broadcasts —
    // before the next iteration starts. LLM calls fan out inside the
    // lock; parallelism is across tribes within a tick, not across ticks.
    await match.withLock(async () => {
      const tickAtStart = match.state.tick;

      // 1. Generate orders for all tribes in parallel.
      const orderEntries = await Promise.all(
        match.state.tribesAlive.map(async (tribe) => {
          const slot = match.slots.get(tribe)!;
          if (slot.type === "pass") return [tribe, []] as const;
          const orders = await generateLlmOrders(
            match.state,
            tribe,
            slot.llmConfig!,
          );
          return [tribe, orders] as const;
        }),
      );

      // 2. Store all orders (synthetic clientPacketId for server-generated
      //    submissions — never collides with client UUIDs).
      for (const [tribe, orders] of orderEntries) {
        match.submittedOrders.set(tribe, {
          clientPacketId: `server:${tickAtStart}:${tribe}`,
          tick: tickAtStart,
          orders,
          acceptedResponse: { status: "accepted", pendingTribes: [] },
        });
      }

      // 3. Resolve (inside the same critical section).
      await resolveTick(match);
    });

    // No delay between iterations — runs as fast as LLMs respond.
  }
}
```

The loop runs server-side. Spectators connect via WebSocket and receive ticks as they resolve. No human input needed.

### 4.6 LLM opponent (server-side)

Moved from `packages/web/src/v2/llm/` to `packages/server/src/autoplay/llmOpponent.ts`.

`sanitizePlayerOrders` is imported from `@rr/shared/orderPreview.ts` —
the same module the web client uses for budget/clip previews (§3.5).
Identical implementation on both sides guarantees what the player
sees queued is what the server will accept.

```typescript
async function generateLlmOrders(
  state: GameState,
  tribe: Tribe,
  config: LlmConfig,
): Promise<Order[]> {
  // 1. Project view for this tribe (fog of war applies even to LLMs)
  const view = projectForPlayer(state, tribe);

  // 2. POST to LLM proxy (same protocol as current fetchLlmSlot.ts)
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.token
        ? { Authorization: `Bearer ${config.token}` }
        : {}),
    },
    body: JSON.stringify({
      tribe,
      tick: state.tick,
      projectedView: view,
      persona: config.persona,
      systemPrompt: config.systemPrompt,
    }),
  });

  const json = await response.json();

  // 3. Parse response into orders (same logic as chooseToOrders.ts)
  const fromChoose = ordersFromChooseIds(view, json.choose ?? []);
  const fromMessages = ordersFromLlmMessageList(
    view,
    json.messages ?? [],
  );
  const merged = [...fromChoose, ...fromMessages];

  // 4. Sanitize
  return sanitizePlayerOrders(
    view.myPlayerState.influence,
    merged,
  );
}
```

### 4.7 Spectator WebSocket hub

```typescript
// src/ws/spectatorHub.ts

function handleSpectatorConnection(
  ws: WebSocket,
  matchId: string,
): void {
  const match = matchManager.getMatch(matchId);
  if (!match) {
    ws.close(404, "Match not found");
    return;
  }
  if (!match.autoPlay) {
    ws.close(403, "Not a spectator match");
    return;
  }

  // 1. Send full buffered history
  const history = match.tickBuffer.map(
    (entry) => entry.spectatorView,
  );
  ws.send(
    JSON.stringify({
      type: "spectator_history",
      ticks: history,
      matchStatus: match.status,
    }),
  );

  // 2. Register for live updates
  matchManager.registerSpectatorSocket(matchId, ws);

  // 3. If match is already finished, send match_end
  if (match.status === "finished") {
    ws.send(
      JSON.stringify({
        type: "spectator_match_end",
        winner: match.state.winner,
      }),
    );
  }

  // 4. Cleanup on disconnect
  ws.on("close", () => {
    matchManager.unregisterSpectatorSocket(matchId, ws);
  });
}
```

### 4.8 Player WebSocket hub

```typescript
// src/ws/playerHub.ts — JWT only in first message (§3.2), never in query string

function handlePlayerConnection(ws: WebSocket, matchId: string): void {
  const match = matchManager.getMatch(matchId);
  if (!match) {
    ws.close(4004, "Match not found");
    return;
  }

  let authedTribe: Tribe | null = null;
  const authDeadline = setTimeout(() => {
    if (authedTribe === null) ws.close(4401, "auth timeout");
  }, 5000);

  ws.once("message", (raw) => {
    clearTimeout(authDeadline);

    let msg: WsPlayerIn;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.close(1008, "invalid json");
      return;
    }

    if (msg.type !== "auth") {
      ws.close(4401, "auth required first");
      return;
    }

    const claims = verifyJwt(msg.token);
    if (!claims || claims.matchId !== matchId) {
      ws.close(4401, "Invalid token");
      return;
    }

    authedTribe = claims.tribe;
    const tribe = claims.tribe;

    const view = projectForPlayer(match.state, tribe);
    ws.send(
      JSON.stringify({
        type: "view",
        projectedView: view,
        tick: match.state.tick,
      }),
    );

    matchManager.registerPlayerSocket(matchId, tribe, ws);

    ws.on("message", (nextRaw) => {
      const next = JSON.parse(nextRaw.toString()) as WsPlayerIn;
      if (next.type === "heartbeat") {
        /* optional: noop or last-seen */
      }
    });

    ws.on("close", () => {
      matchManager.unregisterPlayerSocket(matchId, tribe);
    });
  });
}
```

### 4.9 JSONL persistence — packet log is source of truth

The engine is deterministic (see `RULES.md` §1): given the seed, map
preset, and the ordered list of `OrderPacket`s, state is fully
reproducible. We exploit that to persist **only** the inputs, not
snapshots of the output state. This gives one source of truth and
eliminates the risk that a snapshot schema drift silently desyncs
from the engine.

**File format** — `data/matches/{matchId}.jsonl`, one JSON line per
record, tagged by `kind`:

```typescript
type MatchLogRecord =
  | {
      kind: "match_init";
      matchId: string;
      seed: number;
      mapPreset: MapPreset;
      slotConfig: CreateMatchRequest;  // tribes, slot types, LLM configs
      createdAt: string;               // ISO timestamp
    }
  | {
      kind: "tick";
      tick: number;                    // tick number after resolution
      packetsByTribe: Record<Tribe, OrderPacket>;
      stateHash: string;               // from engine.tick() result
      events: ResolutionEvent[];
    }
  | {
      kind: "match_end";
      winner: Tribe | Tribe[] | null;
      finishedAt: string;              // ISO timestamp
    };
```

`match_init` is written once on match creation. One `tick` record is
appended per resolution. `match_end` is written when a winner is
declared (or the tick limit is reached).

```typescript
// src/persistence/matchLog.ts

const DATA_DIR = path.resolve(
  process.env.DATA_DIR ?? "./data/matches",
);

function appendMatchInit(matchId: string, init: MatchInitRecord): void {
  const filePath = path.join(DATA_DIR, `${matchId}.jsonl`);
  fs.appendFileSync(filePath, JSON.stringify(init) + "\n");
}

function appendPacketTick(matchId: string, entry: TickRecord): void {
  const filePath = path.join(DATA_DIR, `${matchId}.jsonl`);
  fs.appendFileSync(filePath, JSON.stringify(entry) + "\n");
}

function appendMatchEnd(matchId: string, end: MatchEndRecord): void {
  const filePath = path.join(DATA_DIR, `${matchId}.jsonl`);
  fs.appendFileSync(filePath, JSON.stringify(end) + "\n");
}

function restoreMatches(): Map<string, ActiveMatch> {
  // On server startup, for each .jsonl file in DATA_DIR:
  //
  // 1. Read line 1 — must be kind: "match_init".
  //    Call initMatch({ seed, mapPreset, slotConfig }) → GameState.
  //
  // 2. Replay each kind: "tick" record in order:
  //      const result = engine.tick(state, record.packetsByTribe);
  //      assert(result.stateHash === record.stateHash,
  //             "engine drift — stored hash != recomputed hash");
  //      state = result.state;
  //      // rebuild TickBufferEntry for spectator history
  //
  //    Hash mismatch is a loud error, not silent: it means the engine
  //    has been changed in a rule-breaking way since this match ran.
  //
  // 3. If file ends without "match_end":
  //    - Reconstruct ActiveMatch with current state + full tickBuffer.
  //    - If all slots are LLM/pass: restart the auto-play loop from
  //      state.tick. If any slot is human: leave in "running" status,
  //      awaiting reconnection.
  //
  // 4. If file ends with "match_end": hydrate as a finished match so
  //    spectator history endpoints continue to serve it.
}
```

**Complexity note.** Replay-on-boot cost is O(ticks). For MVP this is
fine — default `tickLimit` is 60 and the engine resolves a tick in
milliseconds. If restore time becomes a problem for long-running or
archival matches, add a `{ kind: "checkpoint", tick, state }` record
written every N ticks and start replay from the latest checkpoint.
This is a performance optimization, **not** a correctness mechanism —
the packet log remains the source of truth.

**Hot-path note.** `fs.appendFileSync` blocks the event loop. Fine for
MVP scale; flagged for follow-up (async write queue or `fdatasync`
batching) once match concurrency grows.

**In-memory bounds and eviction.** Each resolution appends at most one
`TickBufferEntry`, so for a numeric `tickLimit` (default 60) the live
buffer is **O(tickLimit)** per match — not unbounded. When
`status === "finished"`, `MatchManager` **may evict** the match from RAM
after a policy (e.g. **15 minutes** idle, or **immediately** when the
last spectator socket disconnects). Evicted matches are still
addressable: `GET .../spectator`, `GET .../spectator/history`, and new
spectator WS connections **replay** `data/matches/{matchId}.jsonl` to
rebuild `SpectatorView[]` (same replay path as `restoreMatches()`).
Hot, non-evicted matches use `tickBuffer` for low-latency pushes (§4.7).

### 4.10 Server startup

```typescript
// src/index.ts

const server = Fastify({ logger: true });

// Plugins
server.register(cors, { origin: true });
server.register(jwt, {
  secret: process.env.JWT_SECRET ?? "dev-secret",
});
server.register(websocket);

// Routes
server.register(createMatchRoute, { prefix: "/api" });
server.register(joinMatchRoute, { prefix: "/api" });
server.register(getMatchRoute, { prefix: "/api" });
server.register(submitOrdersRoute, { prefix: "/api" });
server.register(spectatorRoute, { prefix: "/api" });
server.register(spectatorHistoryRoute, { prefix: "/api" });

// WebSocket
server.get(
  "/ws/spectator",
  { websocket: true },
  (ws, req) => {
    const matchId = (req.query as any).matchId;
    handleSpectatorConnection(ws, matchId);
  },
);
server.get(
  "/ws/play",
  { websocket: true },
  (ws, req) => {
    const matchId = (req.query as any).matchId;
    handlePlayerConnection(ws, matchId);
  },
);

// Restore persisted matches
const matchManager = new MatchManager();
matchManager.restoreMatches();

server.listen({
  port: Number(process.env.PORT ?? 3001),
  host: "0.0.0.0",
});

// Graceful shutdown — see §4.11
```

### 4.11 Graceful shutdown

On **SIGINT** / **SIGTERM**:

1. Call **`server.close()`** — stop accepting new HTTP and WebSocket connections; the TCP stack completes handshakes in flight per Fastify/Node semantics.
2. **`MatchManager`:** set a flag (e.g. `acceptingWork = false`) so autoplay loops exit after their current `withLock` iteration; do not start new ticks on matches that were only driven by autoplay.
3. **Drain:** await in-flight `submitOrders` / `resolveTick` / `withLock` chains — e.g. `await matchManager.drain({ timeoutMs: 30_000 })` that resolves when the work queue is empty or the timeout elapses (log if hard-stopped).
4. **WebSocket:** close open player and spectator sockets with code **1001** (`going_away`) and a short reason (e.g. `server_shutdown`) so clients can distinguish clean restarts from errors.
5. **Durability:** JSONL writes are synchronous today; after drain, no extra flush is required for MVP. **`SIGKILL`** or power loss mid-append may leave a **partial final line** in the log — recovery is best-effort (truncate malformed tail on next boot, or treat as replay error); not a blocker for MVP.

Register signal handlers in `index.ts` after `listen` resolves (or use Fastify hooks if preferred).

---

## 5. `packages/web` — Thin client refactor

### 5.1 What gets removed


| File/directory                                                               | Reason                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@rr/engine2` in `package.json`                                              | Removed as **both** a runtime and a type-only dependency. Web imports all engine-adjacent types via `@rr/shared` (see §3 type-boundary rule). This is enforced structurally: if `@rr/engine2` is not in `packages/web`'s dependency closure, no engine runtime can be bundled by accident. |
| `src/v2/V2Shell.tsx`                                                         | Replaced by routed pages                                                                                                                                                                                                                                                                   |
| `src/v2/llm/assembleTickPackets.ts`                                          | Moved to server                                                                                                                                                                                                                                                                            |
| `src/v2/llm/fetchLlmSlot.ts`                                                 | Moved to server                                                                                                                                                                                                                                                                            |
| `src/v2/llm/chooseToOrders.ts`                                               | Moved to server                                                                                                                                                                                                                                                                            |
| `src/v2/ordersFromLegal.ts`                                                  | Server provides `legalOrderOptions` in `ProjectedView` (discovery needs full state — stays authoritative)                                                                                                                                                                                  |
| `src/App.tsx` (current)                                                      | Replaced with router setup                                                                                                                                                                                                                                                                 |
| Direct engine imports (`initMatch`, `tick`, `projectForPlayer`, `hashState`) | Server-side only                                                                                                                                                                                                                                                                           |


Note: `sanitizePlayerOrders`, `wouldClipOrders`, `filterOrdersByInfluenceBudget`, `ordersExceedInfluenceBudget`, `dedupeMovesOnePerForce` are NOT removed — they move from `@rr/engine2` to `@rr/shared/orderPreview.ts` (§3.5). The web bundle continues to use them for order-queue UX, but imports them from `@rr/shared`, so `@rr/engine2` stays out of web's dependency closure.

### 5.2 What gets added


| File                                     | Purpose                            |
| ---------------------------------------- | ---------------------------------- |
| `src/App.tsx`                            | React Router setup                 |
| `src/routes/Landing.tsx`                 | `/` — landing, redirect to /create |
| `src/routes/CreateMatch.tsx`             | `/create` — match wizard           |
| `src/routes/WatchMatch.tsx`              | `/watch/:matchId` — spectator view |
| `src/routes/PlayMatch.tsx`               | `/play/:matchId` — player view     |
| `src/state/spectatorStore.ts`            | Zustand store for spectator state  |
| `src/state/playerStore.ts`               | Zustand store for player state     |
| `src/components/SpectatorMap.tsx`        | V2Map adapted for god-mode view    |
| `src/components/SpectatorTimeline.tsx`   | Playback controls + event log      |
| `src/components/SpectatorScoreboard.tsx` | Full tribe scoreboard              |
| `src/components/PlayerOrderQueue.tsx`    | Adapted order queue                |
| `src/components/MatchWizard.tsx`         | Match creation form                |


### 5.3 What stays (adapted)


| File                        | Changes                                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/v2/V2Map.tsx`          | Adapted to accept either `ProjectedView` or `SpectatorView`                                                                        |
| `src/v2/DiplomacyPanel.tsx` | Minor: reads from playerStore instead of props                                                                                     |
| `src/v2/OrderQueue.tsx`     | Refactored into `PlayerOrderQueue.tsx`; budget/clip previews now import from `@rr/shared/orderPreview.ts` instead of `@rr/engine2` |
| `src/v2/formatV2.ts`        | Kept as-is (pure formatting utilities)                                                                                             |
| `src/v2/mapData.ts`         | Kept as-is (static map layout data)                                                                                                |
| `src/replay/`*              | Kept as-is, adapted to consume server-provided replay data                                                                         |


### 5.4 `spectatorStore.ts` — Zustand

```typescript
interface SpectatorStore {
  matchId: string | null;
  ticks: SpectatorView[];
  currentTickIndex: number;
  isLive: boolean;
  isPaused: boolean;
  connection: "disconnected" | "connecting" | "connected";

  connect(matchId: string): void;
  disconnect(): void;
  pause(): void;
  play(): void;
  goToTick(index: number): void;
  stepForward(): void;
  stepBack(): void;
  currentView(): SpectatorView | null;
}
```

On `connect(matchId)`:

1. Open `WS /ws/spectator?matchId=X`. The WS is the **sole** source of
   initial history — the server pushes a `spectator_history` message
   immediately on connect (§3.2) so there is no race between a REST
   fetch and the first live tick.
2. On `spectator_history` message → set `ticks[]`, jump to latest,
   set `isLive = true`.
3. On `spectator_tick` message → append to `ticks[]`; if
   `isLive && !isPaused` advance `currentTickIndex`.
4. On `spectator_match_end` → set `isLive = false`.

The REST endpoint `GET /api/matches/:id/spectator/history` (§3.1) is
kept for non-streaming consumers (scripts, post-match analysis tools,
share-links that render a static snapshot). The web spectator store
does NOT call it — opening the WS is always sufficient.

### 5.5 `playerStore.ts` — Zustand

```typescript
interface PlayerStore {
  matchId: string | null;
  tribe: Tribe | null;
  token: string | null;
  view: ProjectedView | null;
  chosenIds: string[];
  messageTo: Tribe;
  messageText: string;
  submittedThisTick: boolean;
  waitingFor: Tribe[];
  connection: "disconnected" | "connecting" | "connected";
  busy: boolean;
  error: string | null;

  // Pending submit — used to make retries idempotent across
  // reconnects and transient network failures.
  pendingPacketId: string | null;   // UUID for the current in-flight submit
  pendingForTick: number | null;    // tick the pendingPacketId was issued for

  joinMatch(
    matchId: string,
    tribe: Tribe,
    displayName: string,
  ): Promise<void>;
  restoreFromUrl(matchId: string, token: string): void;
  connect(): void;
  submitOrders(): Promise<void>;
  toggleOrder(id: string): void;
  clearOrders(): void;
  setMessageTo(tribe: Tribe): void;
  setMessageText(text: string): void;
}
```

On `connect()`:

1. Open `WS /ws/play?matchId=X` (no token in URL — §3.2). Immediately send `{ type: "auth", token }` using the JWT from `join` / URL (store holds `token`).
2. Receive initial `view` → set `view` in store
3. On subsequent `view` messages → update `view`, clear `chosenIds`, clear
   `pendingPacketId` and `pendingForTick`, set `submittedThisTick = false`
4. On `waiting_for` message → update `waitingFor`
5. On `match_end` → show winner overlay

On `submitOrders()`:

1. Build `Order[]` from `chosenIds` + message.
2. If `pendingPacketId` is set AND `pendingForTick === view.tick`:
   reuse it (this is a retry after a network error on the same tick).
   Otherwise generate a fresh UUID v4 and store it as
   `pendingPacketId` with `pendingForTick = view.tick`.
3. `POST /api/matches/:id/orders` with
   `{ orders, tick: view.tick, clientPacketId: pendingPacketId }`.
4. If response is `accepted` → set `submittedThisTick = true`, show waiting state.
5. If response is `resolved` → view will arrive via WS shortly.
6. If response is `duplicate` → treat as success (the server has already
   accepted this packet on an earlier attempt); mirror the cached
   `status` in UI state.
7. On network error: keep `pendingPacketId` set so the next retry
   reuses it. On next successful `view` push (for `view.tick + 1`):
   clear `pendingPacketId` and `pendingForTick`.

### 5.6 Pages

#### `/create` — Match wizard

```
┌──────────────────────────────────────────────────┐
│  Rogue Rivals — Create Match                     │
│                                                  │
│  Map:       [Continent 6P ▼]                     │
│  Seed:      [random]  or [________]              │
│  Tick limit:[60]                                 │
│                                                  │
│  Tribes:                                         │
│  ┌──────────────────────────────────────────┐    │
│  │ ☑ orange   Type: [LLM ▼]  Persona: [warlord ▼]  │
│  │ ☑ grey     Type: [LLM ▼]  Persona: [merchant ▼] │
│  │ ☑ brown    Type: [LLM ▼]  Persona: [paranoid ▼] │
│  │ ☑ red      Type: [LLM ▼]  Persona: [random ▼]   │
│  │ ☐ arctic   Type: [pass ▼]                        │
│  │ ☐ tricol.  Type: [pass ▼]                        │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  LLM Proxy: [http://127.0.0.1:8787/v2/llm     ] │
│  Token:      [optional                         ] │
│                                                  │
│  [Create & Watch]                                │
└──────────────────────────────────────────────────┘
```

On submit:

1. `POST /api/matches` with config
2. Receive `matchId` + `spectatorUrl`
3. Navigate to `/watch/:matchId`

#### `/watch/:matchId` — Spectator view

```
┌────────────────────────────────────────────────────────┐
│ Rogue Rivals — Spectating        Tick 34 / 60          │
│ [⏮] [⏪] [⏸ Pause] [⏩] [⏭]     Status: Live ●       │
├────────────────────────────────────────────────────────┤
│                                                        │
│  Full map (SpectatorMap)                               │
│  - ALL regions visible, colored by owner               │
│  - ALL forces with exact tier labels (T1, T2, T3, T4)  │
│  - ALL transits shown as pills on trails with ETA       │
│  - ALL scouts and caravans visible                     │
│  - Combat flash animation on resolution events          │
│                                                        │
├────────────────────────────────────────────────────────┤
│ Events                             │ Scoreboard        │
│ ▸ Tick 34: Combat at R12           │ orange: 8 inf     │
│   Orange T3 vs Grey T2+fort(+1)   │ grey:   5 inf     │
│   Effective: 3 vs 3, tie          │ brown:  6 inf     │
│   Both drop to T2, Grey retreats  │ red:    4 inf     │
│ ▸ Tick 34: pact_broken by orange  │ arctic: 3 inf     │
│ ▸ Tick 33: Grey-Brown NAP formed  │                   │
│ ▸ Tick 33: Caravan delivered       │ Pacts:            │
│   brown→grey (5 influence)        │ Grey↔Brown NAP(4) │
│                                    │ Red↔Orange war    │
└────────────────────────────────────────────────────────┘
```

Behaviors:

- On load: open WebSocket (sole source of history per §5.4); server pushes `spectator_history` immediately on connect, then `spectator_tick` for each new resolution. Page renders as soon as the first `spectator_history` arrives and jumps to the latest tick
- Auto-play: new ticks from WS auto-advance the view
- Pause: stops auto-advance, new ticks buffer
- Play: resumes from current position or jumps to live
- Step back/forward: navigate buffered history
- Scrubber: click on event log entry to jump to that tick
- For completed matches: same UI, no live ticks, pure scrub through history

`SpectatorMap` reuses `V2Map` internals but:

- Renders ALL regions (no fog filtering)
- Shows exact force tiers (not fuzzy)
- Shows transit ticks remaining
- Shows all pacts and diplomacy

#### `/play/:matchId` — Player view

Replaces current `V2Shell.tsx`. Similar layout but reads from `playerStore`:

```
┌────────────────────────────────────────────────┐
│ Rogue Rivals v2 · tick 12 / 60 ·               │
│ Playing as Orange · Influence: 8               │
│ Waiting for: grey, red                          │
├────────────────────────────────────────────────┤
│                                                │
│ Map (V2Map with ProjectedView — fog of war)    │
│                                                │
├────────────────────────────────────────────────┤
│ Order Queue                                    │
│ ☑ Move f_orange_001 from R3 to R5             │
│ ☐ Recruit T2 at R3 (cost 5)                   │
│ ☐ Scout from R3 to R7 (cost 3)                │
│ [Clear]                          [Submit]      │
├────────────────────────────────────────────────┤
│ Diplomacy                                      │
│ [To: grey ▼] [Type message...]                 │
│ ☐ Propose NAP to grey                          │
│ ☐ Propose trade to brown (5 inf)               │
├────────────────────────────────────────────────┤
│ Forces & sightings                             │
│ f_orange_001: Tier 2 · garrison R3            │
│ f_orange_002: Tier 1 · in transit (2 ticks)   │
│ Visible: grey "warband" at R7                  │
└────────────────────────────────────────────────┘
```

Key difference from current `V2Shell`: the "Submit" button sends orders to the server and shows a "Waiting for other players" state. The view only updates when the server broadcasts the new `ProjectedView` after tick resolution.

---

## 6. Anti-cheat guarantees


| Attack vector                     | Mitigation                                                                                                                                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read full `GameState`             | Client never has engine code or full state — only receives `ProjectedView`                                                                                                                                |
| See through fog of war            | `projectForPlayer()` runs server-side only                                                                                                                                                                |
| See other players' views          | Server sends one tribe's projection per JWT                                                                                                                                                               |
| Submit illegal orders             | Server runs `sanitizePlayerOrders()` + engine validation; drops invalid                                                                                                                                   |
| Submit orders for another tribe   | JWT scoped to `(matchId, tribe)`, verified on every request                                                                                                                                               |
| Modify game state                 | No engine code in client bundle; `@rr/engine2` is not in `packages/web`'s dependency closure (enforced by absence from `package.json` and by `@rr/shared` being the sole type bridge — see §3)            |
| Replay-attack an old order packet | `(tick, clientPacketId)` dedupe on `submittedOrders`; stale tick numbers rejected by §4.4 step 2.c; duplicate `clientPacketId` returns cached accept; different `clientPacketId` on same tick returns 409 |
| Inject orders mid-resolution      | Orders are accepted pre-resolution; tick number must match current                                                                                                                                        |
| Spectator interferes with match   | Spectator WS is read-only; order endpoint requires player JWT                                                                                                                                             |
| Spectator views human matches     | Spectator endpoint only enabled for `autoPlay` matches                                                                                                                                                    |
| Replay manipulation               | Server is authoritative; replay data comes from server JSONL, not client                                                                                                                                  |
| Guess spectator URLs              | Match IDs are UUIDs (128-bit entropy)                                                                                                                                                                     |


---

## 7. Implementation phases

### Phase 1: Shared types, costs, and preview helpers (1–1.5 sessions)

- Create `packages/shared/` with `package.json`, `tsconfig.json`
- `packages/shared/package.json` has NO workspace deps
- **Move wire-facing types** from `packages/engine2/src/types.ts` into
`packages/shared/src/engineTypes.ts`:
`Tribe`, `RegionId`, `ForceId`, `ScoutId`, `CaravanId`, `ForceTier`,
`StructureKind`, `Order` (and variants), `OrderPacket`,
`ProjectedView`, `Region`, `Pact`, `Proposal`, `ResolutionEvent`,
`Announcement`, `MapPreset`. Engine-internal types (`GameState`,
etc.) stay in engine2.
- **Move cost constants** from `packages/engine2/src/constants.ts`
into `packages/shared/src/costs.ts`:
`FORCE_RECRUIT_COST`, `SCOUT_COST`, `STRUCTURE_COST`. Other
engine constants (combat tables, victory thresholds) stay in
engine2.
- **Move preview helpers** from
`packages/engine2/src/orderPacketFilters.ts` and
`packages/engine2/src/influenceBudget.ts` into
`packages/shared/src/orderPreview.ts`:
`filterOrdersByInfluenceBudget`, `ordersExceedInfluenceBudget`,
`dedupeMovesOnePerForce`, `sanitizePlayerOrders`, `wouldClipOrders`
- Update `@rr/engine2` to `import type` from `@rr/shared` and
runtime-import costs/helpers from `@rr/shared`; add `@rr/shared`
as an engine2 dependency
- Verify engine2 conformance tests still pass (state hashes
unchanged — proof the refactor is behavior-preserving)
- Define `api.ts` — all REST request/response types (including
`clientPacketId` on `SubmitOrdersRequest` and `"duplicate"` on
`SubmitOrdersResponse.status`)
- Define `spectator.ts` — `SpectatorView` and sub-types
- Define `wsMessages.ts` — `WsPlayerIn` (includes `auth` + `heartbeat`), `WsPlayerOut`, `WsSpectatorOut`
- Define `auth.ts` — JWT claims
- Export all from `index.ts`
- Add to `pnpm-workspace.yaml`
- `@rr/shared` builds and types check
- **Type-boundary verification**: `packages/web` typechecks against
`@rr/shared` alone; `@rr/engine2` does not appear in
`packages/web/package.json` or in its resolved dependency closure
(`pnpm why @rr/engine2 --filter @rr/web` returns empty)

### Phase 2: Server scaffold (1 session)

- Create `packages/server/` with `package.json`, `tsconfig.json`
- Install dependencies: fastify, @fastify/websocket, @fastify/jwt, @fastify/cors, uuid
- `src/index.ts` — Fastify bootstrap with plugins and route registration
- `src/auth/jwt.ts` — `issueToken()`, `verifyToken()`
- All REST route stubs (return 501)
- Server starts and listens on PORT
- Health check endpoint
- Register **SIGINT/SIGTERM** → `server.close()` + `matchManager.drain()` skeleton (full behavior in §4.11 once MatchManager exists)

### Phase 3: Match manager + resolution (2 sessions)

- **Engine prerequisite**: add `projectForSpectator(state: GameState): SpectatorView`
  to `packages/engine2/src/projectForSpectator.ts`; export it from
  `packages/engine2/src/index.ts`. Unit tests: god-mode shape (no fog,
  exact tiers, exact transit ticks, all pacts visible) against a
  known seeded state.
- `src/match/activeMatch.ts` — `ActiveMatch` class with state, slots, sockets
- `src/match/matchManager.ts` — create, join, submit, get view, socket management
- `src/match/resolution.ts` — `async resolveTick()`:
  - Generate missing LLM/pass orders
  - Assemble OrderPackets
  - Call engine `tick()`
  - Compute SpectatorView via `projectForSpectator(result.state)`
  - Compute ProjectedView per tribe via `projectForPlayer(result.state, tribe)`
  - Buffer result, broadcast to sockets
  - Persist to JSONL packet log (§4.9)
- **Implement the concurrency model in §4.4a** (per-match async lock
  around submitOrders + resolveTick) before wiring any routes.
- **§4.4b** — `tickTimeoutSeconds`: schedule/cancel per-tick timer; inject empty human orders on fire; integrate with `withLock` + resolve path.
- **§4.9** — bounded `tickBuffer`; evict finished matches from RAM per policy; serve evicted spectators via JSONL replay.
- Wire `POST /api/matches` → create match
- Wire `POST /api/matches/:id/join` → join + issue JWT
- Wire `POST /api/matches/:id/orders` → submit + possibly resolve
- Wire `GET /api/matches/:id` → return player's current view

### Phase 4: Auto-play + LLM opponent (1 session)

- `src/autoplay/llmOpponent.ts` — port `fetchLlmSlot` + `chooseToOrders` logic
- `src/autoplay/loop.ts` — `runAutoPlayLoop()` for LLM-only matches
- Auto-play starts on match creation when all slots are non-human
- Test: create LLM-only match, ticks resolve automatically

### Phase 5: Spectator channel (1 session)

- `src/ws/spectatorHub.ts` — handle connection, send history, register for live
- `src/routes/spectator.ts` — `GET /api/matches/:id/spectator`
- `src/routes/spectatorHistory.ts` — `GET /api/matches/:id/spectator/history`
- Test: connect spectator WS, receive history + live ticks

### Phase 6: Player WebSocket (1 session)

- `src/ws/playerHub.ts` — first-message `{ type: "auth", token }` (§3.2 / §4.8), then send initial `view`, register
- On tick resolution: push `ProjectedView` to all connected players
- On orders submitted: push `waiting_for` to all players
- Test: player connects via WS, receives view updates on tick

### Phase 7: JSONL persistence (1 session)

- `src/persistence/matchLog.ts` — write `match_init` on creation, append one `tick` record per resolution, write `match_end` on completion. No state snapshots in MVP; checkpoints are an optional perf optimization (see §4.9) and are NOT in scope for this phase.
- `restoreMatches()` on server startup
- Restart in-progress auto-play matches
- Serve completed match history via spectator endpoints (including JSONL replay for evicted-in-memory matches — §4.9)
- Test: kill server mid-match, restart, state restores
- **`MatchManager.drain`:** implement for §4.11 (can stub no-op until Phase 3 stabilizes)

### Phase 8: Client scaffold (0.5 session)

- Remove `@rr/engine2` from `packages/web/package.json`
- Add `@rr/shared` dependency
- Add `react-router-dom` dependency
- Replace `App.tsx` with router setup
- Remove `V2Shell.tsx`, `llm/`* files, `ordersFromLegal.ts`
- Project compiles (broken UI is fine at this stage)

### Phase 9: Create match wizard (1 session)

- `src/components/MatchWizard.tsx` — form with map, seed, tribes, LLM config
- `src/routes/CreateMatch.tsx` — page wrapper
- POST to server, receive spectatorUrl, navigate to `/watch/:matchId`
- Test: create match via UI, redirects to spectator

### Phase 10: Spectator page (2 sessions)

- `src/state/spectatorStore.ts` — Zustand store with WS connection + playback
- `src/components/SpectatorMap.tsx` — adapt V2Map for god-mode view
- `src/components/SpectatorTimeline.tsx` — pause/play/step controls + event log
- `src/components/SpectatorScoreboard.tsx` — full tribe stats
- `src/routes/WatchMatch.tsx` — page layout
- Test: watch live LLM match, pause/play/scrub, reload page restores history

### Phase 11: Player page (2-3 sessions)

- `src/state/playerStore.ts` — Zustand store with WS + order submission
- `src/components/PlayerOrderQueue.tsx` — order selection from legal options
- `src/routes/PlayMatch.tsx` — page layout (adapted V2Shell)
- Map renders fog-of-war view from server `ProjectedView`
- Diplomacy panel reads from store
- Submit orders → server → WS push → view update
- Waiting state between submission and resolution
- Match end overlay
- Test: join match, submit orders, see resolution

### Phase 12: Replay viewer adaptation (0.5 session)

- Adapt existing replay viewer to consume server-provided JSONL data
- Works for both completed spectator matches and player replays

### Phase 13: Integration tests (1-2 sessions)

- Full round-trip: create match → join → submit → resolve → view update
- Spectator: create LLM match → watch live → pause → scrub → resume
- Multi-player: 2+ human players submit → tick resolves → both get views
- Persistence: server restart mid-match → state restores
- Auth: expired token rejected, wrong tribe rejected; WS rejects missing/late `auth` first message (§3.2)
- Spectator cannot submit orders
- Graceful shutdown: SIGTERM drains in-flight work without corrupting JSONL (happy path)
- Completed match replay works

---

## 8. Decisions log


| Decision                                                | Choice                                                                                                                                                                                                                                                                   | Rationale                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Use case                                                | Both multi-human and human-vs-AI                                                                                                                                                                                                                                         | Architecture supports both without bifurcation                                                                                                                                                                                                                                                                             |
| Transport                                               | REST + WebSocket                                                                                                                                                                                                                                                         | REST for commands (idempotent), WS for push (low latency)                                                                                                                                                                                                                                                                  |
| LLM opponents                                           | Server-side                                                                                                                                                                                                                                                              | Client never sees opponent views; full anti-cheat                                                                                                                                                                                                                                                                          |
| Persistence                                             | In-memory state + JSONL packet log (seed + ordered `OrderPacket`s; no state snapshots)                                                                                                                                                                                   | Deterministic engine means state is fully rebuildable from the packet log. One source of truth; no snapshot-schema drift risk. Checkpoints deferred as an optional perf optimization (§4.9).                                                                                                                               |
| Tick timing                                             | Wait-for-all (async)                                                                                                                                                                                                                                                     | True Neptune's Pride style; supports multi-human                                                                                                                                                                                                                                                                           |
| Spectator view                                          | God mode (no fog)                                                                                                                                                                                                                                                        | Most useful for watching LLM matches and debugging                                                                                                                                                                                                                                                                         |
| Spectator pacing                                        | As-fast-as-possible with pause                                                                                                                                                                                                                                           | LLM ticks are sub-second; client buffers for playback                                                                                                                                                                                                                                                                      |
| Match creation                                          | UI wizard                                                                                                                                                                                                                                                                | Better UX than API-only for ad-hoc LLM matches                                                                                                                                                                                                                                                                             |
| Spectator auth                                          | Open link, no auth                                                                                                                                                                                                                                                       | LLM matches have no private player info to protect                                                                                                                                                                                                                                                                         |
| Spectator for human matches                             | **Disabled, period** (live and post-match)                                                                                                                                                                                                                               | Prevents using spectator to bypass fog of war. Not a deferred question — this is the final MVP rule. Enforced at both REST endpoints (§3.1 spectator + spectator/history) and the spectator WS hub (§4.7): any match where `autoPlay === false` returns 403 on all spectator routes, regardless of `matchStatus`.          |
| Replay for completed matches                            | JSONL loaded from disk                                                                                                                                                                                                                                                   | Server reconstructs SpectatorView for scrubbing                                                                                                                                                                                                                                                                            |
| V2Shell local mode                                      | Fully replaced                                                                                                                                                                                                                                                           | No reason to maintain client-side engine; server is single source of truth                                                                                                                                                                                                                                                 |
| JWT scope                                               | Per-match per-tribe                                                                                                                                                                                                                                                      | Simplest auth for MVP; no global accounts needed                                                                                                                                                                                                                                                                           |
| Player WebSocket auth                                   | First message `{ type: "auth", token }` after `WS /ws/play?matchId=` — **no JWT in query string**                                                                                                                                                                         | Avoids token leakage via logs, Referer, history (§3.2). HTTP `/play?token=` for page load remains optional.                                                                                                                                                                                                                    |
| Human tick wall-clock timeout                           | `tickTimeoutSeconds` on `CreateMatchRequest`; timer injects `[]` for missing humans (§4.4b)                                                                                                                                                                               | Prevents stalled mixed matches; `0` = wait indefinitely (LLM-only default).                                                                                                                                                                                                                                                  |
| Graceful shutdown                                       | SIGINT/SIGTERM → `server.close`, stop autoplay, `matchManager.drain`, WS 1001 (§4.11)                                                                                                                                                                                      | Clean deploys; bounded wait for in-flight locks.                                                                                                                                                                                                                                                                            |
| In-memory tick history                                  | `tickBuffer` O(tickLimit); evict finished matches from RAM; JSONL replay for cold reads (§4.9)                                                                                                                                                                             | Avoids unbounded RAM for archived spectated matches.                                                                                                                                                                                                                                                                        |
| Order submission idempotency                            | Client sends per-submit `clientPacketId` (UUID); server de-dupes on `(matchId, tribe, tick, clientPacketId)`                                                                                                                                                             | WS reconnect + HTTP retries are realistic failure modes. Tick-number guard protects against drift across ticks but not double-submit within a tick. Cached response on dup; 409 on different ID for same tribe/tick.                                                                                                       |
| Crash recovery                                          | Packet log replay from seed — no state snapshots                                                                                                                                                                                                                         | Engine is deterministic (`RULES.md` §1). Storing `OrderPacket[]` + `match_init` + `match_end` gives one source of truth and eliminates snapshot-schema drift risk. Cost is O(ticks) per match to rehydrate; acceptable at MVP tick limits.                                                                                 |
| `@rr/shared` owns the client-facing type surface        | `@rr/shared` owns wire types (`engineTypes.ts`); `@rr/engine2` depends on `@rr/shared`, not the other way around                                                                                                                                                         | Structural anti-cheat guarantee: if engine is not in the web dependency closure, engine runtime cannot be bundled into the client bundle by accident. `@rr/shared` has zero workspace deps; `@rr/engine2` consumes it. Clean DAG, no circular type imports.                                                                |
| Preview helpers live in `@rr/shared`, not `@rr/engine2` | `sanitizePlayerOrders`, `wouldClipOrders`, `filterOrdersByInfluenceBudget`, `ordersExceedInfluenceBudget`, `dedupeMovesOnePerForce` + cost constants move to `@rr/shared/orderPreview.ts` and `@rr/shared/costs.ts`. `@rr/engine2`'s `tick.ts` imports them from shared. | Client needs live budget/clip feedback on every order-queue interaction; round-tripping that is poor UX. Helpers are pure functions of `(influence, Order[])` — no hidden state, safe to ship to the client. Server uses the SAME module for authoritative `sanitizePlayerOrders`, so preview and enforcement can't drift. |


---

## 9. Open questions

These don't block implementation but should be resolved during Phase 9-11:

1. **LLM persona presets** — should the server define hardcoded system prompts for personas (warlord, merchant, paranoid, etc.), or should the wizard accept free-form system prompt text?
2. **Tick timeout defaults** — mechanism is fixed (§4.4b, `tickTimeoutSeconds`). Remaining product choice: confirm **300s** vs longer hosted-session defaults (e.g. 24h async PBEM); already configurable per match at creation.
3. **Max concurrent matches** — is there a practical in-memory limit for MVP, or is it unbounded?
4. **Invite link sharing** — should human slots have shareable invite links (like PROTOTYPE_SPEC.md magic links), or does the host manually send the play URL to each player?
5. **Match listing** — should there be a public list of spectatable matches, or are they URL-only?

---

*End of SERVER_MIGRATION.md*