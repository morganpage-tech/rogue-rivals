# v0.7.1 smarter agents vs v0.7.2 (Bead cap + leader-awareness)

## Overview

- **v0.7.1 smarter agents:** `simulations/batch_v0.7.1_smarter_agents.jsonl` ? 50 matches, `rules_version: "v0.7.1"`, smart-agent heuristics only.
- **v0.7.2:** `simulations/batch_v0.7.2.jsonl` ? same 50 seeds / tribes / agents / `agent_params` / turn orders as `tools/batch_v0.6_initial_config.json`; `RULES_VERSION` **`v0.7.2`** (1 Bead per player per round from trades + leader-awareness on trade acceptance).
- **Validation:** `python3 tools/sim.py --validate simulations/batch_v0.7.2.jsonl` exits **0**.

## End-trigger distribution

| Trigger | v0.7.1 smarter | v0.7.2 |
|---|---:|---:|
| `round_limit` | 20 (40%) | 20 (40%) |
| `vp_threshold` | 17 (34%) | 13 (26%) |
| `great_hall` | 13 (26%) | 17 (34%) |

## Match length distribution

- **Avg final round:** **10.26** ? **11.90**
- **Histogram (v0.7.1 smarter):** round **7** ? 20, **15** ? 20, **6** ? 4, **8** ? 5, **9** ? 1  
- **Histogram (v0.7.2):** round **15** ? 20, **11** ? 13, **10** ? 7, **7** ? 5, **9** ? 3, **8** ? 1, **12** ? 1  

Average length **increased** versus v0.7.1 smarter (still **below 13** rounds); more matches settle in the **10?12** band instead of the prior **~7** spike.

## Trade activity

- **Avg completed trades per match:** **6.52** ? **7.74** (326 ? 387 total)

Agents still propose freely; acceptance filters remove some late-game feeds, but completed trade count **rises** slightly in this batch.

## Bead activity

| Metric | v0.7.1 smarter | v0.7.2 |
|---|---:|---:|
| Total `bead_earned` events | 652 | 592 |
| Avg `bead_earned` per match | 13.04 | 11.84 |
| Total `bead_converted` events | 284 | 265 |
| Avg `bead_converted` per match | **5.68** | **5.30** |
| Avg **winner VP from beads** (% of winner?s VP) | ~36.2% | ~20.9% |
| Avg `bead_capped` events per match | 0 | **3.64** |

The **round Bead cap** shows up as steady **`bead_capped`** traffic; bead VP as a share of winner VP **drops** materially even though conversion counts move modestly (trade volume partially offsets the cap).

## Ambush activity

| Metric | v0.7.1 smarter | v0.7.2 |
|---|---:|---:|
| Sum `ambushes_attempted` | 86 | 106 |
| Sum `ambushes_hit` | 1 | 1 |
| Avg attempts / match | 1.72 | 2.12 |

## Winner VP distribution and max VP

**Avg winning VP:** **6.32** ? **6.32**

**Max VP (any player):** **8** ? **8**

Winner VP histogram shift is mild; **`vp_threshold`** wins still cluster at **8 VP** where the engine stops.

## Agent archetype win rates (winner?s agent)

| Agent | v0.7.1 smarter | v0.7.2 | Notes |
|---|---:|---:|---|
| `greedy_builder` | 11 (22%) | **22 (44%)** | Absorbs share from banker/alliance slack |
| `banker` | 18 (36%) | **11 (22%)** | Major drop vs v0.7.1 smarter |
| `diversified_trader` | 1 (2%) | **7 (14%)** | Strong recovery vs basement rate |
| `alliance_duopoly` | 10 (20%) | **0 (0%)** | No wins in this 50-match slice |
| `scout_paranoid` | 3 (6%) | 3 (6%) | Flat |
| `aggressive_raider` | 2 (4%) | 2 (4%) | Flat |
| `random` | 5 (10%) | 5 (10%) | Control unchanged |

## Tribe win rates (winner?s tribe)

| Tribe | v0.7.1 smarter | v0.7.2 |
|---|---:|---:|
| brown | 22 (44%) | 18 (36%) |
| grey | 8 (16%) | **17 (34%)** |
| orange | 11 (22%) | 6 (12%) |
| red | 9 (18%) | 9 (18%) |

## Comeback / trailing-player win rate

- **`aggregates.trailing_player_won`:** **6%** ? **24%** (3 ? 12 matches)

Trailing-player wins **rise** sharply versus v0.7.1 smarter (direction: **up**).

---

## Leader-awareness effect

