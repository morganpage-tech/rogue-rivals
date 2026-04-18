# ROGUE RIVALS ù Game Design Document

**Version:** 0.7.3 (Draft ù core loop ruleset stable, pre-prototype)
**Studio:** Rogues Studio
**IP:** Rogues Universe ù The Barren Lands
**Platform:** Jest (SMS/RCS)
**Engine:** HTML5 Canvas
**Genre:** Turn-based Multiplayer Strategy
**Players:** 2ù4
**Session Model:** Asynchronous, ~30s per turn, up to 15 rounds per match
**Target Timeline:** Playable prototype in 6 weeks

**Companion specs:**

- `RULES.md` ù canonical, simulation-ready rule set
- `SIMULATION_SCHEMA.md` ù data format for automated playtest runs

**Revision history:**

- v0.1 ù initial draft derived from Jest pitch
- v0.2 ù first simulation pass (2P); locked trade-as-passive, reframed raid to ambush
- v0.3 ù added starter building, Ambush-failure-is-cheap, Trade Beads
- v0.4 ù added Scout counter-mechanic, resource-gated buildings
- v0.5 ù 4P stress test; ordinal standings, ambush Scrap cost, trailing-player bonus
- v0.6 ù dropped Rogue-bind, simplified Bead cap to once-per-partner, tightened comeback
- v0.7 ù pacing pass: cheaper Great Hall (6 resources), VP threshold **8**, repeatable Bead conversions (spend 3 Beads per +1 VP)
- v0.7.3 ù Trade Beads: still **+1 Bead per qualifying trade** up to a **2 Bead per player per round** cap from trades (further trades that round complete without extra Beads); spend **2 Beads** per **+1 VP** (repeat loop). Relaxes v0.7.2's 1-Bead cap to restore **alliance**-style volume without reintroducing unlimited per-round Bead income.
- v0.7.2 ù Trade Beads: still **+1 Bead per qualifying trade**, but **at most one Bead per player per round** from trades (extra trades complete without extra Beads); spend **2 Beads** per **+1 VP** (repeat loop). Paired with agent **leader-awareness** (decline feeding near-winners). Targets banker snowball without killing trade volume.
- v0.7.1 ù Trade Beads: earn **+1 Bead every completed trade**; spend **2 Beads** per **+1 VP** (repeat loop). Fixes v0.7 where uncapped conversion barely fired because bead income stayed partner-limited.

> *"From the ashes, a fox arose..."*

---

## 1. Executive Summary

Rogue Rivals is a turn-based, asynchronous multiplayer strategy game designed natively for messaging platforms (Jest SMS/RCS). 2ù4 players lead rival fox tribes in the post-apocalyptic Barren Lands, competing to rebuild civilization after The Great Collapse by **scavenging**, **building**, **trading**, and **raiding**. Each turn is a single 30-second decision delivered as a text message ù the SMS thread itself becomes the living chronicle of the match.

### Design Pillars

1. **One decision, 30 seconds** ù Every turn is a clear tactical choice, optimized for mobile micro-sessions.
2. **The thread is the game** ù SMS/RCS isn't a notification layer; it is the primary UI for social context and narrative.
3. **Trade or die** ù No tribe has all resources; negotiation with rivals is mandatory.
4. **Viral by lore** ù Inviting a friend to play IS texting them, reinforced by the "Rogue" archetype in-universe.
5. **Cosmetic-first monetization** ù Never pay-to-win; identity, style, and flair only.

### Design Targets (KPIs)


| Metric                        | Target                        |
| ----------------------------- | ----------------------------- |
| Average turn time             | **30 seconds**                |
| Daily return sessions per DAU | **8ù12x**                     |
| Viral coefficient (K-factor)  | **? 1.5**                     |
| Match length                  | 20ù30 rounds over a few hours |
| Prototype delivery            | 6 weeks                       |


---

## 2. World & Narrative

