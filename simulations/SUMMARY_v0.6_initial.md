# Rogue Rivals simulation summary (v0.6 initial batch)

## Run overview
- Total matches run: **50**
- Matches passing validation: **50** (100%)
- End-trigger distribution: round_limit=50 (100%)
- Average match length (final round index): **15.00** rounds

## Win rate by tribe
- **brown**: 46.0% (23/50)
- **grey**: 6.0% (3/50)
- **red**: 4.0% (2/50)

## Win rate by agent archetype
- **banker**: 40.0% (20/50)
- **random**: 8.0% (4/50)
- **scout_paranoid**: 8.0% (4/50)

## Trading network
- Average trades per match: **0.40**
- Distinct trade pairs observed (aggregated): **4**
- Pair-share entropy (rough evenness): **1.386** on **20** completed trades

## Ambush / scout (batch totals)
- Attempted / hit / scouted / expired: **171 / 0 / 39 / 131**

## Comebacks
- Trailing-flag win rate: **0.0%** (0/50)
- Avg leader changes / match: **1.52**

## Top findings (from this batch)
1. Most matches ended via **`round_limit`** (100%), which dominates effective pacing vs the 15-round hard cap.
2. Tribe wins are uneven in this sample: **brown** leads (46%) vs **red** (4%) — treat as exploratory given archetype/tribe co-rotation.
3. Trading stays active but not extreme (**0.4** trades/match; entropy **1.39** over **20** trades), suggesting negotiation matters but does not saturate every edge.

## Rule ambiguities / implementation choices
- **VP threshold** ends immediately after the triggering turn; later seats in that round do not act; **end_of_round_resolution** still runs once.
- **Great Hall** ends after the **full** round completes.
- **Forge** picks the lexicographically smallest feasible 3-type bundle the player can pay.
- **Tribute routes** are represented structurally but **stock agents never propose them**, so tribute-driven dynamics are not sampled here.

## Anomalies / notes
- Deterministic agent RNG uses `stable_agent_rng(seed, round, seat)` (not the global `random` module).
- `--validate` on JSONL checks schema §6.1 aggregates plus `vp_curve` tails vs `outcome.final_scores`.
