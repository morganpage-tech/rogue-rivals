# ROGUE RIVALS — Simulation-Ready Ruleset v2.0

**Version:** 2.0 (Draft, async engine)
**Companion:** GDD_v2.md §§1–12
**Supersedes:** RULES.md (v0.8)
**Audience:** engine implementers (human or AI), agent authors, simulation runners.

This document is a *specification*. Every number here is a working commitment; a human or AI reading this document should be able to implement the engine and run a valid match without reference to any other source except the companion GDD.

---

## 0. Revision Notes

- **v2.0 (2026-04-18):** Full async-pivot ruleset. Tick-based simultaneous resolution, fog of war, abstract force tiers, structured diplomacy. See `docs/legacy/RULES_v0.8.md` for the synchronous-turn predecessor when archived.

---

## 1. Determinism Contract

1. All in-match randomness comes from a single seeded PRNG (`mulberry32(seed)`).
2. **Map generation** consumes PRNG draws at match init.
3. **Tick resolution is deterministic.** It makes no PRNG draws. Given the same `GameState` and the same set of `OrderPacket`s from every player, the resulting state is byte-identical.
4. All tie-breaks during resolution use **deterministic rules** over player identifiers, region identifiers, and insertion order, never the PRNG.
5. Implementations must emit a per-tick `state_hash` and a per-match `final_hash`. Two implementations conform if, on identical seed + identical packet sequences, they produce identical hashes at every tick.

---

## 2. Match Configuration

A match is specified by a `MatchConfig`:

```json
{
  "seed": 2026001,
  "rules_version": "v2.0",
  "tribes": ["orange", "grey", "brown", "red"],
  "map_preset": "procedural",
  "region_count": 20,
  "tick_limit": 60,
  "victory_sustain_ticks": 3,
  "nap_default_length": 8,
  "shared_vision_default_length": 5,
  "caravan_travel_ticks": 2
}
```

Default `MatchConfig`:


| Field                          | Default                    |
| ------------------------------ | -------------------------- |
| `region_count`                 | 20 (range 15–25)           |
| `tick_limit`                   | 60                         |
| `victory_sustain_ticks`        | 3                          |
| `nap_default_length`           | 8                          |
| `shared_vision_default_length` | 5                          |
| `caravan_travel_ticks`         | 2                          |
| `map_preset`                   | `"procedural"` (uses seed) |


Canonical test seeds: `2026_alpha`, `2026_bravo`, `2026_charlie`, `2026_delta` (hash to fixed integers in implementation).

---

## 3. Core Types

Types are specified as JSON schemas. Implementations may use native structs, but the wire-level (JSON) representation is authoritative for LLM prompts and trace files.

### 3.1 `GameState`

```json
{
  "tick": 0,
  "rules_version": "v2.0",
  "seed": 2026001,
  "tribes_alive": ["orange", "grey", "brown", "red"],
  "regions": { "<region_id>": Region, ... },
  "trails": [ Trail, ... ],
  "forces": { "<force_id>": Force, ... },
  "scouts": { "<scout_id>": Scout, ... },
  "caravans": { "<caravan_id>": Caravan, ... },
  "players": { "<tribe>": PlayerState, ... },
  "pacts": [ Pact, ... ],
  "announcements": [ Announcement, ... ],
  "victory_counters": { "<tribe>": { "<condition>": int, ... }, ... },
  "winner": null | "<tribe>" | ["<tribe>", ...]
}
```

### 3.2 `Region`

```json
{
  "id": "r_03",
  "type": "plains | mountains | swamps | desert | ruins | forest | river_crossing",
  "owner": null | "<tribe>",
  "structures": ["granary" | "fort" | "road" | "watchtower" | "shrine" | "forge", ...],
  "road_targets": { "<structure_index>": "<adjacent_region_id>" },
  "garrison_force_id": null | "<force_id>"
}
```

A region's `structures` list has length 0–2. If a `road` structure is present, its target adjacent region is recorded in `road_targets` keyed by its index in `structures`.

### 3.3 `Trail`

```json
{
  "a": "<region_id>",
  "b": "<region_id>",
  "base_length_ticks": 2
}
```

