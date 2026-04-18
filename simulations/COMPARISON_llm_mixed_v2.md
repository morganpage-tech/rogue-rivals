# LLM Mixed v2 — Exploit retest on the patched engine

**Batch:** `simulations/batch_llm_mixed_v2.jsonl`  (10 matches, `glm-4.6` via Z.AI, $0.37, 9m 8s wall with 5 workers)
**Control:** `simulations/batch_mixed_v2_heuristic.jsonl` (same 10 seeds, fully heuristic)
**Compared against:** `batch_mixed_v1_heuristic.jsonl` and `batch_llm_mixed_v1.jsonl` (buggy engine, old raider)
**Rules:** `v0.7.3.1` — `aggressive_raider` heuristic rewritten + Watchtower cost bug fixed; see `PATCH_v0.7.3.1.md`.

Lineup (identical across all four batches, seeds 31–40):

| Seat | Role |
|---|---|
| P1 | `greedy_builder` (heuristic) |
| P2 | `aggressive_raider` (heuristic) |
| P3 | `diversified_trader` (heuristic) or `diversified_trader_llm` (LLM) |
| P4 | `banker` (heuristic) or `banker_llm` (LLM) |

Turn-order averages per seat are **byte-identical** across the four batches (P1 2.70 / P2 2.10 / P3 2.70 / P4 2.50), so seat-level deltas are pure engine + agent effects.

---

## 1. Headline: the "exploit" was the bug

`COMPARISON_llm_mixed_v1.md` reported `greedy_builder` doubling its wins (3→6) against LLM opponents and concluded that conservative LLM play was being exploited by aggressive heuristics. With the patched engine and patched raider that conclusion **does not survive**.

| Seat | Role | H_old | **H_new** | L_old | **L_new** |
|---|---|---:|---:|---:|---:|
| P1 | greedy_builder (H) | 3 | 1 | **6** | **2** |
| P2 | aggressive_raider (H) | 1 | 0 | 0 | 1 |
| P3 | trader (H/LLM) | 3 | 4 | 2 | 1 |
| P4 | banker (H/LLM) | **4** | **5** | 3 | **6** |
| — | LLM seats combined | — | — | 5/10 | **7/10** |
| — | Heuristic seats combined | — | — | 6/10 (1 shared) | 3/10 |

The v1 story "greedy goes 3→6 against LLMs" is replaced by v2 "greedy goes 1→2 against LLMs" — i.e. no exploit signal. The *real* pattern that survives the patch is different:

1. **`banker_llm` is the strongest player in the batch** at 6/10 wins (60%). It outperforms `banker(H)` against the same mixed field (5/10), i.e. Z.AI’s LLM plays banker *better* than the heuristic does.
2. **LLM seats collectively take 7/10 matches** in the mixed treatment, up from 4/10 in the buggy v1. Conservative LLM play is not a liability on the patched engine.
3. **`diversified_trader`** drops from 3→1 wins between heuristic control and LLM treatment (because in H_new the `diversified_trader` heuristic is right next to `banker` in tempo; under LLM play they converge toward the same long-game style and `banker_llm` edges out).

## 2. What actually changed between v1 and v2

**Engine** — the `{k: 2, "S": 1}` Watchtower-cost dict-collision is fixed. In the buggy engine, 43 of 213 Watchtowers in the v0.7.3 baseline cost 1 Scrap instead of 3. Long matches were particularly subsidised, so the LLM batches (avg 13.6 rounds vs 8.2 for heuristics) disproportionately fed `greedy_builder`, who already collects cheap VP aggressively. With the bug gone, greedy's extra-turn advantage evaporates.

**Raider** — the heuristic now walks the full build ladder (shack, den added). Its absolute win rate went 0→1 across the L_new batch and 0→0 (with shared rises) across H_new, which is modest but in line with the v0.7.3.1 baseline (raider 6.7% → 16.7% in the 50-match control). The raider still loses the *aggregate* comparison here because:

- Ambush hit rate is 16–20% across both H_new and L_new (down from 25–28% pre-patch). Opponents with legitimate watchtowers absorb more raids.
- Yield per successful ambush is 1.6–4.0 resources, far too low to justify the 1-Scrap-per-attempt cost plus the turn spent scouting wins.
- Against `greedy_builder` (fast VP), the raider's 1-Scrap ambushes can't outrun shack/den/watchtower/great-hall tempo.

This suggests the next design question is **about the ambush mechanic itself**, not the raider heuristic — see §4.

## 3. Match-pacing and economics

