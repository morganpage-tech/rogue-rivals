# ROGUE RIVALS ? Playtest Protocol

**Target ruleset:** `RULES.md` v0.7.3
**Companion docs:** `GDD.md`, `RULES.md`, `PROTOTYPE_SPEC.md`
**Audience:** Whoever runs playtest sessions and analyses results

> **Principle:** Playtest finds what simulation can't ? whether the game is *fun*, not just *balanced*. Bring a notebook, not a spreadsheet.

---

## 0. What we're trying to learn

After 6 simulation passes (v0.6 ? v0.7.3), we know the game is **balanced and terminating**. What we don't know is whether it's **fun**. Playtesting answers these specific questions:

### Primary questions (must answer)

1. **Does a full match feel worth the time?** Target: average ?12-round match ? 10?20 min of real-time attention. Is that a satisfying arc?
2. **Does the trade negotiation carry the social fiction?** Or does it feel like spreadsheet optimization?
3. **Does the "thread is the game" UX survive being simulated in-app?** Or does it need real messaging for the fiction to click?
4. **Are all four actions (Gather, Build, Ambush, Scout) meaningfully used by real players?** Simulation shows Ambush and Scout are rare; is that a rule problem or a bot problem?
5. **Do players feel like they're making decisions, or executing an optimal script?**

### Secondary questions (nice to answer)

6. Do players actually diversify trade partners, or do they form 1-on-1 lanes?
7. Does Great Hall feel like a satisfying win condition, or a coin-flip?
8. Does losing feel fair? (Blowouts vs close matches)
9. Does the Trailing Bonus / Tribute Route mechanic get used? (Simulation says 6% ? expected behavior in humans?)
10. Is the fox-tribe theming legible and appealing, or forgettable?

### What we are NOT trying to answer in early playtests

- Final art direction
- UI polish (buttons, animations, fonts)
- SMS/RCS carrier integration
- Balance at the margins (Tribe X beats Tribe Y by 3%)

Early playtest signal is qualitative. Resist the urge to over-measure.

## 1. Session formats

Two formats. Run both.

### 1.1 Paper playtest (preferred before M2 ships)

**When:** As soon as you want feedback. Can happen this week.
**Group size:** 3 or 4 players around a table
**Duration:** ~45?60 min including brief and debrief
**Materials:** Rule summary card, tribe reference sheets, resource tokens, building cards, bead/VP trackers, dice for tiebreakers

Advantages over digital:
- Zero engineering dependency
- Negotiation is literal face-to-face conversation ? strongest signal on the "trade fiction" question
- Rule ambiguities surface immediately
- Observer can watch expressions, table talk, frustration points directly

Disadvantages:
- Can't test the "thread is the game" UX fiction
- Slower pace than the target async cadence
- Small sample size is very small (one table = 3?4 data points)

### 1.2 Digital playtest (after M3 ships)

**When:** M3 acceptance met per `PROTOTYPE_SPEC.md §14`
**Group size:** 3 or 4 remote players
**Duration:** 24?72 hours wall-clock (async turns); actual attention ? 15?30 min distributed
**Setup:** Host creates match, sends 3 magic links, everyone plays at their own pace

Advantages over paper:
- Tests the real async UX
- Generates a proper SIMULATION_SCHEMA log that can be compared to simulator baselines
- Lower coordination cost (no scheduled time together)

Disadvantages:
- Negotiation via thread is different from face-to-face
- Harder to observe (observer has to infer from log + feedback form)
- Drop-out risk is real

## 2. Paper playtest kit

Full kit to assemble before session 1. Once built, it's reusable.

### 2.1 Rule summary card (single-page, both sides)

**Front ? "Your turn"**

```
1. FREE (any order, any number):
   ? Propose trades (expire at your next turn)
   ? Accept / reject / counter pending offers

2. ACTION (exactly one):
   ? GATHER a region
   ? BUILD a building
   ? AMBUSH a region (costs 1 Scrap)
   ? SCOUT a region (reveals ambushes)
   ? PASS

Win: first to 8 VP, or build Great Hall, or most VP at round 15.
```

**Back ? "Quick reference"**

