# v0.6 smart-agent baseline vs v0.7 pacing rules comparison

## Overview

- Baseline: `simulations/batch_v0.6_smart_agents.jsonl` (RULES.md **v0.6** outputs)
- New rules: `simulations/batch_v0.7.jsonl` (**v0.7**: cheaper Great Hall, **`vp >= 8`**, uncapped bead conversion with **3 Beads spent** per **+1 VP**)
- Matches run (baseline / v0.7): **50 / 50**
- Validation: **`python3 tools/sim.py --validate`** exits **0** on both JSONL files (schema + accounting checks)

## End-trigger distribution

| Trigger | v0.6 smart | v0.7 |
|---|---|---|
| `round_limit` | 50 (100%) | 45 (90%) |
| `vp_threshold` | 0 (0%) | 5 (10%) |
| `great_hall` | 0 (0%) | 0 (0%) |

## Trade activity

- Avg trades per match (v0.6 smart / v0.7): **4.88** / **5.00** (244 vs 250 completed trades total)
- Bead conversions per match (avg `bead_converted` events): **0.76** / **0.76** — **unchanged** in this batch (see Hypotheses / New problems)

## Ambush activity

- Ambushes attempted / hit / scouted / expired (v0.6 smart / v0.7): **176 / 7 / 36 / 115** / **169 / 7 / 34 / 112**
- Matches with ≥1 successful ambush hit (v0.6 smart / v0.7): **5 / 50** / **5 / 50**

## Match length

- Avg final round (v0.6 smart / v0.7): **15.0** / **14.92**
- Shortest match (v0.6 smart / v0.7): **15** / **14** (four v0.7 matches ended in round **14** on `vp_threshold`)

**v0.7 final-round distribution:** round **15**: 46; round **14**: 4.

## Winner VP distribution

- Avg winning VP (v0.6 smart / v0.7): **6.06** / **6.44**
- Max VP observed in batch (any player) (v0.6 smart / v0.7): **7** / **11**

**v0.7 winner VP histogram** (solo winners): VP **6** ×24, **7** ×15, **11** ×4 (all `vp_threshold` wins from this slice), **2** ×3 (random block), **5** ×2, **10** ×1, **3** ×1.

**Match-ending VP vs threshold**

- v0.6: **0 / 50** winners at exactly **10 VP** (threshold never triggered).
- v0.7: **0 / 50** winners at exactly **8 VP** — threshold wins landed **above** 8 via buildings / stacked conversions in the same turn sequence (e.g. **10–11 VP**).

## Tribe win rates (winner’s tribe)

| Tribe | v0.6 smart | v0.7 |
|---|---|---|
| grey | 25 (50%) | 26 (52%) |
| brown | 12 (24%) | 10 (20%) |
| red | 7 (14%) | 8 (16%) |
| orange | 6 (12%) | 6 (12%) |

## Agent archetype win rates (winner’s agent)

| Agent | v0.6 smart | v0.7 |
|---|---|---|
| `diversified_trader` | 17 (34%) | 18 (36%) |
| `greedy_builder` | 10 (20%) | 11 (22%) |
| `alliance_duopoly` | 10 (20%) | 10 (20%) |
| `banker` | 3 (6%) | 1 (2%) |
| `scout_paranoid` | 5 (10%) | 5 (10%) |
| `random` | 5 (10%) | 5 (10%) |

*(Seeds 1–10: four-way `greedy_builder` mirrors; seeds 31–40: `alliance_duopoly` block; seeds 41–45 / 46–50: scout/raider and random blocks per the shared batch config.)*

## Comeback / trailing-player win rate

- `aggregates.trailing_player_won` rate (v0.6 smart / v0.7): **44%** / **44%** (unchanged)

## Manual spot-checks (JSONL)

### Seed **14** — `vp_threshold` (`match_id` `m_d8fa8f2ef44d87a71ecc`)

- **`outcome.end_trigger`:** `vp_threshold`; **`final_round`:** **14**; **`final_scores`:** P4 **11**, others below.
- Winner’s last logged `turn` **`state_after`:** **vp 11**, **beads 0** — consistent with ending after VP resolution on that turn sequence.
- **Great Hall** appears in the log with **`cost_paid`:** `{"T":1,"O":1,"F":1,"Rel":1,"S":2}` (**6 resources**, not v0.6’s 10). Match still records **`vp_threshold`** — VP race ended the game under the simulator’s ordering for that seed before a `great_hall` round-capstone end would apply.
- **`bead_converted`:** rounds **5** (P4), **12** (P1) — two separate resolutions; **no** player had **>1** bead conversion in this match (still consistent with rules; uncapped loop did not chain here).

### Seed **1** — `round_limit` (`match_id` `m_7381cbb18519343d43ae`)

- **`outcome.end_trigger`:** `round_limit`; **`final_round`:** **15** — full schedule under v0.7.

### Seed **17** — Great Hall **cost** check (`match_id` `m_b1f759abc6c520a30399`)

- No match in this batch ended with **`great_hall`** as **`end_trigger`** (**0 / 50**).
- Seed **17** includes a **`great_hall`** **`action_build`** with **`cost_paid`** `{"T":1,"O":1,"F":1,"Rel":1,"S":2}`; **`outcome.end_trigger`** is still **`vp_threshold`** (winner **P1** at **11 VP**) — used to verify **6-resource** accounting where a Hall is built.

### Bead loop stress

- Across all 50 v0.7 matches, **max `bead_converted` events for a single player in one match = 1** — no observed double-spend chain in one trade burst in this batch (economy rarely re-banks 3+ beads after a spend under these agents).

## Hypotheses check

1. **End-trigger distribution moves off 100% `round_limit` — PASS**  
   v0.6 smart: **100%** `round_limit`. v0.7: **90%** `round_limit`, **10%** `vp_threshold`.

2. **Avg match length < 15 — PASS**  
   v0.6 smart avg final round **15.0**; v0.7 **14.92** (< 15).

3. **`diversified_trader` win rate rises but stays ≤ ~45% — PASS**  
   **34%** → **36%** (18/50).

## New problems introduced / surfaced

1. **No `great_hall` end triggers in 50 seeds** — Great Hall is cheaper but still did not decide a match ending; pacing moved via **`vp_threshold`** first when early termination happened.
2. **Bead conversion *events* did not increase** vs the v0.6-smart batch (still **38** total `bead_converted` events; **0.76** per match avg). Uncapping is live in `tools/sim.py`, but under this agent set and schedule, players rarely re-accumulate 3+ Beads after spending, so empirical conversion counts match the old cap in practice.
3. **Higher VP ceiling in outcomes** — max VP **11** observed (vs **7** baseline), from combined buildings + bead VP under the lower threshold and faster games.
4. **`banker` wins fell** (**3 → 1** in 50) — noise at N=50 but worth watching if Bead-spend pacing keeps favoring builders/traders.

## Implementation notes

- Rule deltas: `RULES.md` **v0.7**, `GDD.md` **0.7** (surgical), `tools/sim.py` (**`RULES_VERSION`**, `VP_WIN_THRESHOLD`, Great Hall cost dict, bead spend loop). **Agent code paths unchanged** from the smart-agent baseline.

---

*Generated for the v0.7 pacing pass; batch config: `tools/batch_v0.6_initial_config.json`.*
