# ROGUE RIVALS — Rules (v0.8)

> **Status:** Canonical, simulation-ready ruleset. If this document conflicts with `GDD.md`, this document is authoritative.
>
> **Audience:** Humans, playtest tools, and AI agents running automated simulations.
>
> **Determinism:** These rules are written to be followed deterministically. The only source of randomness is resource ties / tiebreakers (roll dice using a provided `seed`).

## Revision history

- **v0.8 bead-in-transit / trader vulnerability (2026-04-18)** — directly addresses the v0.7.4 open question (`diversified_trader` at 55 % wins because trade beads were immune to ambush pressure). **New canonical rule:** a Trade Bead earned from a completed trade is now *pending* until end-of-round, and the 2-Bead → 1-VP conversion is deferred to the same end-of-round settlement (§3.4). If the earner was the victim of any successful ambush that same round (i.e. at least one `ambush_triggered` event against them that was **not** `watchtower_absorbed`), all of their pending beads are **transferred** to the first such ambusher, who banks them and runs the normal conversion (§3.4.3). Otherwise pending beads flow into `beads` as before and convert. Per-round bead cap (`beads_earned_this_round < 2`) still applies to the earning side. Rationale: the trader-vulnerability A/B (`simulations/trader_vuln/COMPARISON_trader_vuln.md`) tested three variants — `off` (canonical v0.7.4), `deny` (destroy pending beads on hit), and `steal` (transfer to ambusher). `steal` was selected because it (a) creates a new strategic loop — raiders can hunt bead-earners for VP payoff — rather than only nerfing trader, (b) cuts the `diversified_trader` "podium" rate (won OR within 1 VP of the leader) from 15/20 to 9/20 across the canonical 50-match baseline, and (c) lifts `aggressive_raider` avgVP 4.80 → 5.60. The fallback `deny` behaviour and the legacy `off` (v0.7.4) behaviour are both still available via the `RR_BEAD_VULN_MODE` env var in `tools/sim.py` for regression replays and future A/B work, but neither is canonical. `rules_version` bumps to `"v0.8"`. New canonical heuristic baseline: `simulations/batch_v0.8.jsonl` (50 matches). TS engine picks up the same rule via `PlayerState.pendingBeads` + per-round hit bookkeeping (`hitsThisRound` / `hitByThisRound`) wired through `trade.ts`, `actions.ts`, and `endOfRound.ts`; TS replay test retargets the new baseline and the suite adds two unit tests covering the steal path and the watchtower regression (watchtower-absorbed hits do **not** count as "victim" hits for bead theft). **Known limitation, deferred to v0.8.1+:** firing rate is modest (~0.26 beads stolen per 4-player match); the mechanism bites `banker` harder than `diversified_trader` in raw bead-loss terms. A raider heuristic update that specifically hunts bead-earners' home regions, or a 2-round pending window, are the two obvious follow-up experiments if further rebalance is needed.
- **v0.7.4 ambush persistence + raider heuristic (2026-04-18)** ? **ambush actions now remain active for up to 2 end-of-round ticks instead of 1** (§4.3). Motivation: in the v0.7.3.1 baseline, 72 % of ambushes expired before any opponent gathered the targeted region, making the raider archetype structurally underpowered. The raider A/B experiment (`simulations/raider_ab/COMPARISON_raider_ab.md`) tested seven rule variants; persistence was the only lever that lifted raider hit-rate (11.8 % → 22.0 %) without distorting other archetypes' win distributions. Yield multiplier changes and scrap-cost removal were both rejected: multiplier is a cosmetic no-op because yield is not the binding constraint, and free ambush causes every agent with an ambush branch to spam the action, collapsing overall hit-rate and handing `diversified_trader` a 55 % win rate. The heuristic `aggressive_raider` was also rewritten: it now maintains a Scrap reserve sized for `ambush_cost + next_build_scrap_cost`, then delegates to `greedy_gather_action` so stolen loot can flow into higher-tier buildings; and it applies a mild post-hit throttle (0.85× after 1 hit, 0.70× after 2) so the raider spends some turns banking loot between raids rather than re-arming every turn. Raider avgVP lifts 4.13 → 4.80; raider build-mix now includes `forge` and `great_hall` (were absent in v0.7.3.1). New canonical heuristic baseline: `simulations/batch_v0.7.4.jsonl`. `rules_version` bumps to `"v0.7.4"`. TS engine picks up the same persistence rule via the new `PlayerState.ambushRoundsRemaining` TTL and `AMBUSH_PERSIST_ROUNDS = 2` constant in `packages/engine/src/rules.ts`; TS test suite adds two unit tests covering the TTL decrement and triggered-ambush early-clear paths. **Known open question** (deferred to v0.8): `diversified_trader`'s win rate surged 30 % → 55 % with persist=2 because trade beads are structurally immune to ambush pressure.
- **v0.7.3.1 engine patch (2026-04-18)** ? no rule text change; fixes a Watchtower cost implementation bug in `compute_build_cost`. In both `tools/sim.py` and `packages/engine/src/actions.ts` the watchtower cost candidate was written as `{k: 2, S: 1}`. When the loop reached `k = "S"`, the dict-literal duplicate-key rule collapsed the cost to `{S: 1}`, letting any player with just **1 Scrap** (and no other resource in quantity 2) purchase a Watchtower for 1 Scrap, gaining 2 VP off-spec. Across the v0.7.3 50-match baseline this subsidised **43 of 213** Watchtowers (20%), most severely benefiting the trading/bead archetypes. The patch constructs the `k == "S"` case as `{S: 3}` (i.e. 2 + 1 = 3 Scrap) which matches ?4.2 as written. `rules_version` bumps to `"v0.7.3.1"`. The regenerated baseline is `simulations/batch_v0.7.3.1.jsonl`; the TS replay test now pins against that file. Heuristic `aggressive_raider` was also rewritten to build the full ladder (shack/den added); see `tools/sim.py`.
- **v0.7.3 clarifications pass (2026-04-18)** ? no behavior change; surfaced during TS engine port. ?1.4 documents the narrow RNG scope (turn-order shuffle only; gameplay resolution uses no randomness). ?4.2 adds the Forge tie-break rule for choosing among equally-feasible 3-resource bundles. ?7.1 documents the match-end ordering when Great Hall and VP threshold fire on the same turn. `rules_version` remains `"v0.7.3"` ? existing simulation logs are unaffected.
- **v0.7.3** ? Trade Beads: each player earns **at most 2 Beads per round** from completed trades (further trades in the same round still transfer resources and update `partners_traded`, but award **no** extra Bead once the cap is reached). *Rationale:* v0.7.2's **1 Bead/round** cap over-corrected and zeroed **alliance** viability; v0.7.3 relaxes to **2 Beads/round** to preserve the banker nerf while keeping volume-trading strategies alive.
- **v0.7.2** ? Trade Beads: each player earns **at most 1 Bead per round** from completed trades (later trades in the same round still transfer resources and update `partners_traded`, but award **no** extra Bead). *Rationale:* v0.7.1 smart-agent batch showed **banker** snowballing via uncapped per-round bead income; the round cap preserves trading for resources while blunting pure trade-spam VP.
- **v0.7.1** ? Trade Beads: **+1 Bead on every completed trade** (no longer first-new-partner only); conversion spends **2 Beads** per **+1 VP** (repeatable `while` loop, uncapped). *Rationale:* v0.7 uncapped bead-to-VP conversion had little room to operate because bead **earning** was still capped at **num_players ? 1** per match; v0.7.1 makes **trade volume** the bead VP engine while keeping **`partners_traded`** for tiebreakers (?7.2 #2).
- **v0.7** ? Great Hall costs **6** resources (`1T+1O+1F+1Rel+2S`); match ends at **`vp >= 8`**; Trade Beads convert in a **repeatable loop** (spend **3 Beads** per **+1 VP**, no per-match cap).
- **v0.6** ? Prior baseline: Great Hall **10** resources; **`vp >= 10`** threshold; at most **one** Bead-to-VP conversion per player per match (Beads above 3 had no extra effect).

---

## 0. Notation

- Players are identified as `P1`, `P2`, `P3`, `P4`.
- Resources are denoted by single letters in pseudocode: `T` (Timber), `O` (Ore), `F` (Fiber), `Rel` (Relics), `S` (Scrap).
- Player state is always defined as a tuple: `(vp, resources, beads, pending_beads, beads_earned_this_round, partners_traded, buildings, active_ambush_region, hits_this_round, hit_by_this_round, trailing_bonus_active)`.
- `resources = {T: int, O: int, F: int, Rel: int, S: int}`, all non-negative integers.

---

## 1. Setup

### 1.1 Player count

Matches support 2, 3, or 4 players. Each player chooses a unique tribe from:

| Tribe | Home Region | Home Resource |
|---|---|---|
| `orange` | `plains` | `timber` |
| `grey` | `mountains` | `ore` |
| `brown` | `swamps` | `fiber` |
| `red` | `desert` | `relics` |

Tribes not assigned to a player are **absent** from the match ? their home region is still gatherable (away yield only), their home resource is not available as a home yield for anyone.

### 1.2 Initial state (per player)

```
vp                      = 0
resources.T/O/F/Rel/S   = 0, 0, 0, 0, 0
resources[home_resource]= 2
beads                   = 0
pending_beads           = 0   # v0.8: trade-bead-in-transit; settled at end-of-round (§3.4.3)
beads_earned_this_round = 0   # resets end of each round; gates Bead income from trades (§3.4.1)
partners_traded         = [] (empty list)
buildings               = [] (empty list)
active_ambush_region    = null
hits_this_round         = 0   # v0.8: count of non-absorbed ambush hits suffered this round (§3.4.3)
hit_by_this_round       = [] (empty list)  # v0.8: ambusher ids in hit order
trailing_bonus_active   = false
```

### 1.3 Shared state

```
scrap_pool              = 5 * num_players
round                   = 0
turn_order              = a random permutation of player ids (fixed for the match)
match_ended             = false
match_end_trigger       = null
```

### 1.4 Seed

Every match takes an integer `seed`. All pseudorandom events (tiebreakers, agent stochastic decisions if any) derive from this seed. Two runs with the same seed, same agent set, and same turn order MUST produce identical match logs.

**Scope of randomness (clarification).** In the current v0.7.3 ruleset, *gameplay resolution uses no randomness at all*. The seed only feeds (a) the initial turn-order shuffle, if `turn_order` was not supplied explicitly, and (b) any agent-internal stochastic choices. Every rule-enforced outcome ? gather yields, trade resolution, ambush resolution, scouting, end-of-round standings ? is fully deterministic given the current `MatchState` and the next command. Implementations MAY omit a PRNG entirely if `turn_order` is always passed in. This means replay from a command log is exact and does not require reproducing any PRNG state.

---

## 2. Round structure

A round consists of exactly one turn per player, in `turn_order`.

### 2.1 Round sequence

```
for each round in 1..15:
    round += 1
    for each player in turn_order:
        run_turn(player)
        if match_end_check(): break
    end_of_round_resolution()
    update_trailing_bonus()
    if match_end_check(): break
```

### 2.2 `run_turn(player)`

On your turn, resolve in this order:

1. **Refresh state:** Reset `active_ambush_region` from *previous* round is NOT reset here ? ambushes persist through the round they were set in; see ?4.3.
2. **Expire stale offers:** Any trade offer YOU made on your previous turn that is still pending is cancelled now.
3. **Free phase (any order, any number of times):**
   - Propose trade offers (?3)
   - Accept/reject/counter pending offers addressed to you
4. **Action phase (exactly once):** Execute one of:
   - `Gather(region)` (?4.1)
   - `Build(building_type)` (?4.2)
   - `Ambush(region)` (?4.3)
   - `Scout(region)` (?4.4)
   - `Pass` ? no action; allowed but agents should only use it if genuinely no legal action exists.
5. **Log turn:** Write the turn event to the match log (see `SIMULATION_SCHEMA.md`).

---

## 3. Trading

### 3.1 Offer format

```
offer = {
    id: unique_string,
    offerer: player_id,
    recipient: player_id,
    offered:   {T?, O?, F?, Rel?, S?},   # resources offerer will give
    requested: {T?, O?, F?, Rel?, S?},   # resources recipient will give
    created_turn: int,                    # the turn number it was made on
}
```

### 3.2 Offer rules

- An offer is made in the Free Phase. It costs no action.
- There is no limit to the number of pending offers you can have.
- An offer stays pending until one of:
  - Recipient accepts ? resolve (?3.3)
  - Recipient rejects ? remove, no effect
  - Recipient counters ? the counter becomes a new offer (roles flip); original is removed
  - Offerer's next turn begins ? auto-expire
- You MUST have the resources you're offering **at the time of acceptance**, not at the time of offer. If you don't, the acceptance fails silently, offer is cancelled.

### 3.3 Offer resolution

When accepted:
1. Verify offerer has `offered` resources. If not, cancel offer, no effect.
2. Verify recipient has `requested` resources. If not, cancel offer, no effect.
3. Transfer resources: offerer loses `offered`, gains `requested`; recipient loses `requested`, gains `offered`.
4. Apply Bead rule (?3.4) to both parties.
5. Log `trade_resolved` event.

### 3.4 Trade Beads

After resources transfer (§3.3), update `partners_traded` for both parties (unique partner bookkeeping for tiebreakers §7.2 #2 only).

#### 3.4.1 Earn (pending until end-of-round)

Then for each party `X` in the trade:

```
if X.beads_earned_this_round < 2:
    X.pending_beads += 1
    X.beads_earned_this_round += 1
    log bead_earned event
# else: trade still completed; no Bead for X this round
# optionally log bead_capped for visibility
```

Each player may earn at most **2 Beads per round** from trades.

**v0.8:** Beads earned from a trade do **not** enter `X.beads` immediately. They sit in a per-player `pending_beads` accumulator until end-of-round (§3.4.3). **Bead → VP conversion is likewise deferred to end-of-round**; no conversion runs inside `trade_resolved`.

#### 3.4.2 Per-round counter reset

`beads_earned_this_round` resets to **0** for every player at end of each round (step §3.4.3 below), **before** the next round begins.

#### 3.4.3 End-of-round settlement (Beads-in-transit rule; canonical v0.8)

At the end of each round, before any other end-of-round housekeeping, iterate players in `turn_order` and resolve their `pending_beads` as follows:

```
for each player X in turn_order:
    pending = X.pending_beads
    X.pending_beads = 0
    if pending == 0:
        continue
    if X.hits_this_round > 0:
        # X was the victim of at least one ambush_triggered event this round
        # (watchtower_absorbed hits do NOT count here). Pending beads are
        # transferred to the primary ambusher = X.hit_by_this_round[0].
        A = X.hit_by_this_round[0]
        A.beads += pending
        log bead_stolen event {victim: X, ambusher: A, beads: pending}
        # A immediately runs the standard 2-bead -> 1-VP conversion:
        while A.beads >= 2:
            A.beads -= 2
            A.vp += 1
            log bead_converted event
    else:
        # Safe delivery -> bank and convert on X.
        X.beads += pending
        while X.beads >= 2:
            X.beads -= 2
            X.vp += 1
            log bead_converted event

# After settlement, reset per-round hit bookkeeping for every player:
for each player X:
    X.beads_earned_this_round = 0
    X.hits_this_round = 0
    X.hit_by_this_round = []
```

`hits_this_round` increments on every `ambush_triggered` event where the victim is `X` and `watchtower_absorbed == false`. `hit_by_this_round` records the ambuser ids in the order the hits occurred; the first entry is the "primary" ambusher and wins any stolen beads.

Stolen beads bypass the 2/round earn cap on the ambusher's side (they are loot, not trade earnings) — they enter `ambusher.beads` directly. The ambusher's own conversion loop then fires as usual.

> **Rule variants.** Two non-canonical fallbacks exist in `tools/sim.py` under the `RR_BEAD_VULN_MODE` env var for regression / experimentation:
> - `deny`: on-hit, pending beads are destroyed (no transfer, no event beyond `bead_denied`). Produces the same trader nerf as `steal` but without the raider upside.
> - `off`: legacy v0.7.4 behaviour — beads award + convert inside `trade_resolved`, pending_beads is unused. Used only to replay pre-v0.8 batches byte-identically.
> Neither variant is part of the v0.8 rule set; batches run with either must record `RR_BEAD_VULN_MODE` in `run_metadata.notes`.

---

## 4. Actions

### 4.1 `Gather(region)`

**Preconditions:** Region is one of `plains | mountains | swamps | desert | ruins`.

**Resolution:**

```python
base_yield = compute_base_yield(player, region)
yield_amount = base_yield
if player has Shack AND region == player.home_region:   yield_amount += 1
if player has Den   AND region == player.home_region:   yield_amount += 1
if player has Forge:                                    yield_amount += 1
if player.trailing_bonus_active:                        yield_amount += 1

resource_type = region_to_resource(region)  # e.g. plains -> timber

# RUINS SPECIAL:
if region == 'ruins':
    yield_amount = min(yield_amount, scrap_pool)
    scrap_pool -= yield_amount

# AMBUSH CHECK:
for other in players_with_active_ambush_at(region):
    if player has Watchtower AND not used_this_round:
        # Watchtower absorbs 1 ambush per round
        mark Watchtower used this round
        continue  # ambush fails, you gather normally
    # Ambush triggers:
    ambusher = other
    stolen = yield_amount * 2
    ambusher.resources[resource_type] += stolen
    clear ambusher's active_ambush_region
    log ambush_triggered event
    return  # player gets NOTHING, ambush yield is 2? the pre-ambush yield
    # (If multiple ambushes on same region, resolve in turn_order precedence; first applies, rest expire.)

# No ambush intercepted -> yield normally
player.resources[resource_type] += yield_amount
```

**Base yield table:**

| Region | Home player | Away player |
|---|---|---|
| plains / mountains / swamps / desert | 2 of home resource | 1 of that resource |
| ruins | 1 Scrap | 1 Scrap |

### 4.2 `Build(building_type)`

**Preconditions:**
- Building type is one of `shack | den | watchtower | forge | great_hall`.
- Player does not already own this building type.
- Player has the required resources.

**Resolution:** Deduct resources, add building to player's list, apply VP and effect.

#### Building catalog

| Type | Cost (exact) | VP | Effect |
|---|---|---|---|
| `shack` | 1 of home resource + 1 Scrap | 1 | `+1` Gather yield at home region |
| `den` | 1 home + 1 non-home (any 1 of T/O/F/Rel that is not your home) + 1 Scrap | 1 | `+1` Gather yield at home region (stacks with Shack) |
| `watchtower` | 2 of any single resource + 1 Scrap | 2 | Immunity to 1 Ambush per round at any of your Gathers |
| `forge` | 1 each of any 3 different resources (any 3 of T/O/F/Rel/S) + 1 Scrap | 2 | `+1` Gather yield at every region |
| `great_hall` | 1T + 1O + 1F + 1Rel + 2S | 4 | Triggers match end |

Notes:
- `watchtower` resource does NOT need to be home. 2 of any resource works.
- `forge` 3-different requirement is INCLUSIVE of Scrap, then the building itself costs another 1 Scrap on top. In other words: pick 3 different resources from {T,O,F,Rel,S}, pay 1 of each, plus 1 additional Scrap (so if one of the 3 was Scrap, total Scrap cost = 2). Simpler restatement: `forge = pick 3 different resources, pay 1 each, then pay 1 Scrap`.
- **Forge triple tie-break (determinism requirement).** When a player can afford multiple valid 3-resource bundles, the engine MUST choose the lexicographically smallest feasible triple under the canonical resource ordering `(T, O, F, Rel, S)`. Generate candidate triples with nested index loops `i < j < k` over that ordering, filter to those the player can actually pay (accounting for the extra 1 Scrap), then take the first. This matches the reference Python simulator (`tools/sim.py`) and ensures byte-identical replay across implementations.
- `great_hall` cost is exactly as listed (6 resources total: one of each home type plus two Scrap) and does not allow substitutions.

### 4.3 `Ambush(region)`

**Preconditions:**
- Region is one of `plains | mountains | swamps | desert | ruins`.
- Player has `resources.S >= 1`.
- Player has no `active_ambush_region` already set (max 1 pending ambush).

**Resolution:**
1. `player.resources.S -= 1` (paid regardless of outcome).
2. `player.active_ambush_region = region`.
3. Log `ambush_set` event with `hidden: true` ? other players see only a generic "moved in secret" message in the public log.
4. The ambush persists **across up to 2 end-of-round ticks** before expiring (v0.7.4; was 1 in v0.7.3.1):
   - If another player `Gather`s this region at any time while the ambush is active, resolve per ?4.1's ambush check; a triggered ambush clears immediately (the TTL is set to 0 regardless of how many ticks remain).
   - If a player `Scout`s this region while the ambush is active, resolve per ?4.4; the ambush is cleared immediately.
   - Otherwise, at each `end_of_round_resolution()` the ambush's TTL is decremented; the ambush expires (and logs `ambush_expired`) only when the TTL reaches 0. A freshly-set ambush therefore survives the round in which it was set **and** the following round before auto-expiry.
   - An ambusher has at most **one** active ambush at a time, regardless of TTL state; this is unchanged from v0.7.3.1.

### 4.4 `Scout(region)`

**Preconditions:** Region is valid.

**Resolution:**

```python
ambushes_here = players_with_active_ambush_at(region)
if ambushes_here is non-empty:
    # Ambushes revealed. All are cancelled.
    for ambusher in ambushes_here:
        clear ambusher.active_ambush_region
    log ambush_scouted event (PUBLIC)
    # Scout gets NO yield.
else:
    # Safe scout: yields 1 resource of the region type (no modifiers apply).
    resource_type = region_to_resource(region)
    if region == 'ruins':
        take = min(1, scrap_pool)
        scrap_pool -= take
        player.resources.S += take
    else:
        player.resources[resource_type] += 1
```

Note: Scout is strictly weaker than Gather in yield when no ambush is present. Its power is revealing ambushes cheaply.

---

## 5. End of round resolution

After all players have taken their turn in a round, resolve in this order:

1. **Settle pending trade beads** (§3.4.3). For each player with `pending_beads > 0`, either transfer to the primary ambusher (if `hits_this_round > 0`) or bank into the earner's `beads` and run the 2-Bead → 1-VP conversion loop. Emit `bead_stolen` / `bead_converted` events as applicable.
2. Reset per-round bead/hit bookkeeping: `beads_earned_this_round = 0`, `hits_this_round = 0`, `hit_by_this_round = []`, `pending_beads = 0` (already zeroed in step 1).
3. Decrement each `active_ambush_region` TTL by 1 (v0.7.4: ambushes persist for up to 2 end-of-round ticks). Clear the region and emit `ambush_expired` when the TTL reaches 0.
4. Reset Watchtower "used this round" flags.
5. Compute standings (§6.1).
6. Update trailing bonus (§6.2).
7. Increment round counter (if not ending).

> **Why bead settlement runs first.** Pending beads that are stolen become VP on the ambusher's side via `bead_converted`. Because VP threshold (§7.1) is a match-end trigger and this is the last chance in the round to award VP, settlement MUST complete before the round-end `vp_reached` / `round_limit` check. Implementations that invert the order (e.g. reset bookkeeping first) will lose the hit attribution and silently skip all bead transfers for the round.

---

## 6. Standings and trailing bonus

### 6.1 Standings

Standings are computed as ordinal ranks:

```python
sorted_players = sort(players, by=vp, desc=true)
# Handle ties: same VP -> same rank (dense or competition ranking; use competition ranking: 1, 2, 2, 4)
```

**Public view:** Thread shows only ordinal rank (1st, 2nd, T-3rd, etc). Exact VP numbers are visible only in private view and at match end.

### 6.2 Trailing bonus

After each round's standings computed:

```python
vp_gap = max(vp) - min(vp)
last_place_players = [p for p in players if p.vp == min(vp)]
for p in players:
    p.trailing_bonus_active = (p in last_place_players) and (vp_gap >= 3)
```

Additionally, each `trailing_bonus_active` player may, at the start of their next turn, request ONE **Tribute Route** (?6.3). They may only have one active route at a time.

### 6.3 Tribute Route

- Initiated by a trailing player targeting any other player.
- Target player must consent (accept).
- Lasts 2 rounds from the round of initiation.
- Each round of the route, at the **end of the target's turn**, the target gives 1 resource of the target's choice to the trailing player.
- The target gains 0 Beads unless it's their first trade with the trailing player (then standard Bead rule applies).
- The trailing player gains 0 Beads, period.
- If the target cannot give a resource (no resources), the route pauses that round but continues.

---

## 7. Match end

### 7.1 Triggers

Match ends at the *first* of the following:

1. **Great Hall built:** At end of the round in which any player builds a Great Hall.
2. **VP threshold:** Any player has `vp >= 8` at end of their turn.
3. **Round 15 complete.**

**Ordering clarification.** Triggers (1) and (2) can fire on the same turn ? e.g., a player's build action both constructs Great Hall (+4 VP) and pushes them from 4 VP to 8 VP. In this case the **VP threshold fires first** because it is checked at **end of turn**, whereas the Great Hall trigger is checked at **end of round**. The match-end log records `end_trigger: "vp_threshold"` in this scenario, not `"great_hall"`. Implementations MUST check VP threshold at the end of every turn (including after trade resolutions that yield Bead conversions) and Great Hall only during end-of-round resolution.

### 7.2 Winner determination

At match end:

```python
sorted_final = sort(players, by=vp, desc=true)
top_vp = sorted_final[0].vp
tied = [p for p in players if p.vp == top_vp]
if len(tied) == 1: winner = tied[0]
else: apply tiebreakers in order:
    1. Most buildings (count of unique building types owned).
    2. Most unique trade partners (len(partners_traded)).
    3. Shared victory (all tied players are co-winners).
```

---

## 8. Glossary of public events (for SMS-thread and simulation logs)

| Event | Description | Public? |
|---|---|---|
| `turn_start` | Player X begins their turn | yes |
| `trade_proposed` | Player X offers Player Y | yes |
| `trade_resolved` | Trade between X and Y completed | yes |
| `trade_rejected` | Y rejected X's offer | yes |
| `trade_countered` | Y countered X's offer | yes |
| `trade_expired` | X's offer to Y expired | yes |
| `action_gather` | X gathered at region | yes (reveals region + yield) |
| `action_build` | X built a building | yes |
| `action_ambush_set` | X moved in secret | yes (region hidden) |
| `action_scout` | X scouted a region | yes |
| `ambush_triggered` | X ambushed Y at region | yes |
| `ambush_scouted` | Z scouted X's ambush at region | yes |
| `ambush_expired` | X's ambush at region expired with no effect | yes (but retroactively) |
| `bead_earned` | X earned Bead from trade with Y (goes to `pending_beads` under v0.8) | yes |
| `bead_capped` | X completed a trade but earned no Bead (already at the per-round trade Bead cap) | yes |
| `bead_stolen` | v0.8: X was ambushed this round; their pending Beads transferred to ambusher A at end-of-round | yes |
| `bead_denied` | v0.8 (deny variant only): X was ambushed this round; pending Beads destroyed at end-of-round | yes |
| `bead_converted` | X (or an ambusher who just stole beads) converted 2 Beads to +1 VP | yes |
| `trailing_bonus_applied` | X is trailing, +1 Gather next round | yes |
| `tribute_route_proposed` | X requests tribute from Y | yes |
| `tribute_route_accepted` | Y accepted tribute route | yes |
| `tribute_route_payment` | Y sends 1 resource to X | yes |
| `round_end` | Round N ended, standings updated | yes |
| `match_end` | Match ended, winner announced | yes |

---

## 9. Simulation conformance

Any simulation run (human-played, AI-agent-played, or scripted) MUST:

1. Follow these rules exactly.
2. Emit a match log conforming to `SIMULATION_SCHEMA.md`.
3. Set `rules_version: "v0.8"` in the log.
4. Use the provided `seed` deterministically.

Agents may vary in decision-making (e.g. `greedy_builder`, `aggressive_raider`, `diversified_trader`, `random`, `human`), but the rule enforcement must be identical. Analysis across runs depends on rule determinism ? any divergence invalidates the comparison.

---

*End of RULES.md — v0.8*
