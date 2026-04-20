"""Compact rules reminder for LLM prompts.

Derived from RULES.md but re-organised for token efficiency. Aim: the
LLM has enough to make decisions without wading through the full spec.
Max ~80 lines of prose.
"""

COMPACT_RULES_V2 = """
## Rogue Rivals v2 -- core ruleset (compressed)

### Flow
Every tick you submit an OrderPacket (structured orders). All tribes submit simultaneously, then the engine resolves. You do NOT see other tribes' orders before submitting. Orders in transit (moves, scouts, caravans) take multiple ticks and cannot be recalled.

### Resource
Single resource: Influence. Produced per owned region per tick. Spent on recruit / build / scout / trade.

### Spending order (critical)
Resolution applies **build, recruit, propose, respond, and message** first (in your packet order), then **moves and scouts**. Each cost is paid from **Your Influence** as shown — this tick's new production is credited **after** these orders, so you cannot spend it the same tick. Scouts cost 3 each; if you cannot pay, extra scouts are dropped (same as the human client: you cannot queue spend you do not have).

### Region production (per tick, owned)
plains 2, mountains 2, ruins 3, river_crossing 2, swamps 1, desert 1, forest 1. Structures: granary +1, shrine +1. Orange tribe: +1 on plains.

### Forces
Tier I (skirmishers): cost 2, no travel penalty.
Tier II (warband): cost 5, no travel penalty.
Tier III (host): cost 12, +1 tick per trail.
Tier IV (massive): cost 30, +2 tick per trail, requires forge structure.
Only ONE garrison per owned region. Recruit in a region you own without a garrison.

### Structures (cost Influence, max 2 per region)
granary 8 (+1 production), fort 10 (+1 defender tier), road 6 (halves one trail length), watchtower 6 (reveals adjacent regions + scout 2 hops), shrine 12 (+1 prod + counts toward cultural victory), forge 15 (enables Tier IV recruiting).

### Movement
Move force from a region you own to an adjacent region only. At most **one move order per force per tick**; extras are dropped (first in your list wins). Transit time = trail length (base 2, plains-plains 1, mountains-mountains 3) + tier penalty. Moving into an NAP partner's region BREAKS the NAP (public event + reputation penalty). Moving into unowned region claims it. Moving into an enemy region triggers combat on arrival.

### Combat
Tier + modifiers. Defender gets +1 own-region, +1 if fort present, up to +2 from adjacent Shared-Vision allies with tier>=II forces. Attacker gets -1 if scouted same tick. Higher wins; loser drops a tier and retreats (or is destroyed if no friendly adjacent region). Tie: both drop a tier.

### Scouts
Cost 3 Influence. Transit = trail base length. On arrival, reveals target + adjacent for 1 tick, then expires. Cannot fight or be fought. If arrives same tick as an attacker, imposes -1 penalty on that attacker.

### Diplomacy
Structured proposals (needs target's accept): NAP (neither can move into other for N ticks), Trade Offer (amount Influence sent as caravan), Shared Vision (see each other's visible regions for N ticks).
Unilateral: Declare War (sets WAR state), Break Pact (cancels NAP).
Breaking NAP tags you as pact-breaker for 2-4 ticks -- recipients see the tag on your future proposals.
Free-text Message: pure prose, no mechanical effect.

### Caravans (trade delivery)
On Trade Offer accept, sender spends amount + 1 overhead, caravan dispatched. Default 2-tick travel. If a hostile Tier II+ garrison occupies any path region at delivery tick, the hostile tribe INTERCEPTS and takes the Influence.

### Victory (checked end-of-tick, first match wins)
1. Last standing (only you have regions).
2. Cultural: own 4 shrines (immediate).
3. Diplomatic hegemony: NAP with every surviving tribe + plurality of regions, 3 ticks.
4. Economic: >=50% total production, 3 ticks.
5. Territorial: >=60% of regions, 3 ticks.
6. Tick 60 fallback: weighted score of regions/influence/shrines/NAPs.

### Fog of war
You see: your regions, regions adjacent to yours, scouted regions, regions adjacent to your watchtowers (2 hops). Foreign forces appear as fuzzy tier (raiding_party / warband / large_host / massive_army) -- no exact numbers. Transits visible only if you can see either endpoint. Caravans invisible.

### Your turn -- what to output
Return a JSON object: { "orders": [ ... ] }. Each order has a "kind":
 - "move" { force_id, destination_region_id }
 - "recruit" { region_id, tier }
 - "build" { region_id, structure, road_target? }
 - "scout" { from_region_id, target_region_id }
 - "propose" { proposal: { kind: "nap"|"trade_offer"|"shared_vision"|"declare_war"|"break_pact", to, length_ticks?, amount_influence? } }
 - "respond" { proposal_id, response: "accept"|"decline" }
 - "message" { to, text }
Empty orders array means "pass". Invalid orders fail silently; the engine logs them. You can stack multiple orders in one packet (e.g. build + scout + propose + message).
""".strip()