Effective trail length for a specific traversal is computed at move-order resolution time — see §6.1.

### 3.4 `Force`

```json
{
  "id": "f_orange_01",
  "owner": "orange",
  "tier": 1 | 2 | 3 | 4,
  "location": {
    "kind": "garrison",
    "region_id": "r_05"
  } | {
    "kind": "transit",
    "trail_index": 7,
    "direction_from": "r_05",
    "direction_to": "r_06",
    "ticks_remaining": 2
  }
}
```

### 3.5 `Scout`

```json
{
  "id": "s_grey_04",
  "owner": "grey",
  "target_region_id": "r_11",
  "location": {
    "kind": "transit",
    "trail_index": 3,
    "direction_from": "r_02",
    "direction_to": "r_11",
    "ticks_remaining": 2
  } | {
    "kind": "arrived",
    "region_id": "r_11",
    "expires_tick": 14
  }
}
```

### 3.6 `Caravan`

```json
{
  "id": "c_brown_02",
  "owner": "brown",
  "recipient": "red",
  "amount_influence": 20,
  "path": ["r_08", "r_09", "r_10"],
  "current_index": 1,
  "ticks_to_next_region": 1
}
```

### 3.7 `PlayerState`

```json
{
  "tribe": "orange",
  "influence": 12,
  "reputation_penalty_expires_tick": 9,
  "inbox": [ InboxMessage, ... ],
  "outstanding_proposals": [ Proposal, ... ]
}
```

### 3.8 `Pact`

```json
{
  "kind": "nap" | "shared_vision",
  "parties": ["orange", "grey"],
  "formed_tick": 4,
  "expires_tick": 12
}
```

Wars are represented as the **absence** of a pact and the presence of a `"war"` entry:

```json
{
  "kind": "war",
  "parties": ["orange", "grey"],
  "declared_tick": 14
}
```

### 3.9 `Announcement`

```json
{
  "tick": 6,
  "kind": "pact_formed" | "pact_broken" | "war_declared" | "tribe_eliminated" | "victory",
  "parties": ["orange", "grey"],
  "detail": "optional string"
}
```

### 3.10 `OrderPacket`

```json
{
  "tribe": "orange",
  "tick": 6,
  "orders": [
    { "kind": "move", "force_id": "f_orange_01", "destination_region_id": "r_11" },
    { "kind": "recruit", "region_id": "r_02", "tier": 2 },
    { "kind": "build", "region_id": "r_05", "structure": "fort" },
    { "kind": "scout", "from_region_id": "r_02", "target_region_id": "r_11" },
    { "kind": "propose", "proposal": Proposal },
    { "kind": "respond", "proposal_id": "p_041", "response": "accept" | "decline" },
    { "kind": "message", "to": "grey", "text": "We honor our pact through the winter." }
  ]
}
```

### 3.11 `Proposal`

```json
{
  "id": "p_041",
  "kind": "nap" | "trade_offer" | "shared_vision" | "declare_war" | "break_pact",
  "from": "orange",
  "to": "grey",
  "length_ticks": 8,
  "amount_influence": 0,
  "expires_tick": 7
}
```

For `trade_offer`, `amount_influence` is the Influence the sender will dispatch on acceptance. For `nap` and `shared_vision`, `length_ticks` is the pact duration. `declare_war` and `break_pact` ignore the length/amount fields.

### 3.12 `ProjectedView`

What a player receives at end of every tick. Fog-of-war applied.

```json
{
  "tick": 7,
  "for_tribe": "orange",
  "visible_regions": { "<region_id>": Region, ... },
  "visible_forces": [ VisibleForce, ... ],
  "visible_transits": [ VisibleTransit, ... ],
  "my_player_state": PlayerState,
  "my_forces": [ Force, ... ],
  "my_scouts": [ Scout, ... ],
  "my_caravans": [ Caravan, ... ],
  "inbox": [ InboxMessage, ... ],
  "announcements_since_last_tick": [ Announcement, ... ],
  "pacts_involving_me": [ Pact, ... ],
  "tribes_alive": ["orange", "grey", ...]
}
```