```
REGIONS: plains (T), mountains (O), swamps (F), desert (Rel), ruins (S)
Home yield: 2  |  Away yield: 1  |  Ruins yield: 1

BUILDINGS (VP ? cost):
  Shack        1 VP   1 home + 1 Scrap        +1 home gather
  Den          1 VP   1 home + 1 non-home + 1 Scrap   +1 home gather (stacks)
  Watchtower   2 VP   2 of any + 1 Scrap      Block 1 ambush/round
  Forge        2 VP   3 different + 1 Scrap   +1 gather everywhere
  Great Hall   4 VP   1T+1O+1F+1Rel+2S        Ends match

BEADS: +1 per trade (max 2/round).  Every 2 beads = +1 VP.
```

### 2.2 Tribe reference sheets (4 cards)

One per tribe. Same info for each, just colors/flavor differ.

```
???????????????????????????????
?  ORANGE FOXIZ               ?
?  Home: Plains  ?  Timber    ?
?  Start: 2 Timber            ?
?                             ?
?  Starting stockpile:        ?
?  T:2  O:0  F:0  Rel:0  S:0  ?
?  Beads: 0  VP: 0            ?
???????????????????????????????
```

(Same for Grey/mountains/Ore, Brown/swamps/Fiber, Red/desert/Relics.)

### 2.3 Tokens / trackers

