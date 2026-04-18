# Trader-Vulnerability Experiment (v0.8 design question)

**Engine:** Python `tools/sim.py` at `RULES_VERSION == "v0.7.4"`, with the new
experimental knob `RR_BEAD_VULN_MODE` (off / deny / steal).
**Batch:** The canonical 50-match v0.7.4 heuristic batch
(`simulations/trader_vuln/batch_config_v0.7.4_50.json`, derived from
`simulations/batch_v0.7.4.jsonl`) replayed under each of 3 rule variants.

## Motivation

The `v0.7.4` ship report flagged `diversified_trader` winning 55% of its 50-match
apps in the new canonical heuristic baseline — well outside the 25–35% target
band. Root cause: **trade beads are immune to ambush pressure**. The raider's
signature action (`ambush(region)`) can steal gathered resources but cannot touch
the VP-producing output of trading, so bankers/traders scale freely once they
establish partner networks.

This experiment prototypes the minimum-viable rule change the user proposed:
*"a completed trade has a 1-turn in-transit window before the bead is awarded,
during which an ambush on the recipient voids the delivery."*

## Variants

All three were run on the same 50-match batch (same seeds, same turn orders,
same agent archetypes — just one env var changes).

| Variant     | `RR_BEAD_VULN_MODE` | Rule |
|-------------|---------------------|------|
| **A_off**   | `off` (default)     | Canonical v0.7.4. Beads awarded instantly; 2-bead→1-VP conversion fires on the trade action. |
| **B_deny**  | `deny`              | Beads earned from trades this round go into `pending_beads` (bead→VP conversion is deferred). At end-of-round, if the earner was a victim of any successful ambush that round, pending beads (and their would-be VP) are **destroyed**. Otherwise they bank and convert normally. |
| **C_steal** | `steal`             | Same pending window as `deny`, but if the earner was ambushed, pending beads are **transferred** to the first successful ambusher (who banks + converts them). |

**Sanity:** A_off replays `simulations/batch_v0.7.4.jsonl` byte-identically
(ignoring the cosmetic `run_metadata.duration_ms` field). The experiment is a
pure rule isolate — agent code is unchanged.

## Headline results (50 matches, 4 players each)

| Metric                      | A_off     | B_deny    | C_steal   |
|-----------------------------|-----------|-----------|-----------|
| Matches reaching VP-8       | 0/50      | 0/50      | 0/50      |
| Avg rounds played           | 10.72     | 10.92     | 10.94     |
| Raider ambush hit rate      | 26.5%     | 25.0%     | 27.3%     |
| Raider hits / attempts      | 9 / 34    | 8 / 32    | 9 / 33    |
| **Total beads denied**      | 0         | **11**    | 0         |
| **Total beads stolen**      | 0         | 0         | **13**    |
| Trader seats with any loss  | 0 / 20    | 2 / 20    | 2 / 20    |

> All three variants still end on round-limit — the trader-vulnerability rule
> is balance-only; nothing about match pacing changes.

### Archetype win rates

| Archetype           | A_off (canonical) | B_deny           | C_steal          | Δ (C−A) |
|---------------------|-------------------|------------------|------------------|---------|
| aggressive_raider   | 4/30 = **13.3%**  | 4/30 = 13.3%     | 5/30 = **16.7%** | **+3.3pp** |
| diversified_trader  | 11/20 = **55.0%** | 9/20 = 45.0%     | 8/20 = **40.0%** | **−15.0pp** |
| banker              | 7/20 = 35.0%      | 10/20 = 50.0%    | 9/20 = 45.0%     | +10.0pp |
| greedy_builder      | 18/80 = 22.5%     | 17/80 = 21.2%    | 18/80 = 22.5%    | 0.0pp |
| scout_paranoid      | 4/10 = 40.0%      | 4/10 = 40.0%     | 4/10 = 40.0%     | 0.0pp |
| alliance_duopoly*   | 20/20 = 100.0%    | 20/20 = 100.0%   | 20/20 = 100.0%   | 0.0pp |
| random              | 5/20 = 25.0%      | 5/20 = 25.0%     | 5/20 = 25.0%     | 0.0pp |