### 3.13 `VisibleForce`

An *observed* force — precise tier obscured:

```json
{
  "region_id": "r_09",
  "owner": "grey",
  "fuzzy_tier": "raiding_party" | "warband" | "large_host" | "massive_army"
}
```

### 3.14 `VisibleTransit`

```json
{
  "trail_index": 7,
  "observed_in_region_id": "r_08",
  "owner": "orange",
  "fuzzy_tier": "warband",
  "direction_from": "r_05",
  "direction_to": "r_06"
}
```

---

## 4. Constants

All numbers below are normative. Implementations that disagree are not conformant.

### 4.1 Influence production (per tick, per owned region)


| Region type    | Base production |
| -------------- | --------------- |
| plains         | 2               |
| mountains      | 2               |
| swamps         | 1               |
| desert         | 1               |
| ruins          | 3               |
| forest         | 1               |
| river_crossing | 2               |


Structure bonuses (cumulative, applied on top of base):

- `granary`: +1
- `shrine`: +1

### 4.2 Force recruit costs (Influence)


| Tier            | Cost | Travel penalty (ticks added to every trail) | Special                               |
| --------------- | ---- | ------------------------------------------- | ------------------------------------- |
| I (skirmishers) | 2    | 0                                           | —                                     |
| II (warband)    | 5    | 0                                           | —                                     |
| III (host)      | 12   | +1                                          | —                                     |
| IV (massive)    | 30   | +2                                          | Requires `forge` in recruiting region |


A tribe may hold at most **one force per owned region** (garrison limit). Recruiting into a region that already has a garrison fails silently (Influence refunded; engine logs `recruit_failed_garrison_present` event).

### 4.3 Structure build costs (Influence)


| Structure  | Cost | Max per region |
| ---------- | ---- | -------------- |
| granary    | 8    | 1              |
| fort       | 10   | 1              |
| road       | 6    | 1              |
| watchtower | 6    | 1              |
| shrine     | 12   | 1              |
| forge      | 15   | 1              |


A region holds at most **2 structures**. Attempting to build a 3rd fails silently (Influence refunded).

### 4.4 Trail lengths (base, in ticks)

Base length by terrain pair (symmetric):


| Pair                    | Length |
| ----------------------- | ------ |
| plains–plains           | 1      |
| plains–river_crossing   | 1      |
| plains–anything_else    | 2      |
| mountains–mountains     | 3      |
| mountains–anything_else | 2      |
| swamps–swamps           | 3      |
| swamps–anything_else    | 2      |
| ruins–anything          | 2      |
| forest–anything         | 2      |
| desert–desert           | 2      |
| desert–anything_else    | 2      |


Road modifier: if a `road` structure in region A targets region B, the trail A↔B length is `max(1, floor(base_length / 2))`.

### 4.5 Force tier combat modifiers

Effective combat tier = base tier + modifiers:

- **+1** — defender is in a region they own
- **+1** — defender benefits from a `fort` in the contested region
- **+1** — for each adjacent region owned by a Shared-Vision partner that holds a Tier ≥ II garrison (cap +2 total from reinforcements)
- **−1** — attacker was revealed by a successful scout that *arrived in the same tick* as the attacker

### 4.6 Scouts

- **Cost:** 3 Influence.
- **Travel:** same as Tier I force (trail base length, no penalty).
- **Dwell:** scout persists in target region for 1 tick after arrival, revealing the target and all regions adjacent to it, then expires.
- **Combat:** scouts have no combat tier; they cannot fight and cannot be attacked. They occupy no garrison slot. Observers see scouts as `"a scout"` (always revealed if seen).

### 4.7 Caravans

- **Travel time:** `caravan_travel_ticks` ticks (default 2). Independent of map distance — this is a deliberate simplification for LLM tractability.
- **Path:** engine computes shortest path from sender's nearest owned region to recipient's nearest owned region at time of dispatch. Path is frozen.
- **Interception:** if at any tick during transit the caravan's current region is occupied by a hostile force of Tier II or higher, the caravan is intercepted. Its `amount_influence` is awarded to the interceptor. An `announcement` of kind `caravan_intercepted` is emitted publicly.
- **Cancellation:** if the recipient `decline`s the originating proposal while the caravan is in flight, the caravan is cancelled; sender refunded 50% (floor).

