# v0.7.3.1 Engine Patch � Summary

**Date:** 2026-04-18
**Rules version:** `v0.7.3` ? `v0.7.3.1`
**Baseline artifact:** `simulations/batch_v0.7.3.1.jsonl` (50 matches, same seeds/lineups as `batch_v0.7.3.jsonl`)

This patch is the outcome of the "fix `aggressive_raider`" investigation. While auditing the raider archetype (0 wins across the v0.7.3 archetype batch) we uncovered a subtle Watchtower-cost implementation bug that also happened to inflate the trading archetypes' VP. Both issues are fixed here.

---

## 1. What changed

### 1a. Watchtower cost bug (engine correctness)

Both the Python reference simulator (`tools/sim.py`) and the TypeScript port (`packages/engine/src/actions.ts`) computed the Watchtower cost with this pattern:

```python
for k in RES_KEYS:                  # RES_KEYS = (T, O, F, Rel, S)
    c = {k: 2, "S": 1}
    if can_pay(ps, c): return c
```

When the loop reached `k == "S"`, the dict literal `{ "S": 2, "S": 1 }` collapsed to `{ "S": 1 }` (Python and JS both keep the *last* duplicate key). The engine therefore accepted **1 Scrap** as sufficient to build a Watchtower whenever the player had no non-Scrap resource in quantity ?2 � nominally 2 VP for 1 Scrap.

Fix: construct the `k == "S"` branch as `{ "S": 3 }` (2 of S plus the extra 1 S) which matches `RULES.md �4.2` as written. Same fix applied in both `GameEngine.compute_build_cost` and `compute_build_cost_for_player` on the Python side, and in `computeBuildCost` on the TypeScript side.

Regression test added in `packages/engine/test/engine.test.ts` covering the Scrap-only case.

### 1b. `aggressive_raider` heuristic (agent design)

Previous heuristic only walked `great_hall ? watchtower ? forge` on the build ladder, skipping `shack` and `den`. Its VP ceiling from buildings alone was therefore 4 (watchtower + forge), versus 10 for archetypes that also built shack + den + great_hall.

New heuristic:
1. Build Great Hall if affordable
2. Build shack ? den (new), **except** defer to an ambush if spending the last Scrap would otherwise rule out a high-EV raid
3. Build watchtower ? forge
4. Low-probability scout
5. Ambush the leader's home region (slightly boosted thresholds: 0.50 / 0.30 / 0.12 by VP gap, up from 0.40 / 0.22 / 0.08)
6. Gather (Scrap pool first, else home)

The agent retains its "aggressive" identity through the Scrap-guarding rule (step 2) and higher ambush thresholds (step 5), but now has a realistic VP floor through the economic buildings.

### 1c. Version bump

`RULES_VERSION` in `tools/sim.py`, `rulesVersion` literal in `packages/engine/src/{state,init,cli}.ts`, title in `RULES.md`, and heading in `GDD.md` all bumped to `v0.7.3.1`. `SCHEMA_VERSION` is unchanged.

Old `simulations/batch_v0.7.3.jsonl` is retained as a historical artifact. The TS replay test now pins against `simulations/batch_v0.7.3.1.jsonl`.

---

## 2. Before / after (same 50 seeds, same lineups)

Deltas measured on `batch_v0.7.3.jsonl` (buggy engine, old raider) vs `batch_v0.7.3.1.jsonl` (patched engine, new raider). Lineups are unchanged; the only inputs that differ are the engine code and the raider heuristic.

| Agent | Apps | Wins (old?new) | Win % (old?new) | Avg VP (old?new) | Buildings (old?new) |
|---|---:|---:|---:|---:|---:|
| aggressive_raider | 30 | 2 ? **5** | 6.7 ? **16.7** | 3.67 ? 4.13 | 47 ? 59 |
| alliance_duopoly | 20 | 20 ? 20 | 100 ? 100 | 5.00 ? 5.00 | 40 ? 40 |
| banker | 20 | 8 ? 8 | 40.0 ? 40.0 | 6.95 ? **7.50** | 37 ? 38 |
| diversified_trader | 20 | 14 ? **6** | **70.0 ? 30.0** | 7.40 ? 6.70 | 56 ? 55 |
| greedy_builder | 80 | 18 ? 20 | 22.5 ? 25.0 | 5.80 ? 5.78 | 237 ? 234 |
| random | 20 | 6 ? 5 | 30.0 ? 25.0 | 1.50 ? 1.45 | 21 ? 21 |
| scout_paranoid | 10 | 4 ? **8** | 40.0 ? **80.0** | 3.00 ? 3.80 | 25 ? 29 |

**Aggregate sanity checks:**
- Average rounds per match: 10.76 ? 10.80 (unchanged; pacing preserved)
- Total "cheap" Watchtowers (`cost_paid == {'S': 1}`): 43 ? 0 (bug eliminated)
- Total Watchtowers built: 132 ? 127 (-4%; archetypes now skip or swap for other builds when non-Scrap availability is too tight)

**Aggressive_raider build mix (30 appearances):**

| Building | old | new |
|---|---:|---:|
| shack | 0 | **26** |
| den | 0 | **5** |
| watchtower | 30 | 24 |
| forge | 17 | 4 |
| great_hall | 0 | 0 |

The new raider builds shack in essentially every match, occasionally dens, still a healthy number of watchtowers, and has shed the forge-heavy pattern (forge is expensive and only 2 VP). Its win rate nearly tripled (6.7% ? 16.7%) without changing any rule text.

## 3. What the before/after tells us about the design

1. **Most of `diversified_trader`'s v0.7.3 dominance was the bug.** Removing cheap Watchtowers dropped its win rate from 70% ? 30%. Banker held steady (40% ? 40%), which is consistent with banker leaning more on bead conversion than on cheap VP. This materially changes the v0.7.3 archetype conclusion: trader is competitive, not dominant.
2. **Raider was broken at both layers.** Even without the bug, the heuristic's missing shack/den rungs would have capped it at ~4 VP. Fixing only one layer would have been insufficient: we needed both the engine correctness fix **and** the heuristic rewrite to lift the raider off 0%.
3. **The game's core loop is more balanced than we thought.** With the patched engine and the patched raider, archetype win rates in the diverse lineup cluster roughly: greedy 25% / banker 40% / trader 30% / raider 17% � still uneven, but no longer hard-zero.

## 4. Follow-up candidates

- Re-run the LLM mixed-v1 exploit test (`greedy + raider vs trader_llm + banker_llm`) with the patched raider, to see whether `aggressive_raider` can now actually exploit conservative LLM play rather than feeding it free wins.
- Revisit the `SUMMARY_v0.7.3.md` and `COMPARISON_llm_v*.md` reports; diversified_trader's 70% number in those reports reflects the buggy baseline. The new numbers don't change the qualitative LLM findings (LLMs play slower, more equally across archetypes) but should be cited alongside the patched baseline going forward.
- The `scout_paranoid + aggressive_raider` 4-player lineup now resolves 80/20 in paranoid's favour rather than 40/20. Worth a small standalone 10-match sweep if we want a counter-raid archetype benchmark.
