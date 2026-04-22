# Rogue Rivals v2.1 — Balance & Behavior Proposal

**Status:** proposal, not yet adopted
**Baseline:** `RULES.md` v2.0, observed in `simulations/v2_6p_batch_legal_rerun/`
**Scope:** balance + diplomacy + trade + persona + pacing adjustments. No change to wire format, map generation, or core order grammar.

---

## 1. Problem baseline

Three seeded 20-tick batch matches (`v2_6p_batch_legal_rerun/batch_summary.json`, seeds 202604191–3, 6 LLM tribes, distinct personas) show:


| Metric                                                         | Observed                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------- |
| Matches reaching a winner                                      | 0 / 3                                                             |
| Total tribe eliminations (across 60 match-ticks)               | 1 (on the final tick of match_000)                                |
| Combat events per match                                        | ~8                                                                |
| Attacker win rate                                              | 0% (all resolved combats were ties or attacker-destroyed)         |
| Trade proposals accepted successfully                          | 0 (`trade_accept_failed: sender_insolvent` recurs every ~2 ticks) |
| LLM legal-option error rate                                    | 10–20% of calls                                                   |
| NAP proposals in tick 1 of match_000                           | 14 (every tribe to every other tribe)                             |
| Orange (warlord) Influence production, tick 1 → tick 20        | 6 → 27 per tick                                                   |
| Brown (merchant_prince) Influence production, tick 5 → tick 20 | flat at 4 per tick                                                |


### Root causes (condensed from the critique)

1. **NAP peace-lock.** Proposals are free, default length is 8 ticks, and there's no cooldown. Tribes blanket-propose on tick 1 and the map is diplomatically frozen by tick 3.
2. **Defender stack is too strong.** +1 own region + +1 fort = equal-tier attacker loses in any home region. Garrison cap blocks reinforcement. Attackers never win, so combat is punished and peace dominates.
3. **Trade is broken at the accept step.** Sender is debited at accept time, by which point same-tick recruits/builds have spent the Influence. Trades never complete.
4. **Personas don't diverge mechanically.** Flavor lives in prompts only; all personas have the same cost tables, the same orders, the same affordances.
5. **Pace + tiebreaker.** Non-military victories require 3 ticks of sustain; the peace-lock prevents the conditions ever being met long enough. 60-tick matches will almost always go to weighted-score tiebreak.
6. **Message volume is noise.** 16 messages in a single tick, most templated LLM filler. Messages carry no mechanical weight.
7. **LLM legal-option drift.** Options like `propose:nap:orange:8` are rejected repeatedly; errors don't surface legal alternatives, so the LLM never self-corrects.

---

## 2. Proposed changes

Each change lists: **what → where → why → how we'll know it worked**.

### 2.1 Break the NAP peace-lock — gate diplomacy on visibility

Instead of adding artificial cost/cooldown/delay levers, tie inter-tribe proposal formation to the fog-of-war system. This aligns diplomacy with an existing GDD pillar rather than bolting friction on top.

- **Proposal dispatch requires proposer → target visibility.** Proposer must currently see a region owned by the target tribe (via own regions + adjacency, scouts, watchtower, or `shared_vision` pact).
- **Proposal acceptance requires target → proposer visibility at response time.** Symmetric rule on the accepting side. Net effect: both parties must have seen each other at some point in the propose → accept window.
- **Maintenance does not require visibility.** Once a NAP is formed, it holds for its full length even if a scout expires or a watchtower is lost. Rationale: pacts shouldn't silently dissolve on info loss; that would punish scout investment and create spooky-action-at-a-distance.
- **Applies to `nap`, `shared_vision`, and `trade_offer` proposals.** Consistency — all inter-tribe proposals gated on seeing the other side.
- **Reduce `DEFAULT_NAP_LENGTH`: 8 → 4 ticks.** `packages/engine2/src/constants.ts:151`. Orthogonal to visibility — about renewal pressure, not formation spam.

**Expected effect on the baseline batch:** tick 1 blanket-NAPs are literally impossible (no tribe sees any other at tick 1). First proposals emerge ~tick 3–5 once initial scouts resolve. Distant tribes stay diplomatically dark until someone invests in reach. Watchtowers and `shared_vision` gain a real strategic role as diplomatic amplifiers.

**Files:**
- `packages/engine2/src/tick.ts` — add visibility checks in propose-dispatch and respond-accept resolution.
- Visibility / fog-of-war module under `packages/engine2/src/` — expose a `canSee(observerTribe, targetTribe, state): boolean` helper.
- `packages/server/src/autoplay/llmOpponent.ts` — legal-option enumeration must omit proposals to invisible tribes (otherwise LLMs get legal-option drift on unreachable targets).

