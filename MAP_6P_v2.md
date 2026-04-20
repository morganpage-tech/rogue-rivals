# Rogue Rivals v2 -- 6-player continent map spec

This is the first serious map target for `Rogue Rivals v2`.

The goal is to move the game away from the 4-player "cold war + clean blocs"
shape and toward the messier async diplomacy that makes Neptune's Pride-style
games sing: temporary alliances, exposed flanks, opportunistic third parties,
and border wars that can pivot into central races.

## Match format

- **Primary format:** 6 active tribes
- **Roster basis:** 7 canonical tribes exist in the world; 1 sits out per match
- **Default 6-player scenario:** Orange, Brown, Grey, Tricoloured, Red, Arctic
- **Reserve tribe for later scenario rotation:** Camouflage (`Bamboo Maze`)

## Map shape

- **27 regions total**
- **18 homeland regions**: 6 wedges x 3 regions each
- **6 border regions**: one shared pressure-point between each neighboring pair
- **3 core prize regions**: central objectives that pull multiple tribes inward

Each tribe gets:

1. **Home region** (owned at start, contains starting garrison)
2. **One adjacent owned region** (owned at start, per current `RULES.md`)
3. **One neutral frontier region** in its own wedge

This gives every tribe **three expansion lanes**:

- clockwise border
- counterclockwise border
- inward/core pressure

## Terrain assumptions

Current engine terrain set is:

- `plains`
- `mountains`
- `swamps`
- `desert`
- `ruins`
- `forest`
- `river_crossing`

For the first 6-player implementation:

- **Tricoloured** uses `forest`
- **Arctic** temporarily uses `mountains` / `plains` semantics until a dedicated
frost terrain exists
- **Camouflage** is not on the default map yet, so `bamboo` can remain deferred

## Active tribe order around the continent

Clockwise ring order:

1. Arctic
2. Tricoloured
3. Red
4. Brown
5. Orange
6. Grey

This ring intentionally creates:

- Orange between Brown and Grey
- Red between Tricoloured and Brown
- Arctic insulated but not isolated
- Grey pinched between Arctic and Orange

## Region list

### Arctic wedge

- `r_arc_frosthold` -- `mountains` -- **home**
- `r_arc_ice_shelf` -- `plains` -- **starts owned**
- `r_arc_white_wastes` -- `mountains` -- neutral frontier

### Tricoloured wedge

- `r_tri_hidden_grove` -- `forest` -- **home**
- `r_tri_tricky_woods` -- `forest` -- **starts owned**
- `r_tri_whisper_thicket` -- `forest` -- neutral frontier

### Red wedge

- `r_red_mirage_camp` -- `desert` -- **home**
- `r_red_vast_dunes` -- `desert` -- **starts owned**
- `r_red_rare_veins` -- `ruins` -- neutral frontier

### Brown wedge

- `r_br_root_cities` -- `swamps` -- **home**
- `r_br_reeky_canopy` -- `swamps` -- **starts owned**
- `r_br_mire_channels` -- `swamps` -- neutral frontier

### Orange wedge

- `r_or_vulpgard` -- `plains` -- **home**
- `r_or_windy_plains` -- `plains` -- **starts owned**
- `r_or_rocky_hills` -- `mountains` -- neutral frontier

### Grey wedge

- `r_gr_middle_high_mountains` -- `mountains` -- **home**
- `r_gr_upper_high_mountains` -- `mountains` -- **starts owned**
- `r_gr_lower_high_mountains` -- `mountains` -- neutral frontier

### Border regions

- `r_border_snowpine_reach` -- `forest` -- Arctic / Tricoloured border
- `r_border_glasswood_verge` -- `plains` -- Tricoloured / Red border
- `r_border_saltfen_crossing` -- `river_crossing` -- Red / Brown border
- `r_border_hillmire_gate` -- `plains` -- Brown / Orange border
- `r_border_howling_pass` -- `mountains` -- Orange / Grey border
- `r_border_frostpass` -- `mountains` -- Grey / Arctic border

