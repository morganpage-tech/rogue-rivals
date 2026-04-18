# Porting notes (`tools/sim.py` → `@rr/engine`)

References: **RULES.md v0.7.3**, **PROTOTYPE_SPEC.md §6**, **SIMULATION_SCHEMA.md v1.0**.

## Forge cost resolution

Python builds candidate triples `(a,b,c)` with nested loops over indices `i<j<k` over `RES_KEYS = ("T","O","F","Rel","S")`, filters by affordability (`need_s = 1 + (S in triple)`), then **`cand.sort()`** — tuple ordering in Python 3 compares element-wise lexicographically. That matches TS: generate the same triples in the same nested-loop order, **`Array.sort`** with `localeCompare` on `T,O,F,Rel,S` symbols.

**Interpretation:** “Lexicographically smallest feasible 3-type bundle” means smallest triple in sorted `(r1,r2,r3)` string order among feasible triples, **not** “smallest by resource key priority other than RES_KEYS order.”

## Trade-offer expiration

Per RULES §2.2 step 2, offers expire at the **start** of the offerer’s next turn. `sim.py` calls `expire_my_offers(pid)` at the beginning of `execute_turn` before agent decisions. The TS engine runs `expireOffersFromOfferer` when the player **first interacts** after becoming current (`needsTurnOpenExpire`), which is equivalent for any correct command stream (expiration before free phase actions).

## Multiple ambushes on one region

`GameEngine.ambushers_at` returns players in **`turn_order`** order. Gather applies the **first** ambusher; `sim.py` clears other ambushers on the same region when one fires (same as TS `rest` cancellation). Scout reveals **all** at once.

## Bead cap timing

`beads_earned_this_round` resets for every player in `end_of_round()` in `sim.py` **before** trailing bonus math. Same as TS `runEndOfRound`: reset bead counters first, then ambush expiry / standings / trailing flags.

## Trailing bonus

Computed from standings **after** the round (`vp_gap`, last place). `trailing_bonus_active` applies on **subsequent** gathers — state updated at round end; next round’s gathers read the flag. Matches RULES §6.2.

## Match-end ordering (Great Hall vs VP threshold)

In `run_match`, after each turn the loop checks **`vp >= 8`** and sets `match_ended` + `vp_threshold`, then **`break`** out of the seat loop. Then **`end_of_round`** still runs for that **partial** round. After a **full** round without VP end, `great_hall_this_round` is checked and ends the match with **`great_hall`**. So building Great Hall and reaching VP ≥ 8 on the **same** turn yields **`vp_threshold`** (turn ends before round completion check). Confirmed in `tools/sim.py` ~1524–1548.

## RNG

Python `random.Random(seed)` is only used for **initial turn-order shuffle** when no explicit order is passed. Gameplay rule resolution uses **no** RNG. The TS engine keeps a **mulberry32** `state.rng` (serializable `{ a }`) and advances it when shuffling; replay logs always supply `turn_order`, so replay does not depend on shuffle draws.

## `rules_version`

Logs and `MatchState.rulesVersion` use **`"v0.7.3"`**.