**Subsumed and dropped:** `NAP_PROPOSAL_COST`, `NAP_COOLDOWN_TICKS`, `NAP_EARLIEST_PROPOSAL_TICK`. The visibility gate makes all three redundant — there are no invisible tribes to spam, no blanket-tick-1 proposals to cooldown, and no pre-contact ticks in which a NAP could form.

### 2.2 Rebalance the defender stack

- `**COMBAT_FORT_BONUS`: 1 → 0**, OR cap `fort_home_combined_bonus = 1`. `packages/engine2/src/constants.ts:85`. Defender already has terrain, garrison recruit, and ally-reinforcement options; stacking fort on top makes home regions unbreakable at equal tier.
- **Allow multi-force attacker stacking at the combat tick.** Current `arrival_rejected_garrison_cap` fires 6+ times per match, often blocking the second wave of an attack. Update force-arrival resolution in `tick.ts` to combine co-arriving attackers before applying the garrison cap.
- **Attacker scout-intel bonus: +1 when attacker scouted the target ≥2 ticks before force arrival.** Mirrors the existing `COMBAT_SCOUT_REVEAL_PENALTY = -1`. Gives scouts offensive utility and rewards planning.

### 2.3 Fix trade with escrow

- **Escrow at propose-time, not accept-time.** Debit sender's Influence when a `trade_offer` proposal dispatches; refund on decline/expiry. Use the `CARAVAN_DECLINE_REFUND_FRACTION = 0.5` pattern from `constants.ts:100` for decline.
- Files: `packages/engine2/src/tick.ts` (proposal handler), `packages/shared/src/engineTypes.ts` (Proposal type to record the escrowed amount).
- Merchant-style personas (Brown/merchant_prince) need a working primary verb. Without escrow, trade is vaporware.

### 2.4 Make personas mechanically distinct

Flavor in prompts is not enough. Give each persona a small mechanical kit:


| Persona                 | Kit                                                     |
| ----------------------- | ------------------------------------------------------- |
| `warlord`               | −1 Influence on Tier II/III recruit                     |
| `merchant_prince`       | −1 on `trade_offer` dispatch, −1 on caravan send        |
| `paranoid_isolationist` | +1 defender bonus in home regions (stacks with terrain) |
| `frostmarshal`          | −1 tick on force travel through mountains               |
| `veilweaver`            | scouts dwell 2 ticks instead of 1                       |
| `opportunist`           | +1 Influence bounty on region capture                   |


- New file: `packages/engine2/src/personas.ts` (kit table + cost/bonus lookup helpers).
- Integrations in `tick.ts` cost/combat/scout resolution.
- Match config gains a `persona_kit` field so kit can be swapped independent of tribe color.

### 2.5 Speed up the clock

- **Reduce victory sustain from 3 → 1 tick** for diplomatic, economic, and territorial wins. `tick.ts` victory check. With the peace-lock lifted, sustain-3 becomes achievable again, but sustain-1 guarantees the paths can actually trigger.
- **Add late-game region-yield decay.** New constants `YIELD_DECAY_START_TICK = 30`, `YIELD_DECAY_PER_TICK = 0.05` (multiplicative, floor at 1 Influence/region). Accumulation becomes unsustainable past tick 30; dominant tribes must commit or lose their lead.
- `**DEFAULT_TICK_LIMIT`: 60 → 40** once yield decay lands. `constants.ts:149`. Matches finish in a reasonable number of LLM calls.

### 2.6 Give messages mechanical weight

- **Optional `commitment` on messages.** Payload shape: `{ kind: "no_attack" | "no_scout", target_region_id: string, length_ticks: number }`. Breaking a commitment triggers the same reputation penalty as pact-break.
- Files: `packages/shared/src/engineTypes.ts` (Order + message payload), `tick.ts` (commitment tracking and break detection).
- **Cap at 3 messages per tribe per tick.** `tick.ts` order validation. Observed peak is 16 in a single tick; the cap forces LLMs to pick signal.
- Commitments turn free chat into a diplomatic ledger — lies become detectable and costly, which is what the GDD's "diplomatic double-life" pillar asked for.

### 2.7 Widen LLM legal-option grammar + improve error feedback