### Core prize regions

- `r_core_foxfire_ruins` -- `ruins`
- `r_core_three_trails_market` -- `plains`
- `r_core_moon_ford` -- `river_crossing`

## Starting ownership

The default scenario should start with exactly these owned regions:

- Arctic: `r_arc_frosthold`, `r_arc_ice_shelf`
- Tricoloured: `r_tri_hidden_grove`, `r_tri_tricky_woods`
- Red: `r_red_mirage_camp`, `r_red_vast_dunes`
- Brown: `r_br_root_cities`, `r_br_reeky_canopy`
- Orange: `r_or_vulpgard`, `r_or_windy_plains`
- Grey: `r_gr_middle_high_mountains`, `r_gr_upper_high_mountains`

Everything else starts neutral.

This should be **explicitly assigned**, not left to the current "alphabetically
first adjacent region" helper, because the 6-player scenario is intended to be
authored and stable.

## Adjacency pattern

Every wedge uses the same internal shape:

- `home <-> owned_support`
- `home <-> neutral_frontier`
- `owned_support <-> neutral_frontier`

That is: each wedge is an internal triangle.

### Arctic wedge trails

- `r_arc_frosthold <-> r_arc_ice_shelf`
- `r_arc_frosthold <-> r_arc_white_wastes`
- `r_arc_ice_shelf <-> r_arc_white_wastes`

### Tricoloured wedge trails

- `r_tri_hidden_grove <-> r_tri_tricky_woods`
- `r_tri_hidden_grove <-> r_tri_whisper_thicket`
- `r_tri_tricky_woods <-> r_tri_whisper_thicket`

### Red wedge trails

- `r_red_mirage_camp <-> r_red_vast_dunes`
- `r_red_mirage_camp <-> r_red_rare_veins`
- `r_red_vast_dunes <-> r_red_rare_veins`

### Brown wedge trails

- `r_br_root_cities <-> r_br_reeky_canopy`
- `r_br_root_cities <-> r_br_mire_channels`
- `r_br_reeky_canopy <-> r_br_mire_channels`

### Orange wedge trails

- `r_or_vulpgard <-> r_or_windy_plains`
- `r_or_vulpgard <-> r_or_rocky_hills`
- `r_or_windy_plains <-> r_or_rocky_hills`

### Grey wedge trails

- `r_gr_middle_high_mountains <-> r_gr_upper_high_mountains`
- `r_gr_middle_high_mountains <-> r_gr_lower_high_mountains`
- `r_gr_upper_high_mountains <-> r_gr_lower_high_mountains`

## Border trails

Clockwise-support regions connect to clockwise border regions.
Counterclockwise-frontier regions connect to counterclockwise border regions.

- `r_arc_ice_shelf <-> r_border_snowpine_reach`
- `r_tri_whisper_thicket <-> r_border_snowpine_reach`
- `r_tri_tricky_woods <-> r_border_glasswood_verge`
- `r_red_rare_veins <-> r_border_glasswood_verge`
- `r_red_vast_dunes <-> r_border_saltfen_crossing`
- `r_br_mire_channels <-> r_border_saltfen_crossing`
- `r_br_reeky_canopy <-> r_border_hillmire_gate`
- `r_or_rocky_hills <-> r_border_hillmire_gate`
- `r_or_windy_plains <-> r_border_howling_pass`
- `r_gr_lower_high_mountains <-> r_border_howling_pass`
- `r_gr_upper_high_mountains <-> r_border_frostpass`
- `r_arc_white_wastes <-> r_border_frostpass`

## Core trails

Each tribe has access to **two** of the three core prize regions.

### `r_core_foxfire_ruins`

Accessible from:

- `r_arc_white_wastes`
- `r_red_rare_veins`
- `r_br_mire_channels`
- `r_gr_upper_high_mountains`

### `r_core_three_trails_market`