### 2.1 Setting

Centuries after **The Great Collapse** shattered civilization, scattered fox tribes (Foxiz) have carved out survival in the harshest corners of the continent ù the **Barren Lands**. Resources are scarce, unevenly distributed, and every alliance is temporary.

### 2.2 Tone

Quirky post-apocalyptic. Serious enough for strategic stakes; playful enough to invite cosmetic expression. Matches an existing visual language from *Outmine* and *World of Rogues*.

### 2.3 Core Lore Hook ù "The Rogue"

A *Rogue* is a fox with no tribe, one who crosses all borders. In-fiction, recruiting a new player = sending a Rogue across the desert to find a new tribe leader. **The invite IS the onboarding.**

> *"Becoming territorial, suspicious and protective of their native culture ù Foxiz engaged with their own kin and rarely with others, only for essential trade."*

---

## 3. Fox Tribes (Factions)

Prototype ships with **four tribes**, each occupying a unique region with a unique home resource. (Tricoloured and Arctic Foxiz from the original pitch are planned post-launch content ù kept out of launch scope to keep balance surface tight.)


| Tribe            | Region         | Home Resource |
| ---------------- | -------------- | ------------- |
| **Orange Foxiz** | Windy Plains   | Timber        |
| **Grey Foxiz**   | High Mountains | Ore           |
| **Brown Foxiz**  | Reeky Swamps   | Fiber         |
| **Red Foxiz**    | Vast Desert    | Relics        |


All four tribes share the neutral **Ruins** region, the only source of **Scrap**. The Scrap pool is finite and does not regenerate ù creating a natural pacing mechanism and an emergent race.

**Design principle:** No tribe can win without trading. Endgame buildings require resource types a single tribe can never self-gather, forcing cross-tribe negotiation. Tribe asymmetry is **spatial/resource**, not statistical ù there are no combat or yield modifiers by tribe. This keeps the prototype balance tractable; flavor abilities return post-launch.

---

## 4. Core Gameplay Loop (v0.7.3)

> **Canonical rules live in `RULES.md`.** This section is a design-level summary. Any conflict resolves in favor of `RULES.md`.

### 4.1 Turn structure

On your turn you may, in any order:

1. **Propose any number of trades** (free, expire at your next turn)
2. **Accept any pending offers** addressed to you (free)
3. **Take exactly ONE action:** Gather, Build, Ambush, or Scout

That's it. 30 seconds, one action, plus as much free negotiation as you want.

### 4.2 The four actions


| Action     | What it does                                                                                                                             | Cost      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **Gather** | Send a Rogue to a region, receive resources immediately                                                                                  | ù         |
| **Build**  | Pay resources to construct a structure; gain VP + passive effect                                                                         | Resources |
| **Ambush** | Hidden from opponents. If another player Gathers that region this round, you intercept their yield (2ù); otherwise your action is wasted | 1 Scrap   |
| **Scout**  | Gather + bluff-call. Reveals any pending Ambush at that region (cancels both); otherwise small safe yield                                | ù         |


### 4.3 Resources and regions

Five resources, five regions:


| Region         | Home tribe | Resource |
| -------------- | ---------- | -------- |
| Windy Plains   | Orange     | Timber   |
| High Mountains | Grey       | Ore      |
| Reeky Swamps   | Brown      | Fiber    |
| Vast Desert    | Red        | Relics   |
| The Ruins      | (neutral)  | Scrap    |


- **Home yield:** +2 of home resource at your home region.
- **Away yield:** +1 of target region's resource elsewhere.
- **Ruins Scrap pool is finite** (5 ù player count, so 20 at 4P) and does not regenerate.
- **Stacking modifiers:** +1 from own Shack, +1 from own Den, +1 from own Forge (global), +1 from Trailing Bonus.

### 4.4 Buildings (VP engine)


