# ROGUE RIVALS � Game Design Document v2

**Version:** 2.0 (Draft � async pivot, pre-rules)
**Studio:** Rogues Studio
**IP:** Rogues Universe � The Barren Lands
**Companion document:** `RULES.md` (normative mechanics and numbers)

---

## 0. Revision Notes

- **v2.0 (2026-04-18):** Ground-up pivot from synchronous hot-seat resource race to **asynchronous-on-submit territorial strategy**, in the spirit of *Neptune's Pride*. Worldbuilding and tribal identities from v0.x are preserved; the core mechanical loop is replaced. See §10 for what carries over.

### Implementation status (audited 2026-04-23)

The architecture described in this document is largely implemented: tick-based async resolution, fog of war, abstract force tiers, structured diplomacy, map generation, 6-player continent map, server-authoritative architecture (see `SERVER_MIGRATION.md`), LLM opponents with persona-driven prompts, and a thin web client. The **major gap** is victory conditions: only *Last standing* and *Tick limit weighted score* are implemented in the engine. The multi-path conditions below (*Territorial dominance*, *Economic supremacy*, *Cultural ascendancy*, *Diplomatic hegemony*) and their sustain counters are specified in `RULES.md` §8 but not yet coded in `@rr/engine2`. Without them, matches can only end via elimination or tick-limit timeout.

---

## 1. Design Statement

Rogue Rivals v2 is an asynchronous turn-based strategy game for **4�8 tribes** contesting a regional map. Play advances in **ticks**, not turns. Every player submits a private **order packet** each tick; the engine resolves all orders simultaneously when the last packet arrives.

The game is designed to produce three signature experiences:

- **The order in flight.** You dispatch a host at tick 6, expected arrival tick 10. For four ticks you cannot recall it and cannot yet know the outcome. The gap is the game.
- **The diplomatic double-life.** A non-aggression pact at tick 12, a caravan of goodwill at tick 14, a betrayal at tick 18. The board records both the pact and who broke it.
- **The slow fog.** A neighbour goes dark for six ticks. Then their army appears in your rear.

It is designed to be played equally well by **LLM agents in batch simulation** and by **humans dropping into a single slot** in an otherwise-agent-filled match. It is explicitly *not* a real-time product. There is no calendar clock, no scheduler, no account system.

---

## 2. Design Pillars

1. **Async-on-submit ticks.** A tick resolves when every active player's packet has been received. LLMs respond in seconds; humans respond whenever. One engine, any pacing.
2. **Orders in transit.** Every meaningful action � moving a force, sending a caravan, dispatching a scout � has a travel time measured in ticks. Orders in flight are un-recallable. Their outcomes arrive when they arrive.
3. **Fog of war.** No player sees the full board. A player sees: regions they own, regions adjacent to those, and regions they are actively scouting. Observed forces are reported in **fuzzy tiers** (*a small warband, a large host*) � precise only to the owner.
4. **Abstract forces.** No unit counts. A force has a tier (I�IV). Combat resolves tier vs. tier with positional and structural modifiers. Small decision space, big thematic weight.
5. **Dual-channel diplomacy.** Structured proposals (NAP / Trade / Shared Vision / Declare War / Break Pact) are mechanical state. Free-text messages are bilateral prose. LLMs lean on structure; humans embellish.
6. **Design-playground-first.** The primary cockpit is the simulation batch runner. Everything LLM-addressable must be expressible in a fixed JSON schema. Human UI is a secondary mode wrapped around the same engine.

---

## 3. The Experience, Told As A Match

