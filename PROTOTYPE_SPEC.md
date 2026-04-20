# ROGUE RIVALS ? Prototype Implementation Spec

**Target ruleset:** `RULES.md` v0.7.3
**Status:** Draft for implementation handoff
**Companion docs:** `GDD.md` (design intent), `RULES.md` (canonical mechanics), `SIMULATION_SCHEMA.md` (legacy v0 event format), `tools/v2/` + `packages/engine2` (v2 engines)

> **Authority:** If this document conflicts with `RULES.md`, `RULES.md` wins. This spec is **how to build**; the rules are **what to build**.

---

## 0. Goals

Build a **playable, deterministic, async 4-player prototype** of Rogue Rivals v0.7.3 that can be put in front of real humans within 4 weeks. The prototype must prove:

1. The core loop is fun over a full 10-round match
2. The "thread is the game" UX feels right on mobile
3. Trade negotiation in async windows works socially
4. Rule enforcement is bulletproof and replayable

The prototype is **not** production. We're cutting everything we can cut.

## 1. Explicit scope

### In scope (MVP)

- 2?4 player matches with v0.7.3 rules, deterministic with a seed
- Web client that runs in any modern mobile browser, zero install
- Magic-link match invites (no phone-number/SMS integration in MVP)
- In-app thread view that simulates the "messaging-native" UX
- Full rule enforcement server-side; client is a view + input layer
- Match log persisted in `SIMULATION_SCHEMA.md` v1.0 format
- Replay view: play back any completed match from its log
- One artwork pass sufficient for playtest (not final art)

### Out of scope (deferred)

- Real SMS/RCS carrier integration (Jest API) ? simulated in-app only for MVP
- Phone-number auth ? magic link by email or opaque token
- Push notifications ? optional PWA add-on if time permits
- Matchmaking, lobbies, Elo, profiles
- Multiple concurrent matches per player in one UI
- Anti-abuse, throttling, moderation, admin tools
- Tribe cosmetics beyond the four prototype tribes
- Tutorial flow (playtesters will be briefed manually)
- Full pixel-art production ? use placeholder assets
- i18n; English only
- Cloud infra HA/scaling ? single region, small instance is fine

### Out of scope but worth writing a one-page note on later

- Rogue flavor system (see GDD ù5.3 ? narrative overlay, purely text)
- Visible Trailing Bonus/Tribute Route UI polish (minimum viable UI only for MVP since simulation shows low utilization)

## 2. Milestones

Three milestones, each independently demoable.

### M1 ? Local hot-seat (week 1)

One laptop, 2?4 players share it. No auth, no server, no async. The point is **to verify the engine and UI end-to-end** with zero infra.

Acceptance:
- All v0.7.3 rules enforced correctly via the shared engine package
- All 5 actions playable: Gather, Build, Ambush, Scout, Pass
- Trades proposable/acceptable/rejectable/counterable
- Match ends correctly on all three triggers (Great Hall, VP ?8, Round 15)
- Full match log written to disk on completion; replayable via CLI
- Deterministic: same seed + same sequence of inputs ? identical log

### M2 ? Async single-server (weeks 2?3)