| Building   | Cost                         | VP  | Effect                                           |
| ---------- | ---------------------------- | --- | ------------------------------------------------ |
| Shack      | 1 home + 1 Scrap             | 1   | +1 Gather yield, home region                     |
| Den        | 1 home + 1 foreign + 1 Scrap | 1   | +1 Gather yield, home region (stacks with Shack) |
| Watchtower | 2 of same + 1 Scrap          | 2   | Immunity to 1 Ambush per round                   |
| Forge      | 3 different + 1 Scrap        | 2   | +1 Gather yield, all regions                     |
| Great Hall | 1T + 1O + 1F + 1Rel + 2S      | 4   | **Triggers match end**                           |


Max 1 of each type per player. Great Hall still requires every home resource type plus Scrap; total cost is lower than v0.6.

### 4.5 Trade Beads

- **Up to +2 Beads per round from trades per player**: the first two trades that award you Beads in a round count; further completed trades in the **same round** still move resources and update partnership lists, but grant **no extra Beads** until the next round.
- **`partners_traded`** still tracks unique partners for tiebreakers only (unaffected by the round cap).
- **Spend 2 Beads for +1 VP**, repeating while you have **2+ Beads** (no once-per-match cap on conversions).
- VP from Beads still rewards active trading, but **per-round Bead income from trades is capped** (v0.7.3: two grants per round) so uncapped trade-spam cannot convert into unbounded same-round bead VP.

### 4.6 Trailing Bonus (comeback)

If the VP gap between 1st and last ? 3 at the end of a round, the last-place player gets, for the next round:

- **+1 Gather yield** (on top of all other modifiers)
- Option to request a **Tribute Route** from any one other player: that player gives the trailer 1 chosen resource per round for 2 rounds. Trailer gains no Beads. Target gains a Bead only if it's their first trade with the trailer (see `RULES.md` ù6.3).

### 4.7 Match end

Match ends on the **first** of these to trigger:

1. A player builds the **Great Hall** ? match ends at end of round
2. A player reaches **8 VP** ? match ends at end of that turn
3. **Round 15** completed ? match ends

Highest VP wins. Ties break on: most buildings ? most unique trade partners ? shared victory.

### 4.8 Turn Flow (30 seconds, on-device)

```
1. SMS/RCS notification arrives
     ?
2. Tap ? HTML5 Canvas loads in mobile browser
     ?
3. See settlement map, stockpile, pending offers, last-round events
     ?
4. (Optional) Tap a trade offer to accept / counter / reject
     ?
5. Choose action: Gather / Build / Ambush / Scout (1 tap) ? Confirm (1 tap)
     ?
6. Resolution animates ? Next tribe receives their text
```

---

## 5. Resources & Economy

### 5.1 Resource list (v0.7.3 prototype)

Five resources total. Four home resources (one per tribe) plus Scrap (shared, finite).


| Resource | Home tribe       | Scarcity driver                                |
| -------- | ---------------- | ---------------------------------------------- |
| Timber   | Orange           | ù                                              |
| Ore      | Grey             | ù                                              |
| Fiber    | Brown            | ù                                              |
| Relics   | Red              | ù                                              |
| Scrap    | (neutral, Ruins) | **Hard pool cap** (20 at 4P, non-regenerating) |


### 5.2 Scarcity design

- Each tribe starts with 2 home resource, 0 of all others. Every other resource must be imported.
- **Every building above Watchtower requires Scrap**, so Scrap scarcity paces the whole tech tree.
- Great Hall requires **one of each** home resource type plus **two Scrap** ? **no tribe can Great-Hall solo**. Must trade with other tribes to assemble the cost.

### 5.3 Rogues (flavor, not mechanics)

In v0.7 "Rogues" are purely narrative. Each player takes **exactly 1 action per turn**; the Rogue language ("send a Rogue to scavenge") is preserved for SMS flavor and world-building but has no mechanical cost, cap, or death-spiral risk. This removes a tracking burden and eliminates a failure mode surfaced in simulation (player lockout via building binds).