- **Accept NAP lengths in `[3, 8]`, not just `8`.** `packages/server/src/autoplay/llmOpponent.ts` legal-option enumeration. Current LLMs keep emitting `propose:nap:orange:8` even when a different length is canonical.
- **Surface legal alternatives in error responses.** Instead of `unknown legal option id: propose:nap:orange:8`, include the set of legal NAP length ids for that proposer/target. Current errors are dead-ends — the LLM cannot self-correct next tick because it doesn't know what would have worked.
- **Investigate mid-match message rejections.** Diagnostics show e.g. `message:tricoloured:Glad we see eye to eye` rejected despite being valid syntax. Audit `llmOpponent.ts` legal-set generation for mid-match contexts.

---

## 3. Rollout order

Phased to de-risk and allow A/B attribution of each effect.


| Phase                      | Scope                                                                                  | Expected impact                                      |
| -------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **A — Diplomacy squeeze**  | 2.1 (visibility-gated proposals + shorter NAP length), 2.7 (legal grammar), 2.6 cap-only (message cap, no commitments yet) | Tick-1 NAP spam eliminated by fog; first proposals emerge after initial scouts; first real combats by tick 8–10 |
| **B — Combat rebalance**   | 2.2 (defender stack), 2.3 (trade escrow)                                               | Attacker win rate > 0; merchant persona functional   |
| **C — Pace + commitments** | 2.5 (sustain + decay + cap), 2.6 commitments                                           | Winners reached; commitments give messages teeth     |
| **D — Persona kits**       | 2.4                                                                                    | Persona variance visible in match traces             |


At each phase boundary, re-run the seed triplet (202604191, 202604192, 202604193) and diff against baseline.

---

## 4. Verification

Baseline is the `v2_6p_batch_legal_rerun` summary. Targets after all four phases land:


| Metric                           | Baseline (v2.0) | Target (v2.1 complete) |
| -------------------------------- | --------------- | ---------------------- |
| Winner reached                   | 0 / 3           | ≥ 1 / 3                |
| Tribes eliminated before tick 20 | 0               | ≥ 2                    |
| Combat events per match          | ~8              | ≥ 15                   |
| Attacker win rate                | 0%              | ≥ 30%                  |
| Trade successes per match        | 0               | ≥ 3                    |
| LLM error rate                   | 10–20%          | ≤ 5%                   |
| Orange Influence/tick at tick 20 | 27              | ≤ 18                   |
| Messages per tick (peak)         | 16              | ≤ 18 (3 × 6)           |


Store phase outputs under `simulations/v2_1_phaseA/`, `/phaseB/`, etc. to keep diffs cleanly side-by-side.

---

## 5. Out of scope

- Map generation tuning (region counts, terrain weights).
- Starting-Influence rebalancing beyond persona kits.
- Web/spectator UI changes.
- Combat variance (dice / random rolls) — v2.1 stays deterministic.
- Rewriting `RULES.md` — only updated as a v2.1 delta once a phase is adopted.

---

## 6. Open questions

1. **Persona kits first, or prompt-only variance first?** Kits are a larger architectural change; it may be worth confirming prompt-only personas stay flat after Phases A–C before committing.
2. **Visibility gate — should `shared_vision` proposals be exempt?** Current draft gates them too (consistency). Counter-argument: `shared_vision` is itself a reveal mechanism, so letting an isolated tribe offer it unsolicited could be a legit broker play.
3. **Yield decay:** flat 5% per tick after 30, or stepped (10% after 45, 20% after 55)?
4. **Commitments:** same reputation stream as pact-break, or a separate `promise_break` event with its own penalty duration?

---

## 7. Non-changes

- Replay/trace JSONL format stays backward-compatible (new fields are additive).
- State-hash determinism preserved — all new constants and new fields are deterministic.
- GDD pillars (`orders in flight`, `diplomatic double-life`, `slow fog of war`) are strengthened, not replaced.

---

## Files referenced

- `packages/engine2/src/constants.ts` — balance constants (primary touchpoint for §2.1, §2.2, §2.5)
- `packages/engine2/src/tick.ts` — resolution logic (combat, diplomacy, trade, victory checks)
- `packages/shared/src/engineTypes.ts` — wire types (Proposal, Order, message payload)
- `packages/server/src/autoplay/llmOpponent.ts` — legal-option enumeration (primary for §2.7)
- `simulations/v2_6p_batch_legal_rerun/batch_summary.json` — baseline data
- `RULES.md` — v2.0 canonical rules (delta'd, not replaced)
- `GDD.md` — design pillars (unchanged)