Each player on their own device. Turns resolve asynchronously with a 24-hour soft timeout (for playtest convenience; GDD's 30s is production-stage). In-app thread is the primary UI; notifications are emails or opt-in web push.

Acceptance:
- Real 2?4 player async matches playable across devices
- Turn timeout ? auto-Pass (configurable per match)
- Thread view shows all public events (per `RULES.md` ù8 glossary)
- Private state (exact VP, exact stockpiles, hidden ambushes) only visible to owning player
- Magic-link invites work (email in MVP; phone later)
- Match persists across server restarts (no in-memory state loss)

### M3 ? Playtest-ready (week 4)

Polish, observability, and the artifacts needed to run playtests confidently.

Acceptance:
- Replay view works in browser for any completed match
- Admin endpoint dumps any match's JSONL log on demand
- One "host" account can spectate an in-progress match (private info redacted)
- Simple feedback form after match end (1?5 star + free-text)
- Rate-limit on trade proposals per turn (prevent spam)
- Basic analytics: match duration, archetype distribution (tribe), completion rate

## 3. Architecture overview

```
 ???????????????????????????????????????
 ?  Browser (mobile-first)             ?
 ?  ?????????????????????????????????  ?
 ?  ?  React + Canvas               ?  ?
 ?  ?  - Thread view (primary UI)   ?  ?
 ?  ?  - Map/settlement Canvas      ?  ?
 ?  ?  - Action tray                ?  ?
 ?  ?  - Trade modal                ?  ?
 ?  ?????????????????????????????????  ?
 ???????????????????????????????????????
                ? HTTPS (REST)
                ? WebSocket (push)
                ?
 ???????????????????????????????????????
 ?  Node.js server (single process)    ?
 ?  ?????????????????????????????????  ?
 ?  ?  API (Express/Fastify)        ?  ?
 ?  ?????????????????????????????????  ?
 ?  ?  Match Service                ?  ?
 ?  ?  - loads/saves match state    ?  ?
 ?  ?  - invokes engine on actions  ?  ?
 ?  ?  - broadcasts public events   ?  ?
 ?  ?????????????????????????????????  ?
 ?  ?  Engine (shared package)      ?  ?
 ?  ?  - pure functions             ?  ?
 ?  ?  - v0.7.3 rule enforcement    ?  ?
 ?  ?  - deterministic w/ seed      ?  ?
 ?  ?????????????????????????????????  ?
 ?  ?  Notifier                     ?  ?
 ?  ?  - email magic links (M2+)    ?  ?
 ?  ?  - web push (M3, optional)    ?  ?
 ?  ?????????????????????????????????  ?
 ???????????????????????????????????????
                ?
                ?
 ???????????????????????????????????????
 ?  SQLite (MVP) ? Postgres (later)    ?
 ?  - matches, players, actions_log    ?
 ?  - JSONL export for SIM_SCHEMA logs ?
 ???????????????????????????????????????
```

**Key architectural commitments:**

- The **engine is a pure TypeScript module** shared between server and client. Client runs it for optimistic UI; server runs it for authoritative resolution. Both see the same rule implementation.
- The **server is the single source of truth**. Client state is a projection.
- **All randomness flows from a seeded PRNG.** No `Math.random()` anywhere in the engine.
- **The action log is append-only.** Any match state can be rebuilt by replaying its log from round 0.

## 4. Tech stack (recommended, not mandatory)

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript 5+ (strict) | Shared engine between client & server; strong typing for rule invariants |
| Runtime | Node 20 LTS | Stable, maintained, fine for single-process prototype |
| Package manager | pnpm | Monorepo-friendly, fast |
| Server framework | Fastify | Lightweight, good TS support, WebSocket plugin |
| Client framework | React 18 + Vite | Fast dev loop, small prod bundle |
| Canvas lib | None (raw 2D canvas) | GDD says 2D pixel-art, bundle target <300KB |
| State management | Zustand | Tiny, sufficient for a prototype |
| Database | SQLite (via better-sqlite3) | Single file, zero ops, plenty for playtest scale |
| Migrations | Drizzle | Lightweight, TS-native |
| Auth | Short-lived JWT signed by server; magic-link issuance | Sufficient without phone |
| Transport | REST for commands, WebSocket for events | Simplest full-duplex setup |
| Hosting | Fly.io or Railway single instance | Small, cheap, fast to deploy |
| Email | Resend (for magic links) | Simple API, generous free tier |

**Monorepo layout:**

```
rogue-rivals/
??? packages/
?   ??? engine/             # rule enforcement, pure TS, no I/O
?   ?   ??? src/
?   ?   ?   ??? rules.ts           # types + constants (from RULES.md)
?   ?   ?   ??? state.ts           # MatchState, PlayerState
?   ?   ?   ??? actions.ts         # applyAction()
?   ?   ?   ??? trade.ts           # resolveTrade(), bead accounting
?   ?   ?   ??? endOfRound.ts      # standings, trailing bonus
?   ?   ?   ??? matchEnd.ts        # triggers & winner determination
?   ?   ?   ??? rng.ts             # seeded PRNG (mulberry32)
?   ?   ?   ??? index.ts
?   ?   ??? test/                  # replays known logs from simulations/
?   ?
?   ??? shared/             # types + API contracts
?   ?   ??? src/api.ts             # request/response shapes
?   ?
?   ??? server/             # Fastify app
?   ?   ??? src/
?   ?       ??? index.ts           # bootstrap
?   ?       ??? api/               # HTTP handlers
?   ?       ??? ws/                # WebSocket hub
?   ?       ??? match/             # match service, persistence
?   ?       ??? notifier/          # email, push
?   ?       ??? auth/              # magic link
?   ?
?   ??? web/                # React client
?       ??? src/
?           ??? canvas/            # map renderer
?           ??? components/        # UI (thread, trade modal, tray)
?           ??? routes/            # pages
?           ??? state/             # zustand stores
?
??? tools/                  # existing Python simulator (kept for design iteration)
??? simulations/            # existing logs
??? RULES.md
??? GDD.md
??? SIMULATION_SCHEMA.md
??? PROTOTYPE_SPEC.md       # this file
```

## 5. Data model

Minimum viable schema. All tables have `created_at`, `updated_at` unless noted.

### `matches`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUIDv4 |
| `seed` | INTEGER | Passed into engine PRNG |
| `rules_version` | TEXT | `"v0.7.3"` |
| `turn_order` | TEXT (JSON) | `["P1","P2","P3","P4"]` |
| `status` | TEXT | `lobby` / `active` / `finished` |
| `current_round` | INTEGER | |
| `current_turn_index` | INTEGER | Index into `turn_order` |
| `end_trigger` | TEXT | nullable: `round_limit` / `vp_threshold` / `great_hall` |
| `started_at` | TIMESTAMP | nullable |
| `finished_at` | TIMESTAMP | nullable |

### `players`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUIDv4 |
| `match_id` | TEXT FK | |
| `seat` | INTEGER | 0..3 |
| `tribe` | TEXT | `orange` / `grey` / `brown` / `red` |
| `display_name` | TEXT | |
| `auth_token` | TEXT | scoped to this match only |
| `joined_at` | TIMESTAMP | nullable |

### `actions_log`
Append-only, ordered. This is the **authoritative record**; match state is a cache.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | autoincrement |
| `match_id` | TEXT FK | |
| `round` | INTEGER | |
| `turn` | INTEGER | global monotonic turn number within the match |
| `seq` | INTEGER | sequence within a turn (trades, then action) |
| `actor_player_id` | TEXT FK | nullable for system events |
| `event_type` | TEXT | from `SIMULATION_SCHEMA.md` ùevents |
| `payload` | TEXT (JSON) | event-specific body |
| `at` | TIMESTAMP | |

### `match_cache`
Snapshot of current engine state for O(1) load. Can be rebuilt from `actions_log` at any time.

| Column | Type | Notes |
|---|---|---|
| `match_id` | TEXT PK | |
| `state_json` | TEXT | full `MatchState` serialised |
| `last_action_id` | INTEGER | cache validity marker |

## 6. Engine (the heart)

The v2 engine is **pure** and **deterministic**; Python (`tools/v2/`) and TypeScript (`packages/engine2`) are parity-tested. Port, don't re-invent.

### 6.1 Core types (TypeScript)

```ts
export type Tribe = "orange" | "grey" | "brown" | "red";
export type Region = "plains" | "mountains" | "swamps" | "desert" | "ruins";
export type Resource = "T" | "O" | "F" | "Rel" | "S";
export type BuildingType = "shack" | "den" | "watchtower" | "forge" | "great_hall";

export type Resources = Record<Resource, number>;

export interface PlayerState {
  id: string;                      // "P1" .. "P4"
  tribe: Tribe;
  vp: number;
  resources: Resources;
  beads: number;
  beadsEarnedThisRound: number;    // v0.7.2+
  partnersTraded: string[];
  buildings: BuildingType[];
  activeAmbushRegion: Region | null;
  watchtowerUsedThisRound: boolean;
  trailingBonusActive: boolean;
  tributeRouteWith: string | null;
  tributeRouteRoundsLeft: number;
}

export interface TradeOffer {
  id: string;
  offerer: string;
  recipient: string;
  offered: Partial<Resources>;
  requested: Partial<Resources>;
  createdTurn: number;
  status: "pending" | "accepted" | "rejected" | "expired" | "countered";
}

export interface MatchState {
  rulesVersion: "v0.7.3";
  seed: number;
  turnOrder: string[];
  round: number;
  currentPlayerId: string;
  players: Record<string, PlayerState>;
  scrapPool: number;
  pendingOffers: TradeOffer[];
  matchEnded: boolean;
  endTrigger: null | "round_limit" | "vp_threshold" | "great_hall";
}

export type Action =
  | { kind: "gather"; region: Region }
  | { kind: "build"; building: BuildingType; forgePickedResources?: Resource[] }
  | { kind: "ambush"; region: Region }
  | { kind: "scout"; region: Region }
  | { kind: "pass" };

export type Command =
  | { kind: "propose_trade"; offer: Omit<TradeOffer, "id" | "status" | "createdTurn"> }
  | { kind: "accept_trade"; offerId: string }
  | { kind: "reject_trade"; offerId: string }
  | { kind: "counter_trade"; offerId: string; counter: TradeOffer["offered"] & { requested: TradeOffer["requested"] } }
  | { kind: "take_action"; action: Action };
```

### 6.2 Engine API

```ts
export function initMatch(opts: {
  seed: number;
  seats: { playerId: string; tribe: Tribe }[];
}): MatchState;

export function applyCommand(
  state: MatchState,
  playerId: string,
  command: Command,
  now: Date
): { newState: MatchState; events: LogEvent[] } | { error: RuleError };

export function isLegal(
  state: MatchState,
  playerId: string,
  command: Command
): true | RuleError;

export function listLegalActions(
  state: MatchState,
  playerId: string
): Action[];
```

**Hard constraints:**

- `applyCommand` never mutates `state`. Return a new state.
- Illegal commands return `{ error }` ? never throw.
- All randomness passes through `state.rng` (a serializable PRNG seed counter), never `Math.random`.
- After every `take_action`, the engine advances to the next player and runs end-of-round resolution / match-end check as specified in `RULES.md` ù2 and ù5.

### 6.3 Determinism test

Required test before M1 signoff: load any JSONL from `simulations/batch_v0.7.3.jsonl`, replay all commands through the TS engine, assert final `MatchState` matches the logged `outcome` and `final_player_state`. **All 50 matches must pass.** This is the single strongest bug-catcher we have.

## 7. Server API

Minimal surface. REST for commands, WebSocket for push.

### 7.1 REST endpoints

```
POST   /api/matches                          # create match (host)
POST   /api/matches/:matchId/invites         # generate magic-link per seat
POST   /api/matches/:matchId/join            # accept invite, assume seat
GET    /api/matches/:matchId                 # get public state + own private state
GET    /api/matches/:matchId/log             # full action log (redacts hidden info if not finished)
POST   /api/matches/:matchId/commands        # submit a Command (body: { command })
GET    /api/matches/:matchId/replay          # full log for finished matches (public)
```

### 7.2 WebSocket channel

```
wss://host/ws?matchId=?&token=?
```

Server pushes:

```json
{ "type": "event", "event": { ...one SIMULATION_SCHEMA event... } }
{ "type": "state", "state": { ...full personal projection... } }
{ "type": "turn",  "activePlayerId": "P2", "deadline": "2026-04-18T18:00:00Z" }
{ "type": "match_end", "winner": "P1", "trigger": "great_hall" }
```

Client sends:

```json
{ "type": "heartbeat" }
```

(All commands go via REST for idempotency; the socket is push-only.)

### 7.3 Command validation

Server-side, **every** command runs through `engine.isLegal()` before persistence. Client optimism is allowed but the authoritative reply wins. Conflicting optimistic state is reset from the server's latest projection.

### 7.4 Private vs public projections

Before sending state to player `Pi`:
- `players[Pj].resources` (for j ? i): redact to totals only (`sum`)
- `players[Pj].beads`: visible (Beads are public per `RULES.md` ù8)
- `players[Pj].vp`: redact to ordinal rank only (per `RULES.md` ù6.1)
- `players[Pj].activeAmbushRegion`: redact to `"hidden"` if non-null
- `pendingOffers`: visible to offerer and recipient; redact others

## 8. Client UI

### 8.1 Screen list

| Screen | Purpose |
|---|---|
| `Landing` | Magic link entry / "Create match" button |
| `Lobby` | Waiting for other players to join; copy invite link |
| `MatchMain` | Thread + Canvas map + action tray (the core game UI) |
| `Replay` | Linear timeline scrubber for a finished match |
| `Postgame` | Final standings + feedback form (M3) |

### 8.2 `MatchMain` layout (mobile-first)

```
?????????????????????????????????????
?  Match header                     ?
?  Round 5/15 ? Your turn in 0:24s  ?
?????????????????????????????????????
?                                   ?
?  Canvas (map of 5 regions +       ?
?  settlement view)                 ?
?  ~40% of viewport                 ?
?                                   ?
?????????????????????????????????????
?                                   ?
?  Thread (scrollable)              ?
?  - Action events                  ?
?  - Trade offers (inline cards)    ?
?  - Standings snapshots            ?
?  ~40% of viewport                 ?
?                                   ?
?????????????????????????????????????
?  Stockpile strip (your resources) ?
?  T:3 O:1 F:2 Rel:0 S:1 Beads:2    ?
?????????????????????????????????????
?  [Gather] [Build] [Ambush] [Scout]?
?????????????????????????????????????
```

Tapping an action opens a bottom sheet with the specific target (region / building / etc). Two taps maximum to confirm any legal action.

### 8.3 Canvas rendering

- Fixed logical resolution: **640ù360** (16:9), scaled to viewport with `ctx.scale`
- Pixel-perfect rendering, `image-rendering: pixelated` on the canvas element
- Five regions as discrete zones (plains / mountains / swamps / desert / ruins) ? simple hand-drawn or placeholder tiles are fine for MVP
- Player settlements as small iconography overlaid on their home region
- Buildings shown as small pins on the settlement (up to 5 stacking)
- Animate only: gather yield (+2 Timber ?), ambush (hit/miss flash), build complete (sparkle). Everything else is static.
- Target: 60fps on a mid-range 2022 Android. Static scenes should consume 0 animation frames via `requestAnimationFrame` gating.

### 8.4 Thread component

This is the GDD's "the thread is the game" principle, simulated in-app for MVP.

Event types rendered (from `RULES.md` ù8):

| Event | Rendering |
|---|---|
| `turn_start` | system divider line with player name |
| `action_gather` | plain text: *"Orange gathered 3 Timber from plains"* |
| `action_build` | highlighted: *"Orange built a Shack (+1 VP)"* |
| `action_ambush_set` | redacted: *"Orange moved in secret"* (region hidden) |
| `action_scout` | plain text with region revealed |
| `ambush_triggered` | red accent: *"Orange ambushed Grey at mountains for 4 Ore"* |
| `ambush_scouted` | yellow accent: *"Brown scouted Orange's ambush at plains"* |
| `trade_proposed` | inline card with Accept/Counter/Reject buttons if recipient |
| `trade_resolved` | green accent, shows both sides |
| `bead_earned` | subtle: *"Orange earned a Bead"* |
| `bead_converted` | highlight: *"Orange converted 2 Beads ? +1 VP"* |
| `round_end` | divider + standings snapshot |
| `match_end` | full-screen takeover summarising result |

Trade cards are interactive when addressed to the current player. Use a touch-friendly bottom sheet for counters.

### 8.5 State management (client)

Single Zustand store:

```ts
interface ClientStore {
  matchId: string;
  myPlayerId: string;
  state: MatchState | null;           // projection from server
  events: LogEvent[];                 // append-only, rendered in Thread
  connection: "connecting" | "open" | "reconnecting";
  pendingCommand: Command | null;     // optimistic, cleared on server ack/reject
}
```

Events arrive via WebSocket, append to `events`, optionally reconcile `state`. Commands go out via REST; the ack triggers a full `state` push.

## 9. Async turn flow

### 9.1 Happy path

1. Player A's turn begins. Server stamps `turnDeadline = now + 24h` (configurable per match; default 24h for MVP, 30s for production-stage).
2. Server pushes `turn_start` event to all players, `turn` message to A over WebSocket.
3. (Optional) If A is not currently connected, server emails them "Your turn in Rogue Rivals ({matchName}). Link: /m/{matchId}?t=?"
4. A taps the link, auth token validates, client loads state, shows action tray.
5. A optionally proposes / accepts trades (each via `POST /commands`), then takes one action.
6. Server resolves, broadcasts events to all players via WebSocket.
7. Server advances to next player; repeat from 1.

### 9.2 Timeout handling

If `turnDeadline < now` and no action submitted:
- Server synthesises a `{ kind: "take_action", action: { kind: "pass" } }` command on A's behalf.
- Logs a `turn_timeout` event in the thread.
- Advances turn normally.

### 9.3 Disconnect / reconnect

WebSocket is best-effort. On reconnect, client hits `GET /api/matches/:id` to get a full fresh projection, then resumes live events. No delta sync for MVP.

### 9.4 Trade expiration

Per `RULES.md` ù3.2, offers expire when the offerer's next turn begins. Server runs this automatically in the turn-start hook and emits `trade_expired` events.

## 10. Auth & identity

**MVP:** Magic links.

- Host creates a match via `POST /api/matches`, receives `matchId` and 3 invite tokens (one per non-host seat)
- Invite URL format: `https://host/m/{matchId}/join?token={inviteToken}`
- Clicking link: server validates token, assigns seat, issues a match-scoped JWT stored in localStorage
- JWT claims: `{ matchId, playerId, iat, exp }`, signed HS256, 30-day expiry
- Each JWT is valid for **only that match**. No global account.

Limitations accepted for MVP:
- No account recovery ? if you lose the link, you lose your seat
- No cross-match identity ? a player playing 3 matches has 3 distinct JWTs
- Email optional: for magic-link delivery only, not stored as identity

## 11. Logging & observability

### 11.1 Match log format

**Every finished match emits a JSONL file conforming to `SIMULATION_SCHEMA.md` v1.0.**

- Written to `matches/{matchId}.jsonl` in the server's data directory on match end
- Also accessible via `GET /api/matches/:id/log` (auth required for unfinished matches)
- Format MUST match simulator output so the same analysis tools work

### 11.2 Server logs (for us, not players)

| Level | What |
|---|---|
| `info` | Match created, joined, turn resolved, match ended |
| `warn` | Rule violation attempted, turn timeout, reconnection |
| `error` | Engine exception, WebSocket crash, DB error |

Ship to stdout; single instance; Fly.io log tail is sufficient for MVP.

### 11.3 Metrics (M3)

Small dashboard (or plain SQL queries) exposing:
- Match completion rate (finished vs abandoned)
- Avg match duration (wallclock) and avg match length (rounds)
- End-trigger distribution
- Tribe win distribution
- Feedback ratings

## 12. Testing strategy

### 12.1 Engine (must-pass)

- Unit tests for each action type with edge cases from `RULES.md`
- Replay test: all 50 v0.7.3 simulation logs must replay byte-identical on the TS engine
- Fuzz test: random seeds + random valid commands for 1000 matches, no throws, no illegal states

### 12.2 Server

- Integration tests for happy-path REST + WS round trip
- Permission tests: player cannot submit commands for another player
- Timeout test: no action within deadline ? auto-pass fires
- Persistence test: restart server mid-match, state restores

### 12.3 Client

- Not prioritised. One smoke test using Playwright for "create match ? join ? take one turn" is enough for M3.

### 12.4 Manual playtest protocol (M3 handoff)

- 2 games of 3 players, 2 games of 4 players
- Different tribe assignments each game
- Observer takes notes on: confusion moments, best/worst turns, "is it fun?" score
- Feedback form at end captures structured data

## 13. Risk register

| Risk | Mitigation |
|---|---|
| TS engine diverges from Python reference | Replay test against 50 known-good logs; run both on same seed in CI weekly |
| Trade negotiation too slow in async (players wait hours for a yes/no) | 24h default timeout; auto-expire on offerer's next turn; UI makes it 1-tap to reject |
| Canvas performance on older Android | Fallback to DOM rendering if `requestAnimationFrame` drops below 45fps for 2s |
| Magic links shared on social / seat stolen | JWTs are per-seat and rotate-resistant; first claim wins; link expires 24h after invite |
| Host abandons match | 72h inactivity on any player ? match auto-forfeits, records as abandoned |
| Rule ambiguity discovered during playtest | Update `RULES.md` first, then port to engine; log version bump |

## 14. Concrete milestone checklist

### M1 ? Local hot-seat
- [ ] `packages/engine2` bootstrapped with types from ù6.1 (v2)
- [ ] `initMatch`, `applyCommand`, `isLegal`, `listLegalActions` implemented
- [ ] Seeded PRNG (mulberry32 seeded by match seed)
- [ ] Replay test passes on all 50 v0.7.3 logs
- [ ] CLI entry `node dist/engine-cli.js play --seed 42 --seats orange,grey,brown,red` that runs a hot-seat match via stdin
- [ ] Match log written to `matches/{matchId}.jsonl` matches sim schema

### M2 ? Async server
- [ ] Fastify server with endpoints in ù7.1
- [ ] WebSocket hub with messages in ù7.2
- [ ] SQLite schema in ù5 migrated
- [ ] Magic-link flow end-to-end (create ? invite ? join ? play)
- [ ] React client with `MatchMain` layout ù8.2
- [ ] Canvas renders all 5 regions and 5 building types at target performance
- [ ] Thread renders every event type in ù8.4 table
- [ ] Turn-timeout auto-pass working
- [ ] Deployable to Fly.io or Railway via a `Dockerfile`

### M3 ? Playtest-ready
- [ ] Replay view reads any `.jsonl` and plays it back with a scrubber
- [ ] Admin dump endpoint for match logs
- [ ] Postgame feedback form (5-star + free text) persisted
- [ ] Basic analytics view (SQL queries or tiny /admin dashboard)
- [ ] Rate limit on `propose_trade` (max 5 pending per turn)
- [ ] Playtest protocol documented in `PLAYTEST.md`
- [ ] Run first playtest session

## 15. Open questions for the design side

These are the things that simulation didn't answer. Flag them during playtest.

1. Do humans naturally use Tribute Routes, or is the comeback mechanic also ignored by real players? (Simulation shows 6% utilization.)
2. Does `random` at 10% win rate translate to "low-effort players can still win sometimes" feel-good, or does it feel like the game has too much luck?
3. Does the ambush-hidden-region mechanic feel exciting or frustrating? (0% scouting of hidden ambushes in the simulations was a bot artifact; humans will behave differently.)
4. Is 10?11 rounds short enough to feel "fast-paced messaging" or long enough to feel "a real strategy game"? Or neither?
5. Does "the thread is the game" fiction survive in a web-app approximation, or do we need real SMS/RCS to validate that claim?

---

## Appendix A ? Quick-start for the implementer

```bash
# Scaffold
pnpm init
pnpm add -w typescript vitest
pnpm -F @rr/engine2 init
pnpm -F @rr/server  init
pnpm -F @rr/web     init

# Engine first
cd packages/engine2
# v2 engine; see `RULES.md` and parity tests vs `tools/v2/`
# Target: all 50 v0.7.3 logs replay green

# Verify determinism
pnpm -F @rr/engine2 test

# Then server
cd ../server
# Implement endpoints ù7.1, plumb engine

# Then web
cd ../web
# React + Vite + Canvas layer, build MatchMain ù8.2
```

## Appendix B ? File diff from current repo

**New files to create:**
- `/package.json`, `/pnpm-workspace.yaml`, `/.nvmrc`
- `/packages/engine2/**` (v2 TS package)
- `/packages/shared/**`
- `/packages/server/**`
- `/packages/web/**`
- `/Dockerfile`
- `/fly.toml` (or `railway.json`)
- `/PLAYTEST.md` (for M3)

**Files NOT to touch during MVP:**
- `tools/v2/` ù Python oracle for v2
- `simulations/*` ? immutable baselines for engine correctness testing
- `RULES.md`, `GDD.md`, `SIMULATION_SCHEMA.md` ? canonical docs

**Files to reference constantly:**
- `RULES.md` ? every engine change must cite a rule section
- `SIMULATION_SCHEMA.md` ? every log event must conform
- `RULES.md` + `tools/v2/` ó when in doubt, match Python oracle behavior

---

*End of PROTOTYPE_SPEC.md*