### 4.8 Reputation

When a tribe breaks a pact (fires a `break_pact` proposal or dispatches a `move` order into a region owned by an NAP partner):

- If broken within the first 3 ticks of the pact: set `reputation_penalty_expires_tick` = `current_tick + 4`.
- If broken after 3 ticks but before expiry: set `reputation_penalty_expires_tick` = `current_tick + 2`.
- If the pact had already expired or was never formed, no penalty.

While penalized, all outgoing `propose` orders are tagged `reputation_penalty = true` in the recipient's inbox. The engine applies no mechanical penalty beyond this tag — the penalty is social pressure, read by LLM personas and shown in the UI for humans.

### 4.9 Starting conditions (per tribe)


| Tribe  | Home terrain | Starting bonus                                                                  |
| ------ | ------------ | ------------------------------------------------------------------------------- |
| orange | plains       | +1 Influence/tick on all owned plains regions, permanently                      |
| grey   | mountains    | home region starts with one pre-built `fort`                                    |
| brown  | swamps       | home region starts with one pre-built `road` targeting a random adjacent region |
| red    | desert       | start with 5 bonus Influence in the bank                                        |


All tribes start with:

- 2 owned regions (home + one adjacent)
- 1 Tier II force garrisoning their home region
- 0 Tier I, III, IV forces
- 5 Influence in the bank (Red starts with 10 per above)

5–8 player configurations use additional tribes specified in a future appendix (out of scope for v2.0 draft).

---

## 5. Tick Resolution Algorithm

A tick proceeds in exactly this sequence. All steps are deterministic.

```
function resolve_tick(state, packets_by_tribe):
  # 5.1 - Immediate orders (no travel time)
  for each tribe in stable tribe order (alphabetical):
    packet = packets_by_tribe[tribe]
    for each order in packet.orders in submitted order:
      if order.kind == "build":    apply_build(state, tribe, order)
      elif order.kind == "recruit": apply_recruit(state, tribe, order)
      elif order.kind == "respond": apply_response(state, tribe, order)
      elif order.kind == "propose": apply_proposal(state, tribe, order)
      elif order.kind == "message": apply_message(state, tribe, order)

  # 5.2 - Dispatch orders (adds to in-transit state)
  for each tribe in stable tribe order:
    packet = packets_by_tribe[tribe]
    for each order in packet.orders in submitted order:
      if order.kind == "move":   apply_dispatch_move(state, tribe, order)
      elif order.kind == "scout": apply_dispatch_scout(state, tribe, order)

  # 5.3 - Advance transits
  for each force f in state.forces:
    if f.location.kind == "transit":
      f.location.ticks_remaining -= 1
  for each scout s in state.scouts:
    if s.location.kind == "transit":
      s.location.ticks_remaining -= 1
  for each caravan c in state.caravans:
    c.ticks_to_next_region -= 1
    if c.ticks_to_next_region == 0 and c.current_index < len(c.path) - 1:
      c.current_index += 1
      c.ticks_to_next_region = trail_length_at(c.path, c.current_index)

  # 5.4 - Resolve arrivals
  for each force f with location.kind == "transit" and ticks_remaining == 0:
    f.location = { kind: "garrison", region_id: destination }
  for each scout s with location.kind == "transit" and ticks_remaining == 0:
    s.location = { kind: "arrived", region_id: target, expires_tick: state.tick + 2 }
  for each caravan c where c.current_index == len(c.path) - 1 and c.ticks_to_next_region == 0:
    deliver_caravan(state, c)    # transfers influence or intercepts if hostile force is present

  # 5.5 - Resolve combats
  for each region r in stable region order:
    forces_here = [f for f in state.forces if f.location.kind == "garrison" and f.location.region_id == r.id]
    if distinct_owners(forces_here) >= 2:
      resolve_combat(state, r, forces_here)    # see Section 7

  # 5.6 - Apply pact expiries and war flags
  for each pact p where p.expires_tick <= state.tick: remove p
  purge expired reputation penalties

  # 5.7 - Influence production
  for each tribe t:
    for each region r owned by t:
      t.influence += production(r)

  # 5.8 - Scout expiry
  for each scout s where s.location.kind == "arrived" and s.location.expires_tick <= state.tick:
    remove s

  # 5.9 - Announcements flushed at end-of-tick boundary
  state.tick += 1

  # 5.10 - Victory check (see Section 8)
  check_victory(state)

  return state
```