> *Tick 6.* Orange has held an NAP with Grey since tick 2, expiring tick 12. They dispatch a Tier III host from their Plains capital toward Grey's richest Mountain region. Expected arrival: tick 10. Grey cannot see the host � its path lies through plains terrain where Grey has no scouts.
>
> *Tick 7.* Orange messages Grey in free text: *"We honor our pact through the winter."* Grey receives this in their inbox alongside a new structured Trade Offer from Brown (20 Influence for a Shared Vision, 5 ticks).
>
> *Tick 8.* Grey, faintly suspicious that Orange hasn't acknowledged their outstanding Trade Offer, spends 3 Influence on a scout toward the Plains frontier. The scout is in transit; arrival tick 10.
>
> *Tick 9.* Red and Brown, two tribes away, sign a public NAP. Orange sees the event in their announcements feed.
>
> *Tick 10.* Grey's scout arrives and reports: **a large host in transit to your region, arriving next tick**. Grey has one tick to respond. They recruit an emergency Tier II warband in the threatened region (costing most of their reserve Influence) and send their existing garrison to reinforce. They also fire off a public **Break Pact** to Orange, followed by a **Declare War**. Every tribe on the map sees these events.
>
> *Tick 11.* Combat resolves. Orange's Tier III host vs. Grey's Tier II warband + Tier II reinforcement + Fort (+1 defending tier). Effective tiers: Orange III vs. Grey III (II reinforced by II peer = III, plus Fort = IV). Grey wins by one tier. Orange's host drops to Tier II and retreats.
>
> *Tick 12.* Brown, who held a Shared Vision pact with Grey, has watched the combat unfold. Brown proposes a three-way NAP with Grey and Red, implicitly ganging up on Orange. The screen names Orange as the pact-breaker; Orange's next diplomacy proposal to anyone incurs a reputation penalty.
>
> *Tick 14.* Orange, bleeding Influence and surrounded by closing NAPs, is effectively outplayed. They open free-text negotiations with Red, offering a relic in exchange for a backdoor alliance.

None of the above required a central referee, a real-time clock, or a chat server. It required: structured proposals, transit delays, fuzzy fog of war, and the certainty that once an order is in the packet it cannot be recalled.

The v0.8 design could not produce this scene. The v2 design is engineered to produce it.

---

## 4. World Model

### 4.1 Map

The world is a graph of **regions** connected by **trails**.