---

## 6. Messaging Integration (The Thread)

### 6.1 Principle

The SMS/RCS thread **is** the game log. It is not a notification feed ù it is the canonical record of the match.

### 6.2 Message Types


| Message       | Example                                                                      |
| ------------- | ---------------------------------------------------------------------------- |
| Turn notice   | *"Your turn ù Red Foxiz. Brown has offered a trade."*                        |
| Action result | *"Grey Foxiz scavenged 3 Ore from the Mountain Ruins"*                       |
| Trade offer   | *"Grey Foxiz offer your tribe: 2 Ore ? 1 Relic ù Accept / Counter / Reject"* |
| Raid alert    | *"Tricoloured Foxiz raided your scrap pile! Watchtower held."*               |
| Standings     | *"Standings: Red (42) ù Grey (38) ù Brown (34) ù Tricolour (31)"*            |
| Match end     | *"The Barren Lands bow to the Red Foxiz."*                                   |


### 6.3 Viral Onboarding

- Starting a new match = texting a friend's phone number
- Invitee receives a single opt-in text with a tribe slot pre-assigned
- Zero-friction: no app install, no account creation required before first action
- **Every match seeds new acquisition at zero marginal cost**

---

## 7. Technical Architecture

### 7.1 Stack

- **Client:** HTML5 Canvas (lightweight, instant mobile load)
- **Rendering:** 2D canvas, pixel-art aesthetic consistent with Outmine / World of Rogues
- **Backend:** Stateless turn resolver + persistent match store
- **Messaging:** Jest SMS/RCS API integration for turn events and trade offers
- **Auth:** Phone number as primary identity; session tokens per match link

### 7.2 Performance Targets


| Metric                 | Target                          |
| ---------------------- | ------------------------------- |
| Cold page load on 4G   | < 2s                            |
| Turn action round-trip | < 500ms                         |
| JS bundle (initial)    | < 300KB gzipped                 |
| Canvas frame budget    | 60fps on mid-range 2022 Android |


### 7.3 Key Systems

- **Match State Machine:** Deterministic turn resolver to allow replays and dispute handling
- **Trade Ledger:** Append-only record of all offers and resolutions
- **Notification Router:** Batches and schedules SMS/RCS messages to respect carrier throttling
- **Anti-grief:** Turn timers (e.g., 12h auto-skip), rage-quit penalties, host controls

---

## 8. UX & Interface

### 8.1 Screens

1. **Settlement View** (home) ù Map, stockpile, last-turn summary, action buttons
2. **Action Select** ù 4 buttons (Scavenge / Build / Trade / Raid), each expands to 2ù3 sub-options
3. **Trade Composer** ù Pick resources to offer, pick resources wanted, pick recipient tribe
4. **Raid Target** ù Choose rival tribe, see estimated success odds
5. **Match Thread** ù In-game mirror of the SMS log for players who prefer app context
6. **Standings** ù Score breakdown across all tribes

### 8.2 UX Principles

- **Two taps max** to complete any turn
- **Zero typing** required for core gameplay (trade offers use preset increments)
- **Color-coded tribes** consistent across map, messages, and standings
- **Glanceable state** ù every screen answers "what just happened" in <1 second

---

## 9. Monetization

### 9.1 Model

**Free-to-play, cosmetic + season pass.** Core gameplay is never gated. All IAP is identity, style, or convenience ù **no pay-to-win**.

### 9.2 Item Catalog


| Item Type             | Description                                            | Price       |
| --------------------- | ------------------------------------------------------ | ----------- |
| **Fox Skins**         | Rare tribe variants ù Pink, Blue, Cheetah Foxiz        | $1.99ù$4.99 |
| **Settlement Themes** | Visual overhauls ù Dim Cave, Bamboo Maze, Arctic       | $2.99ù$4.99 |
| **Emote Packs**       | Quirky fox reactions ù taunt, howl, beg, celebrate     | $0.99       |
| **Rogue Pass**        | Monthly: exclusive skins, new regions, bonus cosmetics | $4.99/mo    |
| **Quick Match**       | Skip the queue ù instant matchmaking                   | $0.49       |