- **Resource tokens:** 30 of each resource type (T/O/F/Rel), 20 Scrap tokens in a shared pool. Coloured poker chips or bead bags work fine.
- **Bead tokens:** 12 per player (won't run out)
- **VP tracker:** a d20 per player flipped to show current VP, or a simple 0?15 track
- **Round tracker:** a d20 in the middle of the table counting down from 15 to 0, or crossing off 1?15 on a shared sheet
- **Building cards:** 5 cards per player (Shack, Den, Watchtower, Forge, Great Hall) flipped face-up when built

### 2.4 Optional print-and-play map

Not strictly required ? players can just know "there are 5 regions" ? but a printed map helps the spatial fiction.

## 3. Running a session

### 3.1 Roles (for a 3-player session with 1 observer)

- **Facilitator:** explains rules, answers questions, resolves disputes. Does NOT play.
- **Observer:** silently watches. Takes notes per §4.
- **Players:** 3?4 people who have never played before (for first sessions) or once before (for returning sessions).

Facilitator and observer can be the same person if you have to. Don't let a player also facilitate ? decisions get biased.

### 3.2 Pre-session brief (?5 min)

Do NOT read the rules out loud. Hand players the rule summary card and say:

> "This is a turn-based negotiation game. You have 15 rounds to be the first to 8 victory points ? by building stuff or by trading with each other. Every turn you do exactly one action: gather, build, ambush, or scout. You can also propose trades any time, and they're free. Most of the game is the trading. Read the card; I'll answer questions."

Give them 2 minutes with the card. Answer any questions. Do NOT explain strategy. Don't tell them what's "good."

If anyone has played before, tell them not to coach.

### 3.3 Session structure

```
0:00   Brief
0:05   Question time (max 3 min)
0:08   Round 1 starts
0:08+  Play through ?15 rounds (expect ~45 min if rules summary worked)
0:50   Match ends
0:50   Debrief (§5)
1:10   Done
```

If the session is going sideways at round 3 ? confused players, nobody trading, rules repeatedly questioned ? **pause, diagnose, continue or restart.** Notebook the pause reason.

### 3.4 Facilitator ground rules during play

- Answer "can I do X?" yes/no based on `RULES.md`. If ambiguous, decide on the spot, write it down, resolve canonically after the session.
- Never say "that's a good idea" or "you probably want to do Y." No coaching, ever.
- Announce each round start: "Round 4. Orange, you're up."
- Refresh public events only: "Orange built a Watchtower. That's 2 VP." Don't announce private info.
- Enforce the trade expiration rule yourself ? it will be forgotten.

## 4. Observer notes template

Use this for every session. One per match.

```
SESSION: ______________________________   DATE: ____________
PLAYERS: Orange=_______  Grey=_______  Brown=_______  Red=_______
OBSERVER: ______________________________
RULESET VERSION: v0.7.3

????????????????????????????????????????????????????????????
ROUND-BY-ROUND NOTES
????????????????????????????????????????????????????????????
R1: (who did what, any notable moment)
R2:
R3:
...
R15 (or end trigger):

????????????????????????????????????????????????????????????
OBSERVATIONS
????????????????????????????????????????????????????????????

RULES CONFUSION (list every rule question, who asked, how resolved):
  ? "Can I...?" ?
  ? Mis-played rule ?

TRADES (roughly):
  Total proposed:       ___
  Total accepted:       ___
  Total counter-offered: ___
  Notable trade moment (biggest deal, most laughter, most argument):

AMBUSH / SCOUT:
  Ambushes attempted: ___   hit: ___   scouted: ___   expired: ___
  Was ambushing fun for ambusher? Frustrating for victim?
  Was Scout ever used proactively? Or only when player suspected?

BUILDING CHOICES:
  Who built what, in what order:
  Did anyone attempt Great Hall?

DECISION DENSITY:
  Were there moments a player clearly hesitated over a decision?
  Were there moments it felt automatic / scripted?

DOWNTIME:
  Did any player visibly disengage during another's turn? When?

EMOTIONAL MOMENTS:
  Laughter:
  Groans:
  Frustration:
  "Oh damn" / dramatic reactions:

END STATE:
  Winner: _____  by trigger: _____ (great_hall / vp_threshold / round_limit)
  Final VP: Orange ___ Grey ___ Brown ___ Red ___
  Match length in rounds: ___
  Match length in wallclock: ___ min

CROSS-REFERENCE TO SIMULATION:
  Avg simulated match: ~10.8 rounds, winner ~6.4 VP. How did this match compare?
```

Tape the filled sheet into a notebook. Don't transcribe until after the debrief ? raw notes are more honest.

## 5. Post-match debrief (10?20 min)

Ask in this order. Don't skip.

### 5.1 Free reaction (2 min)

> "Before anything else, how did that feel? One word each."

Write down each word verbatim. Don't prompt. Don't clarify. This is the most honest moment you'll get.

### 5.2 Fun probe (5 min)

Ask each player:

1. "What was the most fun moment in that match?"
2. "What was the least fun moment?"
3. "Was there a point you felt you'd lost? When?"
4. "Was there a point you felt in control?"

### 5.3 Decision probe (5 min)

1. "Give me a turn where you really didn't know what to do. What were you weighing?"
2. "Give me a turn that felt obvious ? one where the choice was automatic."
3. "Did you ever wish you could do *two* things that turn?"

### 5.4 Trade probe (3 min)

1. "When you proposed a trade, what were you thinking?"
2. "Did you reject any trades? Why?"
3. "Did the Beads matter to your choices, or were they incidental?"

### 5.5 Rules probe (3 min)

1. "Anything in the rules that stayed unclear?"
2. "Anything you expected to be possible that wasn't?"
3. "Anything you thought was broken?"

### 5.6 Would-you-play-again probe (2 min)

> "On a scale of 1?5, how likely are you to play this again tomorrow?"

Write down each answer. This is **the single most important number** the session produces.

### 5.7 (Optional) Written form

If time permits, fill out the feedback form in §6 *after* the verbal debrief. Verbal first ? written answers collapse to "it was fine" without a priming conversation.

## 6. Post-match feedback form

Use for digital playtests (where you can't do a live debrief) or as a written supplement to paper sessions.

```
ROGUE RIVALS ? Feedback form
Match ID: __________________    Your tribe: __________________

1. How likely are you to play again tomorrow?
   ? 1 (definitely not)
   ? 2
   ? 3
   ? 4
   ? 5 (definitely yes)

2. How did you feel at the end of the match?
   [free text, 1 sentence]

3. Most fun moment:
   [free text]

4. Least fun moment:
   [free text]

5. Did you feel you had meaningful choices?
   ? 1 (felt scripted)  ? 2  ? 3  ? 4  ? 5 (lots of real choices)

6. Did you feel you were playing against other humans?
   ? 1 (could have been bots)  ? 2  ? 3  ? 4  ? 5 (definitely social)

7. Did the match length feel:
   ? way too short
   ? a little short
   ? just right
   ? a little too long
   ? way too long

8. Did Trading matter to the outcome?
   ? didn't really trade
   ? traded some, didn't matter much
   ? trades decided the game

9. Did Ambush / Scout matter to the outcome?
   ? didn't use either
   ? used but neither mattered
   ? one of them decided a key moment

10. What's one thing you wish the game would let you do that it doesn't?
    [free text]

11. What's one thing you wish the game would NOT let people do?
    [free text]

12. Anything else:
    [free text]
```

## 7. What to watch for ? red flags and green flags

Pattern-recognition guide for observers. These are not pass/fail; they're signals.

### 7.1 Green flags (the game is working)

- Players hesitate over decisions. Real weighing happens.
- Trades generate conversation, counteroffers, small arguments.
- Someone laughs at an ambush outcome.
- Someone says "oh you bastard" (positive version).
- A player asks "what's the standings?" and it matters to their plan.
- Players start forming tacit alliances and breaking them.
- Multiple viable paths to victory visible in a single match.
- Post-match: "can we play again?"

### 7.2 Yellow flags (fixable)

- One rule keeps being forgotten (likely a candidate for a rule simplification).
- A specific building never gets built (rebalance cost or effect).
- Ambush only gets used in desperation (consider if the mechanic needs sharpening or if that's fine).
- Long silences on other players' turns (consider free-phase mini-games or decisions that overlap turns).
- A player "gives up" mentally at round 8?10 (comeback mechanic not being felt).

### 7.3 Red flags (urgent)

- Players openly confused about what they can do, mid-round, multiple rounds in a row.
- A clear dominant strategy discovered by any player (e.g., "I just spam trade with my neighbour and win").
- Negative emotional moments that aren't "I was beaten fair and square" but "this is stupid."
- Post-match rating of 1 or 2 from more than one player.
- Players try to bend the rules because the legal path is boring.

## 8. Analysis after each session

Same day, while memory is fresh.

### 8.1 Write a session report (short)

One per match. Template:

```
SESSION REPORT ? {date}, {players}
Ruleset: v0.7.3
Match result: {winner} by {trigger}, final VP: {dist}
Wallclock: {min}, rounds: {n}
Average "play again" score: {1-5}

TOP 3 POSITIVE OBSERVATIONS:
1.
2.
3.

TOP 3 PROBLEMS:
1. (severity: red/yellow, type: rule / UX / agent-behavior / balance)
2.
3.

RULE QUESTIONS TO RESOLVE:
  - [ ]

PROPOSED RULE CHANGES (if any, with rationale):
  - None  (preferred answer for first 3 sessions)

PROPOSED SPEC CHANGES (if any):
  - None

IMMEDIATE FOLLOW-UPS:
  - [ ]
```

### 8.2 Hold change proposals for 3 sessions

**Do not change rules after a single playtest.** A single session of 3 humans is noisier than 50 simulated matches. Aggregate signal across 3 sessions minimum before proposing a rule change.

Exceptions:
- A rule is impossible to execute (e.g., contradicts itself) ? fix immediately
- A rule is openly broken (e.g., infinite resource loop) ? fix immediately
- A rule is universally forgotten (every player forgot trade expiration) ? simplify

### 8.3 When a rule change is justified

1. Draft the change with rationale
2. Update `RULES.md` with version bump (v0.7.4+)
3. Run the full 50-match simulation batch with updated rules before next playtest ? confirm no regression on balance metrics (`COMPARISON_v*.md` template)
4. Update `packages/engine2` and `tools/v2/` in lockstep for v2 parity
5. Playtest again

## 9. Sample session schedule (first 3 paper sessions)

### Session 1 ? "Does it work at all?"

- 3 players, all new to the game
- Facilitator + Observer (could be 1 person)
- Goal: Rules are understandable, match finishes, players generally enjoy it
- Risk level: High ? first contact with real humans
- Pass criterion: Match finishes without more than 2 rule escalations; average "play again" score ?3

### Session 2 ? "Does it scale to 4?"

- 4 players, ideally 2 new + 2 returning from session 1
- Goal: 4-player dynamics work; trade triangles / duopolies emerge
- Watch for: negotiation latency (4 is harder than 3), kingmaker problem (3rd place deciding who wins)
- Pass criterion: Match finishes ?60 min real-time; at least one player uses a non-obvious strategy

### Session 3 ? "Stress test"

- 4 players, mix of skill levels
- Goal: push edge cases ? greedy builders, alliance duopolies, aggressive raiders in the same game
- Brief the players on playstyles (gently; not as "win conditions")
- Pass criterion: No archetype feels broken or dominant; any player can win from round 6

After 3 sessions, review findings before deciding on v0.7.4 or progressing to digital playtest (M3).

## 10. Known biases we're likely to hit

Write these on the notebook cover. Re-read before each session.

1. **Observer gravitates to the loud player.** Quiet players might be having a worse/better time than you notice. Check on them explicitly.
2. **Facilitator wants the game to succeed.** That's a bias. Ask brutal debrief questions anyway.
3. **"Play again" scores inflate in person.** People are polite. Trust the low scores; dampen the high ones.
4. **First session is heavily about rules friction.** Expected. Don't confuse "hard to learn" with "not fun." Look for fun in moments, not in the match arc.
5. **Your own playtest matches from before the session** will color your reading. Ideally, don't play the morning of.
6. **Cross-session comparison is hard.** Same rules + different people = wildly different matches. Aggregate across 5+ sessions before believing any trend.

## 11. Digital playtest additions (M3+)

Once the prototype is live, add:

### 11.1 Instrumentation per match

Auto-capture from the SIMULATION_SCHEMA log:

- Match duration (wallclock start ? end)
- Turn duration distribution (median, p90, p99)
- Drop-off rate (% matches abandoned)
- Trades proposed / accepted / rejected ratio
- Ambush hit rate
- Bead conversions per match
- End-trigger distribution

Compare to simulation baselines. Flag any metric that diverges >25% from the expected value in `COMPARISON_v0.7.3.md` ? that's a signal real humans are playing differently than agents.

### 11.2 Remote session protocol

- 4 players agree to a 48-hour match window
- Facilitator acts as "host" ? creates match, sends invites, spectates via admin endpoint
- Facilitator pings players at the start for confirmation, does NOT ping again until match end
- After match end, feedback form auto-appears on postgame screen (§6)
- Optional: 20-min group video debrief, same questions as §5.2?5.6

### 11.3 Async-specific observations

Things that can't show up in paper:

- How often do players open the thread just to read, without acting?
- Do trade proposals get counter-offered, or mostly accepted/rejected?
- What's the median delay from notification to action?
- How often does the turn timer auto-pass?
- Do players ever play multiple rounds in quick succession (both parties online)? Or is it always long gaps?

## 12. Exit criteria for playtesting

Playtest loop done when:

- ?5 paper sessions and ?5 digital sessions completed
- Average "play again" ?4 across last 5 sessions combined
- End-trigger distribution with humans roughly matches simulation (?40% `round_limit` / ?25% `vp_threshold` / ?35% `great_hall`, ?15pp each)
- No red flags observed in last 3 sessions
- No rule changes proposed in last 2 sessions
- At least one session has had all four tribes competitive

That's the "good enough for vertical slice" bar. Beyond that, the next question is production, not rules.

---

## Appendix A ? Quick-start for session 1

**30 minutes before:**
- Print rule summary card (4 copies), tribe sheets (1 per seat), feedback form (4 copies)
- Lay out tokens: 30 each of T/O/F/Rel, 20 Scrap in shared pool
- Set up VP tracks and round tracker
- Charge phone for session recording (audio only; ask permission)

**Before players arrive:**
- Write session ID and date on the observer notebook page
- Decide who's facilitator vs observer if you have both

**Session opening script:**

> "Thanks for coming. This is a new game I'm designing ? it's meant to be played over SMS eventually, but we're doing it on paper today so I can learn what works. There are no right answers. If you're confused, say so. If you're bored, say so. I want your real reaction."

**Session closing script:**

> "Thanks. One last ask ? on 1 to 5, how likely are you to play this again tomorrow? Just a number. ? Thanks. I'll buy you all a beer."

---

*End of PLAYTEST.md*
