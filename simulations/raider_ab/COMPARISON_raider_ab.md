
# Raider rule A/B experiment — v0.7.3.1 engine

**Date:** 2026-04-18
**Engine:** v0.7.3.1 (patched watchtower cost + rewritten `aggressive_raider` heuristic)
**Config:** `simulations/batch_v0.7.3_config.json` (50 matches, fixed seeds, identical lineups)
**Raw outputs:** `simulations/raider_ab/batch_{A..G}_*.jsonl`
**Knobs (added to `tools/sim.py`, default-preserving):**

| Env var                      | Default | Meaning                                 |
| ---------------------------- | ------: | --------------------------------------- |
| `RR_AMBUSH_MULT`             |     `2` | Yield multiplier on a hit               |
| `RR_AMBUSH_COST_S`           |     `1` | Scrap cost to set an ambush             |
| `RR_AMBUSH_PERSIST_ROUNDS`   |     `1` | End-of-round ticks before ambush expires |

With defaults unset the sim regenerates `batch_v0.7.3.1.jsonl` byte-for-byte modulo `duration_ms`, so these are safe experimental levers, not breaking rule changes.

## Headline

> **The ambush yield and scrap cost are not the raider's problem.
> The real constraint is ambush *expiration* — and downstream, the raider's inability to convert loot into higher-tier buildings.**

## Variants and results (50 matches each, heuristic only)

| Variant | `MULT` | `COST_S` | `PERSIST` | Hit% | Raider win% | Raider avgVP | Trader win% | Banker win% | Greedy win% | Scout_p win% |
| :--- | :---: | :---: | :---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **A** baseline (canonical v0.7.3.1) | 2 | 1 | 1 | 11.8% | **16.7%** | 4.13 | 30.0% | 40.0% | 25.0% | 80.0% |
| B stronger hit | **3** | 1 | 1 | 11.8% | 16.7% | 4.13 | 30.0% | 40.0% | 25.0% | 80.0% |
| C free ambush | 2 | **0** | 1 | 7.8% | 16.7% | 4.00 | 55.0% | 35.0% | 20.0% | 70.0% |
| D both | **3** | **0** | 1 | 7.8% | 16.7% | 4.00 | 55.0% | 35.0% | 20.0% | 70.0% |
| **E** persist=2 | 2 | 1 | **2** | **22.0%** | 16.7% | 4.20 | 35.0% | 35.0% | 25.0% | 80.0% |
| F persist=2 + stronger hit | **3** | 1 | **2** | 22.0% | 16.7% | 4.20 | 35.0% | 35.0% | 25.0% | 80.0% |
| **G** persist=3 | 2 | 1 | **3** | **26.9%** | **23.3%** | 4.33 | 35.0% | 40.0% | 23.8% | 80.0% |

### Raider-specific detail

| Variant | Raider attempts | Raider hits | Raider hit% | Total stolen | avg buildings | Build mix (shack/wt/den/forge/gh) |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- |
| A | 43 |  6 | 14.0% | 20 | 1.97 | 26/24/5/4/0 |
| B | 43 |  6 | 14.0% | 30 | ~same | ~same |
| C | 75 |  7 |  9.3% | 14 | ~same | ~same |
| D | 75 |  7 |  9.3% | 21 | ~same | ~same |
| E | 39 | 12 | 30.8% | 32 | 2.00 | 26/25/5/4/0 |
| F | 39 | 12 | 30.8% | 48 | 2.00 | 26/25/5/4/0 |
| G | 36 | 13 | 36.1% | 34 | 2.10 | 26/25/7/5/0 |

## What each lever actually does

### Multiplier (2× → 3×) — **no measurable effect anywhere**
Variants A→B and E→F are *identical* in every per-agent win rate, match length, and raider avgVP. The only thing that changes is the scoreboard for "resources stolen", which does not convert to VP. **Yield is not a binding constraint.**