- **Rejections tagged `reason: "leader_awareness"`:** **79** trades across the batch (**1.58** per match on average).
- **Interpretation:** Offerers sitting at **6?7 VP** attract the bulk of defensive rejects once any player has reached **4+ VP** globally (gate activation band).
- **Offerer VP timing caveat:** Offers are emitted **after** earlier free-phase trades on the same turn; public `state_before.vp` on the offerer?s logged `turn` is **start-of-turn** VP. A spot-check shows intra-turn bead/build gains can lift the offerer to **?6 VP** before they propose even when **start-of-turn** VP was **5** (see spot-check **C**).

### Spot-check linkage (seed **28**, `great_hall`)

- Proposal **`o6_21`** (`P3` ? `P2`) appears with **`turn P3 vp_before=5`** immediately after in the log sequence; **`P3`** had just accepted **`o6_20`**, ending at **6 VP** before those proposals resolved in engine order ? satisfies the **near-winner** gate when **`P2`** later rejects with **`leader_awareness`** on **`o6_21`** in round **7**.

---

## Hypotheses check

1. **`banker` win rate drops from 36% to ? 18%** ? **FAIL** (**36% ? 22%**; target not met).
2. **`diversified_trader` win rate rises from 2% to ? 10%** ? **PASS** (**2% ? 14%**).
3. **No single archetype exceeds 35% wins** ? **FAIL** (**`greedy_builder` 44%**).
4. **`round_limit` end rate stays roughly constant (40% ? 10%) or drops** ? **PASS** (**40% ? 40%**).
5. **Avg Bead conversions per match drops into ~2.0?3.5** ? **FAIL** (**5.68 ? 5.30**, still above band).
6. **Leader-awareness gate fires ? 20 times** ? **PASS** (**79** tagged rejections).

**Score: 3 / 6 hypotheses passed.**

---

## New problems introduced / surfaced

1. **`greedy_builder` dominance (44% wins)** ? Leader-awareness + bead cap disproportionately screens rivals who relied on accepting trades; builders that still convert when ahead consolidate wins.
2. **`alliance_duopoly` collapsed to 0%** in this slice ? Former pair-farming wins were displaced; pair seats still trade, but closure paths now favor **`greedy_builder`** pods.
3. **Avg match length crept up** (**10.26 ? 11.90**) ? Not above the **~13** warning threshold, but pacing shifted longer vs v0.7.1 smarter?s fast **round 7** peak.
4. **Bead conversions stayed high (~5.3 / match)** ? Round cap trims bead events, yet higher trade throughput sustains conversion frequency outside the hypothesized **2?3.5** band.

---

## Manual spot-checks (JSONL)

### A ? `vp_threshold` ? seed **23**, `match_id` **`m_d1a1590f04a55fa0b9b4`**

- **`outcome.end_trigger`:** `vp_threshold`; **`final_round`:** **10**; **`final_scores`:** **`P3`: 8** (winner), **`P1`/`P4`: 6**, **`P2`: 4**.
- **Bead cap:** In **round 10**, **`trade_resolved`** on **`o10_33`** shows **`beads_awarded`: `{"P4": 0, "P3": 1}`** with a following **`bead_capped`** on **`P4`** ? **`P4`** already earned a Bead that round before the second trade completed.
- **Leader-awareness:** **`trade_rejected`** **`o8_26`** (`by` **`P4`**, **`reason`: `leader_awareness`**); proposal **`o8_26`** is from **`P3`** with **`P3`** at **6 VP** at start of their round **8** turn (eligible near-winner offerer).

### B ? `round_limit` ? seed **3**, `match_id` **`m_44b607e56266d726e6e2`**

- **`outcome.end_trigger`:** `round_limit`; **`final_round`:** **15**.
- **Bead cap:** **`bead_capped`** events present (e.g. **round 14**, **`P1`** capped vs **`P3`**) ? second trade that round completes without a Bead while resources still flow.
- **Leader-awareness:** No **`leader_awareness`** rejections logged in this match (still validates round-cap-only behavior in slow economies).

### C ? `great_hall` ? seed **28**, `match_id` **`m_ff38f2ebcdd1e1192ddb`**

- **`outcome.end_trigger`:** `great_hall`.
- **Leader-awareness:** **`trade_rejected`** on **`o6_21`** with **`reason`: `leader_awareness`**; **`P3`** proposes after intra-turn trades ? ends at **6 VP** before **`P2`** evaluates the offer (see Leader-awareness section above).
- **Accounting:** **`final_scores`** respect **`vp_win_threshold`** ordering; **`great_hall`** build ends the round per rules.

---

*Batch config: `tools/batch_v0.6_initial_config.json`. Simulator `RULES_VERSION`: **`v0.7.2`**.*