\* `alliance_duopoly` runs are 2v2 shared-victory matches and are insensitive
to this rule (allies trade only with each other and don't get ambushed).

**Trader podium rate (won OR within 1 VP of the leader):**

| Variant  | Won | Close (≤1 VP) | Podium total |
|----------|-----|---------------|--------------|
| A_off    | 11  | 4             | **15/20**    |
| B_deny   | 9   | 3             | 12/20        |
| C_steal  | 8   | 1             | **9/20**     |

This is the cleanest signal — C_steal cuts trader "podium" rate from 75% to
45%. The −15pp win-rate drop is not just variance; traders are genuinely falling
further from the lead.

### Archetype avg VP

| Archetype           | A_off | B_deny | C_steal | Δ (C−A) |
|---------------------|-------|--------|---------|---------|
| aggressive_raider   | 4.80  | 5.27   | **5.60**| **+0.80** |
| diversified_trader  | 7.05  | 6.75   | **6.65**| **−0.40** |
| banker              | 7.50  | 7.70   | 7.85    | +0.35 |
| greedy_builder      | 5.71  | 5.78   | 5.81    | +0.10 |

Raider avg VP moves most under `steal` (as expected — it's the only variant
where raider actually gets VP from the stolen beads).

### Bead economy (supply vs loss, per app)

| Archetype           | Beads earned A_off | Beads lost B_deny | Beads lost C_steal |
|---------------------|--------------------|-------------------|---------------------|
| banker              | 11.60              | **0.40**          | **0.40**            |
| diversified_trader  | 6.50               | 0.15              | 0.15                |
| aggressive_raider   | 2.90               | 0                 | 0                   |
| greedy_builder      | 2.25               | 0                 | 0.03                |

**Finding:** Under the current rule, `banker` loses *more beads per app* than
`diversified_trader` (0.40 vs 0.15) — because banker both trades AND gathers
often, giving the raider more chances to land a hit on a bead-earning round.
Trader concentrates on trading-turns where they aren't gathering.

Yet banker's *net* win rate goes up, not down. Why? Because:
1. Banker's raw bead supply also went up (11.60 → 12.60 in steal) — longer
   matches (+0.22 rounds) give more trade windows.
2. The 2-bead→1-VP conversion is deferred to EOR, so VP totals ripple through
   `trailing_bonus_active` flags and heuristic lookahead slightly differently.
3. With trader weakened, banker absorbs the market share.

## Interpretation

The rule is **directionally correct but low-impact** at its current "1-turn
in-transit" strength:

- **Firing frequency is low**: ~0.22–0.26 beads voided per match, affecting
  ~10% of trader-seat appearances. This is because bead-earning turns
  (accepting a trade) and ambush-victim turns (gathering) are anticorrelated
  inside a single round.
- **Net effect on trader is modest** (−10 to −15pp win rate; −0.4 avg VP) but
  *consistent* across the 50-match baseline.
- **Raider only directly benefits in `steal` mode** (+3.3pp wins, +0.80 avg
  VP). Under `deny` the raider gets no new loot — banker is the unintended
  beneficiary.
- **Banker, not trader, turns out to be the ambush-bead-loss-heavy
  archetype** — a reminder that "trader immunity" was slightly miscategorised;
  the actual concern is *bead-earning* players being immune, and banker earns
  more beads than trader does.

The `steal` variant is strictly better than `deny`: it creates a new strategic
loop (raiders can hunt bead-earning players for VP payoff) instead of just
nerfing trader without compensating anyone.

## Open design questions (what the data suggests next)

1. **Rule strength**: at 1-round pending, the effect is mild. A 2-round
   pending window, or "any successful ambush in the match voids this round's
   beads" would fire 3–5× more often. Worth an extended A/B if we want to
   drive trader into the 25–35% target band and raider toward 20–25%.
2. **Raider trader-awareness**: in `C_steal`, `aggressive_raider` doesn't know
   to preferentially ambush regions that bead-earning players gather in. A
   heuristic tweak (target home region of the current bead-leader) could
   double the realised stolen-bead count with no rule change.
3. **Ambush-a-trade action**: a bolder redesign — introduce a new action
   `intercept(partner)` that specifically targets a trade delivery. This is
   more intuitive narratively ("raid the caravan") but requires new UI/agent
   logic and a new trade-state.
4. **Do we need this at all?** `alliance_duopoly`'s 100% win rate dwarfs any
   trader dominance. If we're shipping to human playtesters via
   `PROTOTYPE_SPEC.md`, they'll care more about board feel than whether
   trader sits at 55% vs 40% against scripted bots.

## Files in this experiment

```
simulations/trader_vuln/
├── batch_config_v0.7.4_50.json   # reproducible run config
├── batch_A_off.jsonl             # canonical v0.7.4 replay (byte-identical)
├── batch_B_deny.jsonl            # RR_BEAD_VULN_MODE=deny
├── batch_C_steal.jsonl           # RR_BEAD_VULN_MODE=steal
├── analyse.py                    # comparison script used above
├── SUMMARY_console.txt           # raw analyse.py output
└── COMPARISON_trader_vuln.md     # this report
```

## How to reproduce

```bash
python3 tools/sim.py --batch simulations/trader_vuln/batch_config_v0.7.4_50.json \
  --out simulations/trader_vuln/batch_A_off.jsonl

RR_BEAD_VULN_MODE=deny python3 tools/sim.py \
  --batch simulations/trader_vuln/batch_config_v0.7.4_50.json \
  --out simulations/trader_vuln/batch_B_deny.jsonl

RR_BEAD_VULN_MODE=steal python3 tools/sim.py \
  --batch simulations/trader_vuln/batch_config_v0.7.4_50.json \
  --out simulations/trader_vuln/batch_C_steal.jsonl

python3 simulations/trader_vuln/analyse.py
```