### 9.3 Economy Safeguards

- No resource packs, no Rogue packs, no build accelerators
- Emotes have a per-turn rate limit to prevent spam griefing
- Rogue Pass grants cosmetics and **access** (new regions) but no gameplay advantage

---

## 10. Jest Criteria Alignment


| Criterion                 | How Rogue Rivals Delivers                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Mobile Web Readiness**  | HTML5 Canvas; Rogues Studio ships browser-native games (Outmine: web + Telegram, 100K+ players, 21M+ games) |
| **Messaging Fit**         | SMS thread IS the game loop; every core event is a native message                                           |
| **Growth Capability**     | 1.4M+ downloads across prior titles; communities on Discord, Telegram, X, YouTube; tournament experience    |
| **Monetization Strength** | Proven IAP economy from Outmine pets/items extends naturally to tribe cosmetics                             |
| **Collaborative Mindset** | Ships weekly tournaments; comfortable with shared Slack, dashboards, and tight feedback loops               |
| **Strategic Fit**         | Fills Jest's multiplayer strategy gap; established IP with cross-promo from Outmine & World of Rogues       |


---

## 11. Development Roadmap

### Phase 1 ù Prototype (Weeks 1ù6)

- Core turn loop (Scavenge, Build, Trade, Raid)
- 2-tribe vertical slice (Orange vs Grey)
- SMS turn notifications + trade offers
- 1 settlement map, placeholder art
- Manual matchmaking via phone number invite
- **Deliverable:** Playable 2-player match end-to-end

### Phase 2 ù Alpha (Weeks 7ù12)

- All 6 tribes playable
- Raid & fortification system
- Full resource economy (10 resources)
- Standings, match-end scoring
- Basic cosmetics framework

### Phase 3 ù Beta (Weeks 13ù20)

- 3-4 player matches
- RCS rich media messages (inline trade buttons, score cards)
- Rogue Pass v1
- Analytics, A/B framework, anti-grief tooling
- Closed beta with Outmine community

### Phase 4 ù Launch & Live Ops

- Public launch on Jest
- Weekly events, seasonal regions
- Tournament mode
- Cross-promotion with Outmine & World of Rogues

---

## 12. Risks & Mitigations


| Risk                                              | Mitigation                                                                 |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| SMS/RCS carrier delivery latency breaks 30s turns | Fallback in-app push; batch non-critical messages                          |
| Player drops mid-match (async game)               | Generous 12h turn timers; auto-skip with partial action; host kick/replace |
| Trade griefing or spam offers                     | Per-turn offer caps; rate-limited emotes; ignore-rival controls            |
| Pay-to-win creep from designers                   | Hard policy: IAP review requires "no mechanical advantage" sign-off        |
| IP consistency with Outmine / World of Rogues     | Shared art & lore bible; weekly cross-studio review                        |
| Viral invites flagged as spam by carriers         | Opt-in double handshake; compliant invite templates                        |


---

## 13. Success Metrics

### Launch (Month 1)

- 10,000+ matches started
- K-factor ? 1.0
- D1 retention ? 45%
- Average match completion rate ? 70%

### Growth (Month 3)

- K-factor ? 1.5
- 8ù12x daily sessions per DAU
- IAP ARPDAU ? industry benchmark for F2P strategy
- Tournament participation ? 15% of MAU

---

## 14. Studio ù Rogues Studio

Founded 2022 by gaming and startup veterans with 10+ years of collaboration.