Accessible from:

- `r_tri_tricky_woods`
- `r_red_vast_dunes`
- `r_or_rocky_hills`
- `r_gr_lower_high_mountains`

### `r_core_moon_ford`

Accessible from:

- `r_arc_ice_shelf`
- `r_tri_whisper_thicket`
- `r_br_reeky_canopy`
- `r_or_windy_plains`

## Why these three core regions exist

### `r_core_foxfire_ruins`

The economic lure. This is the most obvious high-value objective and should
produce the earliest military races.

Expected regular contestants:

- Grey
- Arctic
- Brown
- Red

### `r_core_three_trails_market`

The diplomatic and logistics hinge. This should become the region where deals,
shared vision, and "I need passage, not war" tension live.

Expected regular contestants:

- Grey
- Orange
- Red
- Tricoloured

### `r_core_moon_ford`

The awkward, tempo-sensitive river gate. It should reward tribes that can time
multi-tick moves and punishes overextension.

Expected regular contestants:

- Arctic
- Tricoloured
- Orange
- Brown

## Early-game pressure map

Expected first 8-12 tick tensions:

- **Grey vs Orange** over `r_border_howling_pass`
- **Orange vs Brown** over `r_border_hillmire_gate`
- **Red vs Brown** over `r_border_saltfen_crossing`
- **Red vs Tricoloured** over `r_border_glasswood_verge`
- **Arctic vs Grey** over `r_border_frostpass`
- **Arctic vs Tricoloured** over `r_border_snowpine_reach`

Expected first central races:

- Grey / Arctic / Brown / Red into `r_core_foxfire_ruins`
- Grey / Orange / Red / Tricoloured into `r_core_three_trails_market`
- Arctic / Tricoloured / Brown / Orange into `r_core_moon_ford`

This is intentional: every tribe is pulled into two centers, not all three, so
the map produces **partial overlap** rather than every empire colliding
everywhere at once.

## Design intent by tribe

### Orange

- Strongest lateral expansion tribe
- Pushes into Brown and Grey borders
- Can pivot either to `r_core_moon_ford` or `r_core_three_trails_market`

### Brown

- Naturally defensive homeland
- Must decide whether to fight Orange locally or race Red/Arctic/Brown lanes
- Good candidate for trade-heavy play if central access is safe

### Grey

- Mountain fortress with two useful outward lanes
- Has a natural claim to `r_core_foxfire_ruins` but should not be allowed to
turtle uncontested

### Tricoloured

- Information / ambush / hidden-route fantasy
- Slightly less exposed than Red, but with worse raw economy

### Red

- Broad outward pressure
- Can punch into Brown or Tricoloured borders and also contest two centers
- Should feel rich but vulnerable to overextension

### Arctic

- Sparse and harsh start
- Lower local density, but strong leverage over Grey / Tricoloured diplomacy
- A tribe others ignore at their peril

## What this spec should fix

Compared with the 4-player 16-region map, this 6-player map should:

- reduce frozen two-bloc diplomacy
- create more kingmaker positions
- make betrayal useful, because there are third parties ready to benefit
- make border wars matter without forcing every tribe into the same center
- produce more "I need a temporary pact on one side so I can strike elsewhere"

## Implementation notes

When coding this map:

1. Add new tribes `tricoloured` and `arctic` to the v2 constants/types surface.
2. Add an authored `build_continent_map_6p()` rather than overloading the
  current 4-player expanded map.
3. Add explicit starting-owner assignment for the second owned region.
4. Update renderer / canvas / batch runner to accept `6p-continent`.
5. Run small batches first: `1-2 matches`, `workers=1-2`, before scaling.

## Deferred follow-up

Once the 6-player default is working:

- add `Camouflage` and `Bamboo Maze` as a scenario variant or 7-player mode
- add a dedicated `frost` terrain if Arctic pacing needs to feel more distinct
- give each non-core border region a named structure bias or scripted landmark