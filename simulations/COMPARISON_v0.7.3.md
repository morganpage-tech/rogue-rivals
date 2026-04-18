# v0.7.2 vs v0.7.3 (trade Bead cap 1 ? 2 per round)

## Overview

- **v0.7.2:** `simulations/batch_v0.7.2.jsonl` ? 50 matches, `rules_version: "v0.7.2"`, at most **1 Bead per player per round** from trades.
- **v0.7.3:** `simulations/batch_v0.7.3.jsonl` ? same 50 seeds / tribes / agents / `agent_params` / turn orders as `tools/batch_v0.6_initial_config.json`; **`RULES_VERSION` `v0.7.3`** (at most **2 Beads per player per round** from trades). All other rules and agent code paths unchanged aside from that cap gate and version string.
- **Validation:** `python3 tools/sim.py --validate simulations/batch_v0.7.3.jsonl` exits **0**.

## End-trigger distribution

| Trigger | v0.7.2 | v0.7.3 |
|---:|---:|---:|
| `round_limit` | 20 (40%) | 20 (40%) |
| `vp_threshold` | 13 (26%) | 13 (26%) |
| `great_hall` | 17 (34%) | 17 (34%) |

Identical end-trigger mix (same seeds and determinism aside from economy paths touched by the cap).

## Match length distribution

- **Avg final round:** **11.90 ? 10.76**
- **Histogram (v0.7.2):** round **15** ? 20, **11** ? 13, **10** ? 7, **7** ? 5, **9** ? 3, **8** ? 1, **12** ? 1
- **Histogram (v0.7.3):** round **15** ? 20, **7** ? 16, **9** ? 9, **8** ? 3, **11** ? 1, **10** ? 1

Average length **drops** versus v0.7.2; more mass in the **7?9** round band (stalemate / low-tempo mirrors resolve faster than the v0.7.2 **11** spike).

## Trade activity

- **Avg completed trades per match:** **7.74 ? 6.08** (387 ? 304 total)

Trade count **falls** slightly; partner volume is still healthy, but fewer completed accepts per match versus v0.7.2 in this slice.

## Bead activity