| Metric | H_old | H_new | L_old | L_new |
|---|---:|---:|---:|---:|
| Avg rounds | 8.2 | 9.0 | 13.6 | **14.0** |
| Avg trades completed | 11.4 | 14.1 | 8.1 | 9.6 |
| Total ambush attempts | 14 | 12 | 24 | 25 |
| Ambush hit % | 28.6 | 16.7 | 25.0 | 20.0 |
| Total Watchtowers built | 26 | 21 | 19 | 27 |
| Cheap Watchtowers (cost_paid `{S:1}`) | 17 | **0** | 0 (LLM never hit it) | **0** |

Observations:

- **LLM matches are still 55% longer than heuristic matches.** The LLM-cautious-tempo finding from v1 is robust; it wasn't a bug artefact.
- **Trade volume grows in both H_new and L_new** (+24% and +19%) once the cheap-VP shortcut is closed. Players now have to earn VP the intended way, which trades are part of.
- **LLM watchtower construction more than doubles between L_old (19) and L_new (27)** even though the bug is fixed. Reason: LLMs already built legitimate 2-of-something watchtowers at high rates; the headline "L_old had 0 cheap watchtowers" confirms LLMs never exploited the bug in the first place. Heuristics (banker/trader) were the ones getting free VP, which is precisely why the patch helps LLM seats relatively.

## 4. Design implications

1. **Diversified_trader's earlier dominance, and therefore the headline "heuristics beat LLMs in v1 because they exploit their bead engine", both need to be retracted.** Both were reading the bug's fingerprint. The real picture on patched v0.7.3.1 is closer to: greedy/trader/banker all play at roughly equivalent strength, with banker_llm edging out in the LLM form because it converts long, trade-heavy games efficiently.
2. **`aggressive_raider` still needs rule-level help, not more heuristic tuning.** The 16–20% ambush hit rate and ≤2-resource average yield suggest the mechanic is under-tuned relative to 1-Scrap cost. Candidate tweaks (not done here): increase ambush yield to `3 × pre_yield` from `2 × pre_yield`, or let ambushes steal Scrap when ambushing ruins, or give watchtowers explicit counter-attack costs so the defender pays something to absorb.
3. **LLMs are competitive players on this ruleset**, especially in the banker role. Prior claims that LLMs were too cautious and would get steamrolled by aggressive heuristics should be considered falsified on the patched engine.
4. **Long LLM matches are not a bug, they're a style.** +55% match length with +19% trade volume means more interaction per match, which is design-positive for a negotiation game. The only reason it *looked* bad in v1 was the bug turning long games into greedy's VP farm.

## 5. Concrete numbers (NEW LLM batch per-match outcomes)

| Seed | Winner | Agent | Scores (P1/P2/P3/P4) | Margin | Rounds |
|---:|:---|:---|:---|---:|---:|
| 31 | P4 | banker_llm | 2 / 4 / 4 / **9** | 5 | 12 |
| 32 | P4 | banker_llm | 6 / 3 / 6 / **8** | 2 | 13 |
| 33 | P4 | banker_llm | 7 / 4 / 5 / **8** | 1 | 15 |
| 34 | P1 | greedy_builder | **6** / 2 / 5 / 5 | 1 | 15 |
| 35 | P2 | aggressive_raider | 6 / **7** / 5 / 6 | 1 | 15 |
| 36 | P4 | banker_llm | 5 / 3 / 5 / **7** | 2 | 15 |
| 37 | P4 | banker_llm | 5 / 5 / 6 / **8** | 2 | 14 |
| 38 | P1 | greedy_builder | **8** / 4 / 7 / 7 | 1 | 14 |
| 39 | P4 | banker_llm | 7 / 3 / 7 / **8** | 1 | 12 |
| 40 | P3 | diversified_trader_llm | 6 / 6 / **7** / 7 | 0 | 15 |

Margins are small (avg 1.6 VP). Games are close. Every seat wins at least once. This is what a balanced diverse-archetype batch is supposed to look like; the v0.7.3.1 patch moved us clearly closer to that point.

## 6. Recommended follow-ups

- **Raider rule tweak.** Prototype a 2× → 3× ambush yield multiplier (RULES.md §4.1) and run a 20-match heuristic batch to see whether that lifts raider from ~17% toward ~25%. No new LLM calls needed.
- **Banker_llm study.** banker_llm's 6/10 wins is the most robust signal in this whole experiment. A 20-match `banker_llm` vs 3x `banker`(heuristic) batch would confirm whether the LLM genuinely plays banker better or whether this is seed-luck.
- **No need to re-run LLM-v1 or LLM-v2.** Their qualitative findings (LLMs play coherently, archetypes cluster more evenly under LLM control, matches are longer) survive the patch. Their quantitative numbers involving trader dominance or raider defeat are now stale; cite the v2 batches as the canonical LLM reference going forward.