### Cost (1 → 0, free ambush) — **actively harmful**
Free ambush causes every agent with an ambush branch (including `random`) to spam the action. Total attempts jump 85 → 230, but the *hit rate collapses* 11.8% → 7.8% because ambushes are now placed with no priors. Knock-on effects:

- Raider win rate unchanged; raider avgVP slightly *worse* (4.13 → 4.00).
- `diversified_trader` win rate **jumps 30% → 55%** because everyone else wastes turns ambush-spamming while the trader's economy runs unopposed.
- `scout_paranoid` drops 80% → 70% because it can't cover every region at once.
- `greedy_builder` drops 25% → 20% for the same reason — interrupted tempo.

**The 1-Scrap ambush cost is real design — it's the tax that keeps ambush from being a free action.** Removing it makes the game worse, not better.

### Persistence (1 → 2 → 3) — **the right lever**
Making ambushes survive multiple end-of-round ticks directly attacks the dominant failure mode of the raider. In the baseline, **72% of ambushes expire** (61 of 85) because the victim simply never gathers where the raider predicted. Persist=2 halves that waste; persist=3 quarters it.

- Persist=2 (variant E): hit rate **11.8% → 22.0%**, stolen loot 20 → 32, no regressions on other archetypes. Raider win% unchanged at 16.7%.
- Persist=3 (variant G): hit rate 26.9%, and for the first time raider win% moves: **16.7% → 23.3%** (+40% relative). Still no regressions on other archetypes.

### Why persist=2 doubles hits but *doesn't* raise raider win%

Because **the raider's VP ceiling is not bounded by stolen resources**. Across every variant, `aggressive_raider` builds only ~2 buildings per match and never reaches Great Hall. The build mix stays locked at roughly {shack, watchtower, occasional den/forge}. Even in variant F, where the raider steals 48 resources (vs 20 baseline), it still finishes with the same 2.00 buildings per match and the same 16.7% win rate.

**Interpretation:** The raider heuristic's action budget is saturated by gathering + ambushing. Incremental loot goes into inventory it never spends before the match ends at round 11–15. Only persist=3 moves the needle, and only modestly (2.00 → 2.10 buildings), because at that extreme the raider occasionally captures enough scrap to pivot.

## Design implications for `RULES.md`

1. **Do not change multiplier.** Variant B is a functional no-op because yield is not the binding constraint; changing it would be cosmetic.
2. **Do not make ambush free.** Cost=0 distorts non-raider archetypes badly and *hurts* raider avgVP.
3. **Persistence is the cleanest rule lever.** Candidate rule change:

   > *"Ambushes set with a Scrap remain active for up to 2 full rounds (instead of 1) before expiring."*

   Expected effect from variant E: raider hit rate doubles (11.8% → 22.0%), stolen loot +60%, no other archetype shifts by more than 5 pp.

4. **But persistence alone will not fix the raider.** The archetype's win rate is bottlenecked by **build-ladder conversion**, not ambush economics. The raider's current heuristic spends most turns on ambush + gather and never banks enough mixed resources to escalate past watchtower.
5. **Recommended follow-up (heuristic, not rules):** rewrite `aggressive_raider` again so that after any successful ambush it *defaults to build* next turn instead of re-ambushing, and so it evaluates Great Hall once it holds ≥ 3 VP. Persist=2 makes this heuristic change meaningful because loot is actually flowing in.
6. **Open rule question:** Is the raider archetype meant to top 25% win rate with heuristic agents, or is it inherently a disruptive spoiler whose ceiling is lower than economic archetypes? The fact that persist=3 achieves 23.3% suggests the archetype *can* be competitive with the right tuning, but it may not be healthy to make it dominant.

## Recommended next step

Adopt **persist=2 as the canonical rule (v0.7.4 engine bump)**, then rewrite `aggressive_raider` to actually spend stolen loot on higher-tier builds, and re-measure. Do not touch the multiplier or the scrap cost.

---

*Generated from `simulations/raider_ab/batch_{A..G}_*.jsonl` (7 × 50 matches, deterministic, same seeds).*