- **1.4M+** downloads across titles
- **21M+** Outmine games played
- **100K+** active Outmine players
- Portfolio: *Outmine* (dungeon survival, live on web + Telegram), *World of Rogues* (open-world MMO, in development)
- Rich shared universe of fox lore, tribes, and post-apocalyptic world-building

---

## 15. Appendix

### 15.1 Glossary

- **Foxiz** ù A fox tribe member
- **Rogue** ù A tribeless fox; lore basis for viral invites; also the labor unit
- **Barren Lands** ù The post-Collapse continent where matches take place
- **The Great Collapse** ù The cataclysm that ended the prior civilization

### 15.2 Resolved in v0.6 / v0.7

- **Does Trade consume a turn?** No ù free side channel.
- **Do raids steal home stockpile?** No ù reframed as Ambush on regions, targeting gather yields only.
- **Is any resource gated to force trade?** Yes ù Great Hall requires all 4 home resource types (plus Scrap).
- **How to avoid banker runaway?** v0.7.3 keeps a **per-round Bead cap** on trade income (two Beads per round from trades) and strategic agents decline trades that feed near-winners; v0.7.1-style unlimited same-round stacking remains ruled out.
- **How to avoid action-lock on heavy builders?** Buildings no longer bind Rogues; 1 action per turn always.
- **How to avoid attack-the-leader pile-ons?** Ordinal-only standings + Ambush costs 1 Scrap.
- **Can trailing players come back?** Yes ù trailing bonus + Tribute Route at 3+ VP gap.

### 15.3 Still open (stress-test in prototype & further simulation)

- **Scrap pool sizing** ù is 5ù player count correct, or should it scale with round cap?
- **Ambush Scrap cost** ù 1 is enough to deter spam; is it too high to deter attempted bluffs on leaders?
- **Tribute Route asymmetry** ù is "target gives resource, gains nothing material" acceptable or demotivating?
- **3-player dynamics** ù simulations focused on 2P and 4P; 3P has classic kingmaker geometry that needs its own sim pass.
- **Turn cadence in real async play** ù 4P ù 15 rounds = 60 turns; needs real-world timing data.
- **Tribe flavor abilities** ù currently no per-tribe modifiers (pure spatial asymmetry); add in v1.x once balance baseline is confirmed.

---

## 16. Rules Reference & Simulation (v0.7.3)

This GDD is a design-intent document. Two companion specs make the design **executable and testable**:

### 16.1 `RULES.md` ù canonical rule spec

The authoritative, simulation-ready ruleset. Written to be followed by an AI (or human) without ambiguity so that independent simulation runs are comparable. It is the source of truth for any game-rule question ù if the GDD and `RULES.md` disagree, `RULES.md` wins. The GDD will be updated to match at each design revision.

### 16.2 `SIMULATION_SCHEMA.md` ù data format for automated runs

Every simulation run (human or AI) MUST emit its match log in the format specified in `SIMULATION_SCHEMA.md`. This enables:

- Aggregation across hundreds of runs for balance analysis
- Tribe win-rate tracking
- Trade-network analysis (who trades with whom, how often)
- Kingmaker / comeback / runaway-leader detection
- Ambush and Scout efficacy metrics
- Match-length distributions

Design iteration cadence: any rules tweak bumps the `rules_version`; runs from different rules versions are segregated in analysis.

### 16.3 How to run a simulation (for an AI agent)

1. Read `RULES.md` start to finish.
2. Read `SIMULATION_SCHEMA.md` for the required output shape.
3. Pick a seed, a player count (2ù4), and a **player agent** per seat (e.g., `greedy_builder`, `aggressive_raider`, `random`, `human`).
4. Play a full match round-by-round, logging every turn, trade, and ambush as required by the schema.
5. Write the resulting JSON object to a file named `sim_<match_id>.json` in the `simulations/` directory.

Multiple runs can be concatenated as a JSONL file for bulk analysis.

---

*End of document ù v0.7.3 Draft*