| Metric | v0.7.2 | v0.7.3 |
|---|---:|---:|
| Total `bead_earned` events | 592 | 600 |
| Avg `bead_earned` per match | 11.84 | 12.00 |
| Total `bead_converted` events | 265 | 259 |
| Avg `bead_converted` per match | **5.30** | **5.18** |
| Avg `bead_capped` events per match | **3.64** | **0.16** |
| Avg **winner VP from beads** (% of winner's VP) | ~20.9% | ~27.0% |

**`bead_capped` traffic collapses** (182 ? 8 total events) as expected: a **2-Bead** cap binds far less often than **1**. Slight rise in bead VP share of winners; conversions per match tick **down** modestly.

## Ambush activity

| Metric | v0.7.2 | v0.7.3 |
|---|---:|---:|
| Sum `ambushes_attempted` | 106 | 93 |
| Sum `ambushes_hit` | 1 | 1 |
| Avg attempts / match | 2.12 | 1.86 |

## Winner VP distribution and max VP

- **Avg winning VP:** **6.32 ? 6.38**
- **Max VP (any player, any match):** **8 ? 12** (one `vp_threshold` match can spike the leader's VP in a single turn via stacked trades and conversions before the engine checks threshold at end-of-turn)

## Agent archetype win rates (winner's agent)

| Agent | v0.7.2 | v0.7.3 | Notes |
|---|---:|---:|---|
| `greedy_builder` | 22 (44%) | 11 (22%) | Drops back under one-in-three |
| `banker` | 11 (22%) | 7 (14%) | Slight further dip vs v0.7.2 |
| `diversified_trader` | 7 (14%) | **12 (24%)** | Becomes the top single-strategy archetype in this batch |
| `alliance_duopoly` | 0 (0%) | **10 (20%)** | Recovers from collapse; paired trading viable again |
| `scout_paranoid` | 3 (6%) | 3 (6%) | Flat |
| `aggressive_raider` | 2 (4%) | 2 (4%) | Flat |
| `random` | 5 (10%) | 5 (10%) | Control unchanged |

## Tribe win rates (winner's tribe)

| Tribe | v0.7.2 | v0.7.3 |
|---|---:|---:|
| brown | 18 (36%) | 11 (22%) |
| grey | 17 (34%) | **19 (38%)** |
| orange | 6 (12%) | 11 (22%) |
| red | 9 (18%) | 9 (18%) |

## Comeback / trailing-player win rate

- **`aggregates.trailing_player_won`:** **24% ? 6%** (12 ? 3 matches)

Trailing-player wins **collapse** versus v0.7.2 despite round-cap relaxation ? faster closures and archetype reshuffle dominate this metric in the fixed seed slice.

---

## Leader-awareness gate activations

- **Rejections tagged `reason: "leader_awareness"`:** **79** (v0.7.2) ? **96** (v0.7.3) across the batch (**1.58 ? 1.92** per match).

Gate logic is unchanged; the **increase** is consistent with marginally different trade graphs and sequencing (more evaluation points where near-winner feeding would apply).

---

## Hypotheses check

1. **`alliance_duopoly` recovers to ? 10% win rate** ? **PASS** (**0% ? 20%**).
2. **`greedy_builder` drops below 35%** ? **PASS** (**44% ? 22%**).
3. **`banker` stays below 30%** ? **PASS** (**22% ? 14%**).
4. **No single archetype exceeds 35% wins** ? **PASS** (peak **`diversified_trader` 24%**).
5. **`round_limit` end rate stays 30?50%** ? **PASS** (**40% ? 40%**).
6. **Avg match length stays within 10?13 rounds** ? **PASS** (**11.90 ? 10.76**).

**Score: 6 / 6 hypotheses passed.**

---

## New problems introduced / watch items

1. **`diversified_trader` leads the pack (24%)** ? Not dominance-tier, but the relaxation shifts some wins from **`greedy_builder`** into diversified trading lines more than into alliances alone.
2. **`trailing_player_won` cratered (24% ? 6%)** ? Worth monitoring in later patches; may be seed-specific coupling with shorter mirror games rather than a pure rule regression.
3. **Peak VP observed at 12** ? Still consistent with threshold enforcement at end-of-turn after intra-turn spikes; not a balance bug by itself.

---

## Final balance assessment

Qualitative targets on agent win-rate distribution (excluding `random` from "floor" where noted):

| Axis | Target | v0.7.3 observation | Verdict |
|---|---|---|---|
| **Peak dominance** (max single-archetype win rate) | ? 30% | **`diversified_trader` 24%** | **Meets** |
| **Floor** (min non-`random` archetype win rate) | ? 5% | **`aggressive_raider` 4%** | **Misses** |
| **Spread** (max ? min among non-`random`) | ? 25 pp | **24% ? 4% = 20 pp** | **Meets** |

**Overall:** v0.7.3 clears peak and spread targets but **still leaves one niche archetype near the basement** (`aggressive_raider` at 4%), unchanged from v0.7.2's absolute count.

---

## Manual spot-checks (JSONL)

### A ? `vp_threshold` ? seed **23**, `match_id` **`m_d1a1590f04a55fa0b9b4`**

- **`rules_version`:** **`v0.7.3`** at match root.
- **Bead cap (2 earned then 3rd capped):** In **round 2**, **`P4`** completes **`o2_5`** with **`beads_awarded`** **1** each; then **`o2_6`** shows **`beads_awarded`: `{"P4": 0, "P3": 1}`** with **`bead_capped`** for **`P4`** vs **`P3`** ? **`P4`** already earned **two** trade Beads that round (**with `P3`**, then **`P1`**); the third trade still clears resources but awards **no** third Bead.
- **Leader-awareness:** **`trade_rejected`** **`o7_21`**, **`by`: `P1`**, **`reason`: `leader_awareness`** (round **7**).

### B ? `round_limit` ? seed **3**, `match_id` **`m_44b607e56266d726e6e2`**

- **`rules_version`:** **`v0.7.3`**.
- **Second Bead in one round:** **Round 14**, **`P1`** earns Beads on **`o14_3`** (vs **`P4`**) then **`o14_6`** (vs **`P3`**) ? two **`bead_earned`** lines for **`P1`** same round (cap **not** hit; no **`bead_capped`** this match).
- **Leader-awareness:** No **`leader_awareness`** rejections in this run (consistent with slow, low-feed games).

### C ? `great_hall` ? seed **28**, `match_id` **`m_ff38f2ebcdd1e1192ddb`**

- **`rules_version`:** **`v0.7.3`**; **`outcome.end_trigger`:** **`great_hall`**; **`final_round`:** **7**.
- **Leader-awareness:** **`trade_rejected`** **`o5_19`** (`from` **`P3`** to **`P4`**) with **`reason`: `leader_awareness`** in **round 6**. Earlier in **round 6**, **`trade_resolved` `o5_18`** lifts **`P3`** into the **6+ VP** band before **`P4`**'s free phase; **`P4`** then rejects **`P3`**'s pending feed to **`P4`**, matching the near-winner gate behavior.
- **Bead cap:** **`P3`**'s **`turn`** in **round 6** logs **`beads_earned_this_round`: **2** after allowed partner trades (consistent with **2 Beads/round** bookkeeping).

---

*Batch config: `tools/batch_v0.6_initial_config.json`. Simulator `RULES_VERSION`: **`v0.7.3`**.*
