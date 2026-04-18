# LLM-A Mixed v1 — LLM vs Heuristic Exploit Test

**Hypothesis:** do fast / aggressive heuristics exploit the conservative LLM playstyle observed in `batch_llm_v2`?

## Design

- **Seats 1–4, same tribes / turn_order / seeds in both batches:**
  - **P1 — `greedy_builder`** (heuristic, fast-VP rush)
  - **P2 — `aggressive_raider`** (heuristic, raid-focused)
  - **P3 — `diversified_trader` ↔ `diversified_trader_llm`** (LLM in treatment)
  - **P4 — `banker` ↔ `banker_llm`** (LLM in treatment)
- **Seeds:** 31–40 (fresh, not used in earlier LLM comparisons)
- **n = 10 matches per condition**
- **Model:** `glm-4.6` via Z.AI, 5 parallel workers, `batch_id = batch_llm_mixed_v1`

**Files**

- Control: `simulations/batch_mixed_v1_heuristic.jsonl` (generated via `tools/sim.py --batch simulations/mixed_v1_heuristic_config.json`)
- Treatment: `simulations/batch_llm_mixed_v1.jsonl`
- Trace: `simulations/llm_trace_batch_llm_mixed_v1.jsonl`
- Transcripts: `simulations/TRANSCRIPTS_llm_mixed_v1.md`
- Configs: `simulations/mixed_v1_heuristic_config.json`, `simulations/mixed_v1_llm_config.json`

## Headline: per-seat win deltas (paired seeds)

| Seat | Agent (control → treatment) | Control wins | Treatment wins | Δ |
|---|---|---:|---:|---:|
| P1 | `greedy_builder` (unchanged) | 3 | **6** | **+3** |
| P2 | `aggressive_raider` (unchanged) | 1 | 0 | −1 |
| P3 | `diversified_trader` → `diversified_trader_llm` | 3 | 2 | −1 |
| P4 | `banker` → `banker_llm` | 4 | 3 | −1 |

> Shared victories counted in both buckets (1 shared win in each condition). Wins total > 10 accordingly.

**Aggregates**

- **Aggressive heuristics (P1+P2):** 4 wins → 6 wins  (**+2**)
- **Conservative seats (P3+P4):** 7 wins → 5 wins  (**−2**)

## Avg final VP by seat

| Seat | Control | Treatment | Δ |
|---|---:|---:|---:|
| P1 `greedy_builder` | 5.40 | **6.30** | +0.90 |
| P2 `aggressive_raider` | 4.10 | 3.10 | −1.00 |
| P3 `diversified_trader` → _llm | 5.70 | 5.70 | 0.00 |
| P4 `banker` → _llm | **7.00** | 5.30 | **−1.70** |

## Match pacing & endings

| Metric | Heuristic control | LLM mixed |
|---|---:|---:|
| Avg `final_round` | 8.20 | **13.60** (+65%) |
| Great Hall wins | 4 | 2 |
| VP-threshold wins | 6 | 6 |
| Round-limit wins | 0 | **2** |

LLM matches run ~65% longer, and 20% reach the round-limit (never happens in heuristic control).

## Economic activity (totals across 10 matches)

| Event | Heuristic control | LLM mixed | Δ |
|---|---:|---:|---:|
| `trade_proposed` | 279 | 221 | −21% |
| `trade_resolved` | 114 | 81 | −29% |
| `trade_rejected` | 129 | 98 | −24% |
| `bead_earned` | 219 | 162 | −26% |
| `bead_converted` | 102 | 76 | −25% |
| `ambush_triggered` | 4 | 6 | +50% |
| `ambush_expired` | 10 | 17 | +70% |
| `turn` (total) | 321 | 538 | +68% |

Trade and bead activity is moderately lower per match (trades/ambushes are ~75% of heuristic control), but total turn count jumps 68% because matches drag on much longer.

## Interpretation

### 1. Exploit hypothesis: partially confirmed

`greedy_builder` doubles its win rate (3 → 6) when facing LLM opponents. Its VP climbs +0.90. The LLM conservative tempo gives the rush-builder more clock to reach 8 VP or Great Hall before anyone can close the gap.

**This is a real exploit pattern** — humans playing cautiously could be outrun by a fast-VP specialist. If human players tend to play more like the LLMs than the heuristics (plausible based on v2's flowery persona transcripts), `greedy_builder`-style rushes would over-dominate at a live table.

### 2. LLMs did **not** collapse

LLM seats still won 5/10 matches combined. Against a 0-win aggressive raider and a strong greedy builder, they held their ground well enough. The loss is focused:

- `banker_llm` gave up −1.70 avg VP vs heuristic `banker`. The heuristic banker mechanically converts beads the moment conversion yields +1 VP; the LLM sometimes stockpiles or trades beads less opportunistically.
- `diversified_trader_llm` held par on VP (5.70) but lost 1 win. It's not weaker at accumulation — it's slower to cross the threshold.

### 3. `aggressive_raider` is broken regardless of opponent

- Heuristic control: 1 win / 10 (10% — matches the 0% it posted in archetype v2).
- LLM mixed: 0 wins / 10.

The raider is a heuristic liability in every setting we've tested. Interestingly, ambush events went **up** against LLM opponents (4 → 6 triggered, 10 → 17 expired). Raider gets more ambush *attempts*, but they don't convert to VP. This looks like a fundamental ambush-EV / resource-steal balance problem, not an opponent-dependent issue.

### 4. Game-design implication

The messaging-native thesis of Rogue Rivals bets on **trade and negotiation being the fun**. Yet:

- In heuristic play: trader + banker win 7/11 total wins — trading archetypes dominate.
- In LLM play: trader + banker drop to 5/10 — rush-builder picks up the difference.

If human playtests show LLM-like pacing, we should suspect the **Great Hall / 8-VP threshold is reachable too cheaply by pure build-rush**, and consider either: (a) making Great Hall more expensive or requiring trade-milestones, (b) boosting the Bead → VP rate so conversion-focused play closes faster, (c) adding a tempo pressure that punishes prolonged gathering phases.

## Cost & operational

- 10 matches, 5 workers, **9m 48s wall**, ~$0.35
- ~388k input / 54k output tokens via Z.AI
- No process crashes; `caffeinate -i` + resumable runner held up cleanly
- Raw trace: `simulations/llm_trace_batch_llm_mixed_v1.jsonl`

## Suggested follow-ups

- **Direct investigation: why is `aggressive_raider` broken?** Examine ambush EV math in `RULES.md`. Possibly raise steal yield or lower ambush cost.
- **Tune LLM pacing** — add "closing pressure" guidance to personas' system prompts to encourage VP-threshold awareness. Does it narrow the `greedy_builder` exploit?
- **Symmetric mixed test** — swap seat assignments (LLMs at P1/P2, heuristics at P3/P4) to rule out seat / tribe interactions. The +3 delta for P1 is not a turn-order artifact: P1 goes last/2nd in 7/10 matches (avg turn position 2.70 of 4), so its win-rate boost vs LLMs is real strategic exploitation, not seat priority.
- **Scale up** — run n=30 matches to tighten the 2-win delta into a confident signal.