- A region has: a **type** (plains / mountains / swamps / desert / ruins / forest / river-crossing), an **owner** (a tribe or unclaimed), up to 2 **structures**, at most one **garrison** force (owner's), and a **transit list** of forces currently moving through.
- A trail has a **length in ticks**, biased by the terrain it connects. Roads (a structure) halve the trail length between their region and a chosen adjacent region.
- Maps are **procedurally generated from a seed**. A handful of canonical seeds (`2026_alpha`, `2026_bravo`, `2026_charlie`, `2026_delta`) are reserved for regression testing. Map size is 15�25 regions; every tribe's home is at most 4 trails from every other.

### 4.2 Tribes

**Four canonical tribes** with asymmetric starts (keeping the v0.x personas), plus **Arctic** and **Tricoloured** for 6-player matches (see `MAP_6P_v2.md`):

- **Orange** � Plains. Starts with **+1 Influence/tick** on Plains regions.
- **Grey** � Mountains. Starts with one **Fort** pre-built in its home.
- **Brown** � Swamps. Starts with one **Road** pre-built to its closest neighbour.
- **Red** � Desert. Starts with a **Relic** (counts as � Shrine for cultural victory).

For 5–8 player matches, additional asymmetric tribes will be defined in `RULES.md`.

### 4.3 Resource

Rogue Rivals v2 collapses the v0.x five-resource economy (Timber / Ore / Forage / Relic / Scrap) into a single unified currency:

- **Influence.** Produced per tick by owned regions (base 1, modified by terrain and structures). Spent on: recruiting forces, building structures, funding scouts, sponsoring diplomatic proposals, paying trade-offer transfers.

The old resources survive as **flavor** only: when you gather Influence from Mountains, the text says *"+2 Ore-rich Influence"*; when from Plains, *"+2 Timber-fat Influence"*. Mechanically they are interchangeable. This is a deliberate simplification � it keeps the decision space focused on *what you do* rather than *which bag you spend from*.

### 4.4 Forces

A **force** has a tier and a location.

- **Tier I � Skirmishers.** Cheap (2 Influence), fast (travels at base trail length), weak in combat.
- **Tier II � Warband.** Default (5 Influence), base travel, standard strength.
- **Tier III � Host.** Heavy (12 Influence), +1 tick travel penalty, strong in combat.
- **Tier IV � Massive.** Rare (30 Influence + requires **Forge** structure), +2 tick travel, devastating in combat.

Combat is deterministic: **higher effective tier wins**. On tie, both sides drop a tier. Attacker whose force drops below Tier I is destroyed; defender whose force drops below Tier I loses the region to the attacker.

Effective tier modifiers:

- **+1** if defending a region you own
- **+1** if defending from a Fort structure
- **+1** if reinforcement arrives from an adjacent region owned by a tribe with a Shared Vision pact (once per combat)
- **?1** if attacker was revealed by a successful scout this tick

### 4.5 Structures

Regions may hold up to 2 structures.


| Structure      | Effect                                                 | Cost |
| -------------- | ------------------------------------------------------ | ---- |
| **Granary**    | +1 Influence/tick in this region                       | 8    |
| **Fort**       | +1 defender tier in this region                        | 10   |
| **Road**       | Halves trail length to one chosen adjacent region      | 6    |
| **Watchtower** | Extends visibility: reveals adjacent regions each tick | 6    |
| **Shrine**     | +1 Influence/tick AND counts toward Cultural victory   | 12   |
| **Forge**      | Enables Tier IV recruiting in this region              | 15   |


---

## 5. Tick Structure

Each tick is a strict sequence:

1. **Order phase.** Every active player submits an `OrderPacket` containing any combination of:
  - `move` � dispatch a force from region A toward region B.
  - `recruit` � raise a force of some tier in a region you own.
  - `build` � build a structure in a region you own.
  - `scout` � send a scout toward a target region.
  - `diplomacy` � a structured proposal (NAP / Trade / Shared Vision / Declare War / Break Pact / Accept / Decline) or a free-text message.
2. **Resolution phase** (engine, deterministic):
  - a. Apply all `build` and `recruit` orders.
  - b. Advance every transit by one tick.
  - c. Resolve arrivals (forces, scouts).
  - d. Resolve combats in any region now contested.
  - e. Apply all diplomacy orders (pacts form, break, messages enqueue).
  - f. Credit Influence production.
  - g. Increment tick counter.
3. **Projection phase.** For each player the engine projects the new state through their fog-of-war lens. Each player receives a `ProjectedView` � regions they can see, transits they can see (with fuzzy strengths), their inbox, their own precise state.

All randomness comes from the seeded PRNG introduced in v0.x (`mulberry32` or equivalent). Same seed + same orders = identical replay.

---

## 6. Victory Conditions (Multi-Path)

A player wins if at the end of any tick one of the following is true:

- **Territorial dominance.** Controls ? 60% of regions for 3 consecutive ticks.
- **Economic supremacy.** Controls regions producing ? 50% of total Influence for 3 consecutive ticks.
- **Cultural ascendancy.** Owns 4 Shrines.
- **Diplomatic hegemony.** Holds active NAPs with every other surviving tribe AND the plurality of regions, for 3 consecutive ticks.
- **Last standing.** Is the only tribe with owned regions.

If the tick counter reaches **60** (configurable) with no winner, victory is awarded on a weighted score:

```
score = 0.4 � regions_owned_fraction
      + 0.3 � influence_share
      + 0.2 � shrines_owned / 4
      + 0.1 � active_NAPs / (tribes_alive ? 1)
```

Ties are shared victories.

The multi-path scheme gives distinct LLM personas (warlord, merchant prince, paranoid isolationist, kingmaker) distinct attractor goals. It also creates more pact-betrayal vectors � a rival near cultural victory is a crisis even for the territorial leader.

---

## 7. Diplomacy

Diplomacy has two channels and they interact.

### 7.1 Structured proposals (mechanical state)


| Proposal                      | Semantics                                                                                                                                                                              | Breaking it                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **NAP (Non-Aggression Pact)** | For N ticks (default 8), neither tribe may `move` into the other's regions. Visible as active-pact state.                                                                              | Break fires a public event; breaker's next 3 proposals to anyone carry a reputation penalty (recipient sees "recent pact-breaker"). |
| **Trade Offer**               | A one-off Influence transfer from tribe X to tribe Y, arriving in N ticks. The transfer is a *caravan* � in transit it can be intercepted by any force occupying a region on its path. | N/A (offers are one-shot).                                                                                                          |
| **Shared Vision**             | For N ticks, each tribe sees regions visible to the other. Does not constrain attack.                                                                                                  | Unilateral cancellation; no penalty.                                                                                                |
| **Declare War**               | Sets WAR state between two tribes; auto-cancels any pact between them; announced publicly.                                                                                             | N/A (war is the state).                                                                                                             |
| **Break Pact**                | Ends any existing pact with specified tribe; may trigger reputation penalty per above.                                                                                                 | �                                                                                                                                   |
| **Accept / Decline**          | Response to an outstanding proposal.                                                                                                                                                   | �                                                                                                                                   |


### 7.2 Free-text messages

Any player may send a free-text message to any other, delivered to the recipient's inbox on resolution. Free text has **no mechanical effect** � it is advisory, persuasive, deceptive. LLMs can emit and consume it; humans can write prose.

### 7.3 Public announcements

Certain events are broadcast to all tribes: pact formed, pact broken, war declared, victory condition reached, tribe eliminated. These are the reputational spine of the game.

---

## 8. Designing For LLMs

This section is a design constraint, not afterthought.

- Every player input is a single JSON object (`OrderPacket`). Every player output from the engine is a single JSON object (`ProjectedView` + inbox).
- The structured-diplomacy channel ensures LLMs have reliable hooks � they don't need to negotiate entirely in free text (which drifts and loses coherence over long matches).
- Personas (v1 had `greedy_builder`, `aggressive_raider`, etc.) translate to v2 personas: **warlord, merchant prince, paranoid isolationist, opportunist, kingmaker**. Each is biased toward one victory path and one diplomatic posture.
- Prompts are built around the `ProjectedView` � the LLM sees only what its fog-of-war permits. This is both thematic and protective against prompt-overload on large maps.
- The batch runner (`pnpm --filter @rr/engine2 batch:llm`) is the primary design-iteration cockpit for v2.

---

## 9. User-Interface Modes

Three modes share the engine:

- **Batch.** CLI runs N matches with M LLM agents, dumps full traces as JSONL. No UI.
- **Human-in-the-loop web.** Browser client renders one player's `ProjectedView` as an interactive map. Player composes an `OrderPacket` in a side panel. Clicking "Submit" commits the packet; the engine then asks the remaining LLM players for theirs and resolves the tick. This is the v0.8 React shell repurposed � new main view, new composer panel, new inbox; layout and theme reuse.
- **Replay.** Given a trace JSONL, the web client can scrub through ticks; fog-of-war can be toggled per player for post-match analysis.

---

## 10. What Carries Over, What's Cut

### Carries over from v0.x

- Tribes: Orange / Grey / Brown / Red, with their climate and flavor.
- Regions: Plains / Mountains / Swamps / Desert / Ruins as terrain types.
- The existing monorepo (`packages/engine2`, `packages/web`).
- Deterministic seeded PRNG pattern; replay-determinism test convention.
- Batch runner architecture in `@rr/engine2` CLI (`pnpm --filter @rr/engine2 batch:llm`).
- LLM client + persona infrastructure.
- React shell styling, event log pattern, theme variables.

### Cut outright

- Five-resource bag (Timber / Ore / Forage / Relic / Scrap) ? collapsed into Influence.
- Five-action turn structure (gather / build / ambush / scout / pass) ? replaced with the order types above.
- VP ? 8 race and 15-round cap ? replaced with multi-path victory at 60 ticks.
- Round-end bead-conversion economics ? replaced with direct-Influence economics.
- Trade-bead pending / steal mechanic (v0.8) ? absorbed into caravan-in-transit interception.
- Turn order, hot-seat handoff screens, pass-the-device UX ? replaced by simultaneous packet submission.
- Current building ladder (Shack / Den / Watchtower / Forge / Great Hall ? partial retention: Watchtower, Forge, and a renamed Shrine survive; Shack and Den are cut; Fort / Granary / Road are new).

### Historical simulations

Older `simulations/*.jsonl` batches from pre-v2 engines may remain in-repo as archives; they are not replayable under v2 rules.

---

## 11. Deferred to RULES.md

The following are specified in `RULES.md` (normative numbers and schemas):

- Influence production per region type and per structure, per tick.
- Recruit costs per tier (above are working estimates, not commitments).
- Structure build costs (ditto).
- Trail lengths per terrain pairing.
- Exact order of PRNG draws during resolution (for replay determinism).
- JSON schemas: `OrderPacket`, `GameState`, `ProjectedView`, `DiplomaticProposal`, `TraceEvent`.
- Default NAP length, default Shared Vision length, default Trade Offer delay.
- Reputation-penalty magnitude for pact breaking.
- Starting Influence and starting garrison tier per tribe.
- Map generation parameters (region count, trail density, resource distribution).

---

## 12. Success Criteria

Before committing code, the design is considered healthy when:

- A sample match can be narrated tick-by-tick by reading only this document and `RULES.md` (no engine required).
- A 5-year-old persona description (*e.g., "paranoid isolationist: values survival, distrusts all proposals, prefers Forts over Roads"*) has obvious mechanical consequences.
- At least one dramatic moment per 15-tick window is producible by the rules alone � not requiring free-text diplomacy to generate drama.
- The old v0.8 dominant strategy ("gather home, build Shack, Den, Forge") has no v2 analogue. The optimal strategy must depend on map, neighbours, and their diplomatic posture.

---

*End of GDD.md.*