Edge notes:

- **Intra-tribe order ordering.** Within a single tribe's packet, orders are applied in the order the tribe submitted them. A tribe may `build` then `recruit` in the same tick and both succeed if Influence permits.
- **Cross-tribe order ordering.** Between tribes, orders are applied in stable alphabetical tribe order within each sub-phase (5.1, 5.2, etc.). This determinism is what makes replays exact.
- **Garrison collision on dispatch.** If a tribe dispatches a force from region A while a pending `recruit` in the same packet would fill A's garrison, the dispatch happens first (garrison empty), then the recruit fills it.
- **Invalid orders** (e.g., move a force you don't own, recruit without Influence) fail silently and emit a trace event. No exception is thrown.

---

## 6. Movement

### 6.1 Dispatching a move

When tribe T submits `move { force_id, destination_region_id }`:

1. Validate: `force_id` is a force T owns AND `location.kind == "garrison"`.
2. Let `from = f.location.region_id`. Find the trail connecting `from` and `destination`. If no direct trail, **fail silently** (LLMs/humans must only move to adjacent regions; multi-hop movement is a sequence of single-hop orders across ticks).
3. Compute effective trail length: `base_length + force.tier_travel_penalty`.
4. Set `f.location = { kind: "transit", trail_index: <index>, direction_from: from, direction_to: destination, ticks_remaining: effective_length }`.
5. Clear the origin region's `garrison_force_id` (the force is no longer garrisoning it).

### 6.2 NAP enforcement on dispatch

If a `move` targets a region owned by an NAP partner:

- The move is **permitted** (NAPs don't lock movement at the engine level), but:
- Breaks the NAP immediately. Emit `pact_broken` announcement. Apply reputation penalty per §4.8.

This is intentional: a tribe can always *choose* to break a pact. The game records that they did.

### 6.3 Transit visibility

A transit is visible to an observer tribe O if and only if **any** of `direction_from` or `direction_to` regions is within O's fog-of-war visibility at the moment of the projection (see §9).

---

## 7. Combat Resolution

When ≥ 2 distinct tribes have forces in a region r after §5.4:

1. Identify the **defender** D: the region's owner, if that owner has a force present.
2. Identify **attackers**: all other owners with forces in r. If multiple, process attackers in alphabetical tribe order. (Attackers do not coalesce.)
3. For each attacker A in order:
  - Compute D's **effective tier** = `D.force.tier + own_region_bonus(+1) + fort_bonus(+1 if fort) + reinforcement_bonus(up to +2)`.
  - Compute A's **effective tier** = `A.force.tier + scout_reveal_penalty(-1 if applicable)`.
  - If `A_eff > D_eff`: A wins. `D.force.tier -= 1`. If D's tier < 1: D.force is destroyed, A now garrisons r, region ownership changes to A's tribe. If D's tier >= 1: D retreats to an adjacent friendly region with available garrison slot, chosen alphabetically; if none, D is destroyed. A's force tier unchanged.
  - If `A_eff < D_eff`: D wins. `A.force.tier -= 1`. A retreats similarly or is destroyed. D's tier unchanged.
  - If `A_eff == D_eff`: both drop one tier. Both retreat (or destroyed). Region ownership unchanged.
4. If the defender is eliminated and there are remaining attackers, the next attacker fights the now-unoccupied region (effectively an uncontested occupation: they become the new garrison without combat).

### 7.1 Reinforcement bonus

For each adjacent region r' where:

- `r'.owner` is a tribe with an active `shared_vision` pact with D
- `r'.garrison_force_id` is non-null AND that force has tier ≥ II

D gains +1 effective tier, capped at +2 total from reinforcement.

This is computed at combat-resolution time, not at packet-submission time.

### 7.2 Region ownership transfer

Ownership transfers when a non-owner garrisons a region after combat. Structures **remain in place** under new ownership. Influence production credit at §5.7 goes to the new owner from this tick onward.

---

## 8. Victory Conditions

Checked at the end of §5.10. Conditions evaluated in this order; the first match wins:

1. **Last standing.** Only one tribe has any owned regions. That tribe wins immediately.
2. **Cultural ascendancy.** A tribe owns ≥ 4 `shrine` structures. Wins immediately (no sustain).
3. **Diplomatic hegemony.** A tribe has active NAPs with every other tribe in `tribes_alive` AND holds a plurality of regions (strictly more than any other tribe). Sustained `victory_sustain_ticks` (default 3) ticks.
4. **Economic supremacy.** A tribe's regions produce ≥ 50% of total current Influence/tick production. Sustained `victory_sustain_ticks` ticks.
5. **Territorial dominance.** A tribe owns ≥ 60% of all regions. Sustained `victory_sustain_ticks` ticks.
6. **Tick limit.** At `tick == tick_limit`, compute weighted score for each tribe:
  ```
   score = 0.40 × (regions_owned / total_regions)
         + 0.30 × (influence_share)
         + 0.20 × (shrines_owned / 4)
         + 0.10 × (active_naps / max(1, tribes_alive - 1))
  ```
   Highest score wins. Ties are shared victories (all tied tribes listed in `state.winner` as array).

### 8.1 Sustain counters

For each *sustained* condition, each tribe has a counter in `state.victory_counters`. If the condition holds at end of tick N, increment; if it doesn't, reset to 0. Trigger victory when counter hits `victory_sustain_ticks`.

### 8.2 Simultaneous victory

If multiple tribes satisfy different conditions at the same tick, the condition higher in the list wins. If multiple tribes satisfy the *same* condition at the same tick (possible only for 6/tick-limit), it's a shared victory.

---

## 9. Fog of War Projection

After each tick's §5.10, the engine computes for every living tribe a `ProjectedView`.

### 9.1 Visible regions

For tribe T, the set of visible region IDs is the union of:

- Every region T owns.
- Every region adjacent (one trail hop) to a region T owns.
- Every region adjacent (one or two trail hops) to a region T owns **AND** has a `watchtower` structure.
- Every region where T has a scout in `location.kind == "arrived"` state, plus every region adjacent to that one.
- Every region visible to any tribe P where T has an active `shared_vision` pact with P (recursively applied: T sees what P sees directly, not what P sees through their own shared visions).

### 9.2 Visible forces

For each garrison force F in a visible region:

- If `F.owner == T`: T sees F with full precision (tier visible).
- Otherwise: T sees a `VisibleForce` with fuzzy tier (§3.13 mapping).

### 9.3 Visible transits

For each transit in `state.forces | state.scouts`:

- If owner == T: precise.
- Otherwise: T sees it only if either its `direction_from` or `direction_to` region is in T's visible region set. Fuzzy tier rendering applies.

Scouts are always revealed as `"a scout"` when visible — their tier is not fuzzed.

### 9.4 Caravans

Caravans in transit are **not visible** to any tribe other than their owner and recipient. (They are diplomatic instruments, not military.) Interception is still mechanically possible because it's driven by whether a hostile force happens to occupy the caravan's current path region — not by observation.

### 9.5 Inbox and announcements

- `inbox` contains: structured proposals addressed to T (pending T's response), free-text messages to T, scout reports for scouts T owns that arrived this tick, combat reports for combats T participated in.
- `announcements_since_last_tick` contains all public announcements from this tick.

---

## 10. PRNG Usage Schedule

(Informational — confirms determinism contract.)

- **Match init:**
  1. Seed PRNG with `seed`.
  2. Generate map: region placements, terrain assignments, trail topology. Consumes ~N draws where N = region_count × 4.
  3. Randomize tribe home positions: consumes tribes_count draws.
  4. Apply Brown's starting road target (random adjacent): 1 draw.
  5. Finalize PRNG state. **Discard.** No further draws are made at any point during the match.
- **Tick resolution:** zero PRNG draws.

This is a strict requirement. Any implementation that consumes a PRNG draw during tick resolution is non-conformant.

---

## 11. Map Generation

### 11.1 Topology

1. Place `region_count` region-centres on a unit square using seeded Poisson-disc sampling (minimum distance ≈ `1 / sqrt(region_count)`).
2. Connect regions using Delaunay triangulation; prune edges longer than 1.5× median to avoid cross-map shortcuts.
3. Each retained Delaunay edge becomes a `Trail`.
4. Assign region types by a weighted random draw:
  - plains: 0.30, mountains: 0.18, swamps: 0.13, desert: 0.13, ruins: 0.10, forest: 0.10, river_crossing: 0.06.
5. Place tribe homes: one per tribe on a region matching the tribe's home terrain. If no matching region exists (small map edge case), fall back to alphabetical first unclaimed region.
6. Ensure no pair of tribe homes is more than 4 trails apart (shortest-path distance in trail-count, ignoring tick length). If violated, regenerate from step 1 with the next PRNG state until satisfied (max 10 attempts; then relax to 5 trails).

### 11.2 Compute trail base lengths

For each trail, compute `base_length_ticks` per §4.4.

### 11.3 Starting region assignment

Each tribe receives their home region plus one adjacent region (chosen alphabetically by region ID for determinism). Garrison forces placed per §4.9.

---

## 12. Simulation Conformance

A compliant implementation must, on running a match, emit to a `.jsonl` trace file **one event per tick**, structured as:

```json
{
  "tick": 7,
  "state_hash": "sha256:...",
  "orders_by_tribe": { "<tribe>": OrderPacket, ... },
  "resolution_events": [
    { "kind": "build", "tribe": "grey", "region_id": "r_04", "structure": "fort" },
    { "kind": "recruit", "tribe": "orange", "region_id": "r_02", "tier": 2 },
    { "kind": "dispatch_move", "tribe": "orange", "force_id": "f_orange_01", "to": "r_06", "ticks": 3 },
    { "kind": "arrive", "actor": "force_id_or_scout_id", "region_id": "r_11" },
    { "kind": "combat", "region_id": "r_11", "defender": "grey", "attacker": "orange", "result": "defender_wins", "effective_tiers": [4, 3] },
    { "kind": "pact_formed", "parties": ["orange","grey"], "expires_tick": 14 },
    { "kind": "pact_broken", "parties": ["orange","grey"], "breaker": "orange" },
    { "kind": "caravan_intercepted", "caravan_id": "c_brown_02", "interceptor": "red", "amount": 20 },
    { "kind": "victory", "tribe": "grey", "condition": "territorial_dominance" }
  ],
  "projected_views": { "<tribe>": ProjectedView, ... }
}
```

Additionally, at match end, emit a single `match_summary` record with `final_hash`, `winner`, `tick_final`, and `tribes_alive_at_end`.

---

## 13. Sample Worked Tick

Given:

- `state.tick` = 6 (about to resolve to 7)
- Orange force `f_orange_01` (Tier III host) currently in region `r_02` (Orange home, plains).
- Grey garrison `f_grey_01` (Tier II warband) in region `r_07` (Grey home, mountains, has pre-built `fort`).
- Active NAP between orange and grey, expires tick 12.
- Trail `r_02 ↔ r_07` base length 2 (plains-mountains).

Packets for tick 6→7:

- **Orange:** `[{ kind: "move", force_id: "f_orange_01", destination_region_id: "r_07" }]`
- **Grey:** `[{ kind: "scout", from_region_id: "r_07", target_region_id: "r_02" }]`
- **Brown:** `[{ kind: "build", region_id: "r_12", structure: "granary" }]`
- **Red:** `[{ kind: "message", to: "grey", text: "Suspicious silence from Plains?" }]`

Resolution:

- **5.1**: Brown builds Granary in r_12 (cost 8 Influence). Red's message enqueued to grey's inbox.
- **5.2**: Orange dispatches `f_orange_01` into transit, trail r_02↔r_07, ticks_remaining = 2 + 1 (Tier III penalty) = 3. Orange's NAP with Grey is broken on dispatch into NAP partner's region. Announce `pact_broken { parties: [orange, grey], breaker: orange }`. Orange's reputation_penalty_expires_tick = 6 + 4 = 10.
- **5.2**: Grey dispatches scout, target r_02, ticks_remaining = 2.
- **5.3**: All existing transits decrement (there are none prior to this tick for this example).
- **5.4**: No arrivals yet.
- **5.5**: No combats.
- **5.6**: No pact expiries.
- **5.7**: Influence credited. Orange: +2 from r_02 (plains) × 2 = +4 (owns 2 plains regions). Grey: +2 (mountains) × 2 = +4. Etc.
- **5.8**: No expiring scouts.
- **5.9**: Announcements list: `[{ tick: 7, kind: "pact_broken", parties: [orange, grey], breaker: orange }]`
- **5.10**: `state.tick = 7`.

Projections (abbreviated):

- **Grey's ProjectedView**: can see r_07 (own) + adjacent. Sees a transit on trail r_02↔r_07 with `direction_from: r_02, direction_to: r_07, owner: orange, fuzzy_tier: "large_host"`. Grey's inbox: new message from Red + pact-broken announcement.
- **Orange's ProjectedView**: can see r_02 + adjacent. Does not see Grey's scout (it's currently in transit from r_07 side; neither endpoint region is orange-visible unless r_07 is adjacent to an orange region, which in this example it is — orange sees the scout-transit too).
- **Brown's and Red's ProjectedView**: get the pact_broken announcement. Their own local state updates.

Tick 8 and onward proceed similarly. Grey's scout arrives at r_02 on tick 8; the transiting host is revealed with `scout_revealed_ambush = true`. On tick 9 the host arrives at r_07 and combat resolves — Orange Tier III vs. Grey Tier II + defender-in-own(+1) + fort(+1) = 3 vs. 4; Grey wins; Orange's host drops to Tier II and retreats to an adjacent Orange-owned region.

---

## 14. Open Items for v2.1

These are acknowledged incomplete and scheduled for a v2.1 revision after the first playable batch:

- 5–8 player tribe definitions (currently 4 canonical only).
- Recruitment delay ticks: currently zero — a recruited force is available the same tick. Consider adding a 1-tick delay for higher tiers.
- Pact-breaker reputation mechanics: currently tag-only (no mechanical penalty). Consider adding a proposal-rejection probability for LLM personas.
- Caravan path recomputation: currently frozen at dispatch. Consider recomputing if path regions change ownership mid-flight.
- Ruins relics: GDD mentions Red starts with a relic (counts ½ Shrine). The mechanics of picking up relics from ruins regions is not yet specified — currently Red's bonus is Influence-only.
- Forge as Tier IV gate: clarify whether Tier IV can *move through* regions without a forge (current spec: yes, the forge is only a recruitment gate, not a maintenance gate).

---

## 15. Conformance Checklist

An implementation is v2.0-conformant if it passes all of:

- Seeded-replay test: run the same seed + same packet sequence twice; all per-tick `state_hash` values match.
- Zero-RNG-during-tick test: assert PRNG state is unchanged across any tick resolution.
- Fog-of-war non-leak test: assert no `ProjectedView` contains state outside the per-tribe visibility rules of §9.
- Victory check ordering test: construct synthetic states where multiple conditions trigger simultaneously; verify higher-priority condition wins per §8.
- Combat modifier test: synthetic tier-3 attacker vs. tier-2 defender in own region + fort + one adjacent shared-vision ally with tier II = 3 vs 5; defender wins; attacker retreats or destroyed per §7.
- Caravan interception test: hostile tier II in caravan path at delivery-tick → caravan diverted to interceptor; `caravan_intercepted` announcement emitted.
- NAP-break reputation test: tribe breaks NAP on tick 5 (NAP formed tick 3, i.e., within 3 ticks of formation); `reputation_penalty_expires_tick` set to 9.

---

*End of RULES_v2.md. JSON schema files and the reference Python oracle simulator follow next.*