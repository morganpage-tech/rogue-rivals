"""Map construction.

Three hand-built maps:

- `build_hand_map` + `MINIMAL_REGION_LAYOUT`: the original v2.0 6-region
  test map used to validate the tick resolution loop. Too thin to force
  contested borders.

- `build_expanded_map` + `EXPANDED_REGION_LAYOUT`: a 16-region map
  designed so every tribe has direct adjacency pressure with at least two
  rivals. The 4 central regions (ruins_ctr, river_crossing, shrine_vale,
  dark_forest) are the dispute zone -- any pair of tribes can reach any
  central region in 2-3 ticks through trails that cross each other's
  natural expansion paths.

- `build_continent_map_6p` + `CONTINENT_6P_SCHEMATIC_LAYOUT`: a 27-region
  authored continent for the first real 6-player async format. Six active
  tribes each get a 3-region homeland wedge, six border regions, and three
  interior prize regions that pull overlapping groups inward. Pixel
  positions for `CONTINENT_6P_SCHEMATIC_LAYOUT` follow the schematic wedge /
  border ring / core triangle (visualization only; trail graph is unchanged).

Procedural map generation per RULES_v2.md \u00a711 is still deferred; both
maps below are hand-authored.

### Expanded map layout (ASCII)

```
    [or_plains]---[or_forest]----[dark_forest]----[gr_peaks]---[gr_mountains]
        |             |               |                |            |
    [or_hills]---[shrine_vale]---[ruins_ctr]---[gr_gap]-----------+
        |             |               |                |
    [br_fields]---[br_swamps]---[river_crossing]---[rd_oasis]---[rd_desert]
                      |               |                             |
                  [br_shore]----------+---------------------[rd_dunes]
```

Tribe home terrains mirror the minimal map so the tribe-specific starting
bonuses (Grey's fort, Brown's road, Orange's plains buff, Red's bonus
Influence) still apply without touching `constants.py`.
"""

from __future__ import annotations

from typing import Dict, List, Tuple

from .constants import (
    STARTING_GARRISON_TIER,
    STARTING_INFLUENCE,
    TRIBE_HOME_TERRAIN,
    base_trail_length,
)
from .state import (
    Announcement,
    Force,
    GameState,
    PlayerState,
    Region,
    Trail,
    adjacent_regions,
)


# ---------------------------------------------------------------------------
# Minimal 6-region map (original v2.0 oracle)
# ---------------------------------------------------------------------------

_HAND_MAP_SPEC: List[Tuple[str, str]] = [
    ("r_orange_plains", "plains"),
    ("r_grey_mountains", "mountains"),
    ("r_brown_swamps", "swamps"),
    ("r_red_desert", "desert"),
    ("r_ruins_center", "ruins"),
    ("r_desert_wastes", "desert"),
]

_HAND_TRAILS: List[Tuple[str, str]] = [
    ("r_orange_plains", "r_ruins_center"),
    ("r_grey_mountains", "r_ruins_center"),
    ("r_brown_swamps", "r_desert_wastes"),
    ("r_red_desert", "r_desert_wastes"),
    ("r_orange_plains", "r_brown_swamps"),
    ("r_grey_mountains", "r_red_desert"),
    ("r_ruins_center", "r_desert_wastes"),
]

_TRIBE_HOME_REGION: Dict[str, str] = {
    "orange": "r_orange_plains",
    "grey": "r_grey_mountains",
    "brown": "r_brown_swamps",
    "red": "r_red_desert",
}

# Layout coords (x, y) for minimal renderer
MINIMAL_REGION_LAYOUT: Dict[str, Tuple[int, int]] = {
    "r_orange_plains":   (0,     0),
    "r_ruins_center":    (300,   0),
    "r_grey_mountains":  (600,   0),
    "r_brown_swamps":    (0,   200),
    "r_desert_wastes":   (300, 200),
    "r_red_desert":      (600, 200),
}


def build_hand_map(state: GameState) -> None:
    for region_id, terrain in _HAND_MAP_SPEC:
        state.regions[region_id] = Region(id=region_id, type=terrain)
    for idx, (a, b) in enumerate(_HAND_TRAILS):
        ta = state.regions[a].type
        tb = state.regions[b].type
        state.trails.append(
            Trail(index=idx, a=a, b=b, base_length_ticks=base_trail_length(ta, tb))
        )


def place_tribes(state: GameState, tribes: List[str]) -> None:
    _place_tribes_core(state, tribes, _TRIBE_HOME_REGION)


# ---------------------------------------------------------------------------
# Expanded 16-region map
# ---------------------------------------------------------------------------

# Region specs: id, terrain. Grouped by zone.
_EXP_SPEC: List[Tuple[str, str]] = [
    # Orange quadrant (NW)
    ("r_or_plains",     "plains"),
    ("r_or_forest",     "forest"),
    ("r_or_hills",      "mountains"),
    # Grey quadrant (NE)
    ("r_gr_mountains",  "mountains"),
    ("r_gr_peaks",      "mountains"),
    ("r_gr_gap",        "plains"),
    # Brown quadrant (SW)
    ("r_br_swamps",     "swamps"),
    ("r_br_fields",     "plains"),
    ("r_br_shore",      "swamps"),
    # Red quadrant (SE)
    ("r_rd_desert",     "desert"),
    ("r_rd_dunes",      "desert"),
    ("r_rd_oasis",      "plains"),
    # Central contested (4 regions)
    ("r_dark_forest",   "forest"),
    ("r_shrine_vale",   "plains"),
    ("r_ruins_ctr",     "ruins"),
    ("r_river_xing",    "river_crossing"),
]

# Trails chosen so every tribe has:
#   - A safe back-of-quadrant region (2 trails to centre, but 1 from home)
#   - A frontier region touching a contested central region
#   - At least two adjacent rival-frontier regions reachable in 2 hops
_EXP_TRAILS: List[Tuple[str, str]] = [
    # --- Orange quadrant internal ---
    ("r_or_plains", "r_or_forest"),
    ("r_or_plains", "r_or_hills"),
    ("r_or_forest", "r_or_hills"),

    # --- Grey quadrant internal ---
    ("r_gr_mountains", "r_gr_peaks"),
    ("r_gr_mountains", "r_gr_gap"),
    ("r_gr_peaks", "r_gr_gap"),

    # --- Brown quadrant internal ---
    ("r_br_swamps", "r_br_fields"),
    ("r_br_swamps", "r_br_shore"),
    ("r_br_fields", "r_br_shore"),

    # --- Red quadrant internal ---
    ("r_rd_desert", "r_rd_dunes"),
    ("r_rd_desert", "r_rd_oasis"),
    ("r_rd_dunes", "r_rd_oasis"),

    # --- Quadrant -> central contested ---
    ("r_or_forest",    "r_dark_forest"),    # Orange north frontier
    ("r_or_hills",     "r_shrine_vale"),    # Orange south frontier
    ("r_gr_peaks",     "r_dark_forest"),    # Grey west frontier
    ("r_gr_gap",       "r_ruins_ctr"),      # Grey south frontier
    ("r_br_fields",    "r_shrine_vale"),    # Brown north frontier
    ("r_br_shore",     "r_river_xing"),     # Brown east frontier
    ("r_rd_oasis",     "r_ruins_ctr"),      # Red west frontier
    ("r_rd_dunes",     "r_river_xing"),     # Red north frontier

    # --- Central contested internal (spine) ---
    ("r_dark_forest",  "r_shrine_vale"),
    ("r_shrine_vale",  "r_ruins_ctr"),
    ("r_ruins_ctr",    "r_river_xing"),
    ("r_shrine_vale",  "r_river_xing"),    # diagonal so centre isn't a line
]

_EXP_TRIBE_HOME: Dict[str, str] = {
    "orange": "r_or_plains",
    "grey":   "r_gr_mountains",
    "brown":  "r_br_swamps",
    "red":    "r_rd_desert",
}

# Layout coords tuned to match the ASCII diagram above.
EXPANDED_REGION_LAYOUT: Dict[str, Tuple[int, int]] = {
    # row 0 (top): back ranks
    "r_or_plains":    (0,    0),
    "r_gr_mountains": (1000, 0),
    # row 1: mid
    "r_or_forest":    (200,  120),
    "r_or_hills":     (0,    240),
    "r_gr_peaks":     (800,  120),
    "r_gr_gap":       (1000, 240),
    # central band
    "r_dark_forest":  (400,  120),
    "r_shrine_vale":  (400,  300),
    "r_ruins_ctr":    (600,  300),
    "r_river_xing":   (600,  480),
    # row 3: Brown/Red mid
    "r_br_fields":    (200,  420),
    "r_br_shore":     (200,  600),
    "r_rd_oasis":     (800,  420),
    "r_rd_dunes":     (800,  600),
    # row 4: back ranks
    "r_br_swamps":    (0,    540),
    "r_rd_desert":    (1000, 540),
}


def build_expanded_map(state: GameState) -> None:
    for region_id, terrain in _EXP_SPEC:
        state.regions[region_id] = Region(id=region_id, type=terrain)
    for idx, (a, b) in enumerate(_EXP_TRAILS):
        ta = state.regions[a].type
        tb = state.regions[b].type
        state.trails.append(
            Trail(index=idx, a=a, b=b, base_length_ticks=base_trail_length(ta, tb))
        )


def place_tribes_expanded(state: GameState, tribes: List[str]) -> None:
    _place_tribes_core(state, tribes, _EXP_TRIBE_HOME)


# ---------------------------------------------------------------------------
# Authored 6-player continent map (27 regions)
# ---------------------------------------------------------------------------

CONTINENT_6P_DEFAULT_TRIBES: List[str] = [
    "arctic",
    "tricoloured",
    "red",
    "brown",
    "orange",
    "grey",
]

_CONTINENT_6P_SPEC: List[Tuple[str, str]] = [
    ("r_arc_frosthold", "mountains"),
    ("r_arc_ice_shelf", "plains"),
    ("r_arc_white_wastes", "mountains"),
    ("r_tri_hidden_grove", "forest"),
    ("r_tri_tricky_woods", "forest"),
    ("r_tri_whisper_thicket", "forest"),
    ("r_red_mirage_camp", "desert"),
    ("r_red_vast_dunes", "desert"),
    ("r_red_rare_veins", "ruins"),
    ("r_br_root_cities", "swamps"),
    ("r_br_reeky_canopy", "swamps"),
    ("r_br_mire_channels", "swamps"),
    ("r_or_vulpgard", "plains"),
    ("r_or_windy_plains", "plains"),
    ("r_or_rocky_hills", "mountains"),
    ("r_gr_middle_high_mountains", "mountains"),
    ("r_gr_upper_high_mountains", "mountains"),
    ("r_gr_lower_high_mountains", "mountains"),
    ("r_border_snowpine_reach", "forest"),
    ("r_border_glasswood_verge", "plains"),
    ("r_border_saltfen_crossing", "river_crossing"),
    ("r_border_hillmire_gate", "plains"),
    ("r_border_howling_pass", "mountains"),
    ("r_border_frostpass", "mountains"),
    ("r_core_foxfire_ruins", "ruins"),
    ("r_core_three_trails_market", "plains"),
    ("r_core_moon_ford", "river_crossing"),
]

_CONTINENT_6P_TRAILS: List[Tuple[str, str]] = [
    ("r_arc_frosthold", "r_arc_ice_shelf"),
    ("r_arc_frosthold", "r_arc_white_wastes"),
    ("r_arc_ice_shelf", "r_arc_white_wastes"),
    ("r_tri_hidden_grove", "r_tri_tricky_woods"),
    ("r_tri_hidden_grove", "r_tri_whisper_thicket"),
    ("r_tri_tricky_woods", "r_tri_whisper_thicket"),
    ("r_red_mirage_camp", "r_red_vast_dunes"),
    ("r_red_mirage_camp", "r_red_rare_veins"),
    ("r_red_vast_dunes", "r_red_rare_veins"),
    ("r_br_root_cities", "r_br_reeky_canopy"),
    ("r_br_root_cities", "r_br_mire_channels"),
    ("r_br_reeky_canopy", "r_br_mire_channels"),
    ("r_or_vulpgard", "r_or_windy_plains"),
    ("r_or_vulpgard", "r_or_rocky_hills"),
    ("r_or_windy_plains", "r_or_rocky_hills"),
    ("r_gr_middle_high_mountains", "r_gr_upper_high_mountains"),
    ("r_gr_middle_high_mountains", "r_gr_lower_high_mountains"),
    ("r_gr_upper_high_mountains", "r_gr_lower_high_mountains"),
    ("r_arc_ice_shelf", "r_border_snowpine_reach"),
    ("r_tri_whisper_thicket", "r_border_snowpine_reach"),
    ("r_tri_tricky_woods", "r_border_glasswood_verge"),
    ("r_red_rare_veins", "r_border_glasswood_verge"),
    ("r_red_vast_dunes", "r_border_saltfen_crossing"),
    ("r_br_mire_channels", "r_border_saltfen_crossing"),
    ("r_br_reeky_canopy", "r_border_hillmire_gate"),
    ("r_or_rocky_hills", "r_border_hillmire_gate"),
    ("r_or_windy_plains", "r_border_howling_pass"),
    ("r_gr_lower_high_mountains", "r_border_howling_pass"),
    ("r_gr_upper_high_mountains", "r_border_frostpass"),
    ("r_arc_white_wastes", "r_border_frostpass"),
    ("r_arc_white_wastes", "r_core_foxfire_ruins"),
    ("r_red_rare_veins", "r_core_foxfire_ruins"),
    ("r_br_mire_channels", "r_core_foxfire_ruins"),
    ("r_gr_upper_high_mountains", "r_core_foxfire_ruins"),
    ("r_tri_tricky_woods", "r_core_three_trails_market"),
    ("r_red_vast_dunes", "r_core_three_trails_market"),
    ("r_or_rocky_hills", "r_core_three_trails_market"),
    ("r_gr_lower_high_mountains", "r_core_three_trails_market"),
    ("r_arc_ice_shelf", "r_core_moon_ford"),
    ("r_tri_whisper_thicket", "r_core_moon_ford"),
    ("r_br_reeky_canopy", "r_core_moon_ford"),
    ("r_or_windy_plains", "r_core_moon_ford"),
]

_CONTINENT_6P_TRIBE_HOME: Dict[str, str] = {
    "arctic": "r_arc_frosthold",
    "tricoloured": "r_tri_hidden_grove",
    "red": "r_red_mirage_camp",
    "brown": "r_br_root_cities",
    "orange": "r_or_vulpgard",
    "grey": "r_gr_middle_high_mountains",
}

_CONTINENT_6P_SECOND_REGION: Dict[str, str] = {
    "arctic": "r_arc_ice_shelf",
    "tricoloured": "r_tri_tricky_woods",
    "red": "r_red_vast_dunes",
    "brown": "r_br_reeky_canopy",
    "orange": "r_or_windy_plains",
    "grey": "r_gr_upper_high_mountains",
}

# Schematic layout: six outer wedges (3 regions each), six border nodes on the
# inner ring, three core regions in a triangle. Coordinates are for SVG/HTML
# only; gameplay adjacency is defined by `_CONTINENT_6P_TRAILS`.
# Positions are scaled ~1.68x from (500, 360) so homeland wedges have enough
# gap between node centers for trails and tick labels (disc r=42 in SVG).
CONTINENT_6P_SCHEMATIC_LAYOUT: Dict[str, Tuple[int, int]] = {
    # Core triangle (center prize)
    "r_core_foxfire_ruins": (382, 259),
    "r_core_three_trails_market": (618, 259),
    "r_core_moon_ford": (500, 427),
    # Border ring (between wedges and core)
    "r_border_snowpine_reach": (702, 91),
    "r_border_glasswood_verge": (870, 360),
    "r_border_saltfen_crossing": (702, 629),
    "r_border_hillmire_gate": (298, 629),
    "r_border_howling_pass": (130, 360),
    "r_border_frostpass": (298, 91),
    # Arctic (top)
    "r_arc_frosthold": (500, -178),
    "r_arc_ice_shelf": (399, -77),
    "r_arc_white_wastes": (601, -77),
    # Tricoloured (top-right)
    "r_tri_hidden_grove": (1071, -144),
    "r_tri_tricky_woods": (1004, -43),
    "r_tri_whisper_thicket": (1138, -43),
    # Red (bottom-right)
    "r_red_mirage_camp": (1071, 864),
    "r_red_vast_dunes": (1004, 763),
    "r_red_rare_veins": (1138, 763),
    # Brown (bottom)
    "r_br_root_cities": (500, 898),
    "r_br_reeky_canopy": (399, 797),
    "r_br_mire_channels": (601, 797),
    # Orange (bottom-left)
    "r_or_vulpgard": (-71, 864),
    "r_or_windy_plains": (-4, 763),
    "r_or_rocky_hills": (-138, 763),
    # Grey (top-left)
    "r_gr_middle_high_mountains": (-71, -144),
    "r_gr_upper_high_mountains": (-4, -43),
    "r_gr_lower_high_mountains": (-138, -43),
}

CONTINENT_6P_REGION_LAYOUT: Dict[str, Tuple[int, int]] = CONTINENT_6P_SCHEMATIC_LAYOUT


def build_continent_map_6p(state: GameState) -> None:
    """Populate the authored 27-region 6-player continent map."""
    for region_id, terrain in _CONTINENT_6P_SPEC:
        state.regions[region_id] = Region(id=region_id, type=terrain)
    for idx, (a, b) in enumerate(_CONTINENT_6P_TRAILS):
        ta = state.regions[a].type
        tb = state.regions[b].type
        state.trails.append(
            Trail(index=idx, a=a, b=b, base_length_ticks=base_trail_length(ta, tb))
        )


def place_tribes_continent_6p(state: GameState, tribes: List[str] | None = None) -> None:
    """Place the default 6 active tribes with authored second-region claims."""
    roster = list(tribes or CONTINENT_6P_DEFAULT_TRIBES)
    _place_tribes_core(
        state,
        roster,
        _CONTINENT_6P_TRIBE_HOME,
        second_region_by_tribe=_CONTINENT_6P_SECOND_REGION,
    )


# ---------------------------------------------------------------------------
# Shared placement core
# ---------------------------------------------------------------------------


def _place_tribes_core(
    state: GameState,
    tribes: List[str],
    home_region_by_tribe: Dict[str, str],
    second_region_by_tribe: Dict[str, str] | None = None,
) -> None:
    """Assign home regions, starting influence, starting garrisons, and
    tribe-specific asymmetric bonuses (grey fort, brown road).

    Per RULES_v2.md \u00a74.9 / \u00a711.3 every tribe starts with 2 owned regions:
    home + one adjacent region (alphabetically first unclaimed). The
    adjacent-claim pass runs in alphabetical tribe order so any collision
    resolves deterministically. On dense hand-maps where every adjacent
    region to a home is itself another tribe's home, a tribe may receive
    no second region -- we log a `starting_adjacent_unavailable` warning
    on state.announcements and continue. This is a known limitation of
    the minimal 6-region oracle map; the 16-region expanded map is wide
    enough that every tribe gets a second region."""
    for tribe in tribes:
        home_region_id = home_region_by_tribe[tribe]
        region = state.regions[home_region_id]
        assert region.type == TRIBE_HOME_TERRAIN[tribe], (
            f"hand-map mismatch: {tribe} home {home_region_id} is {region.type}"
        )
        region.owner = tribe

        force_id = f"f_{tribe}_{state.next_force_idx:03d}"
        state.next_force_idx += 1
        state.forces[force_id] = Force(
            id=force_id,
            owner=tribe,
            tier=STARTING_GARRISON_TIER,
            location_kind="garrison",
            location_region_id=home_region_id,
        )
        region.garrison_force_id = force_id

        state.players[tribe] = PlayerState(
            tribe=tribe,
            influence=STARTING_INFLUENCE[tribe],
        )
        state.victory_counters[tribe] = {}

    state.tribes_alive = list(tribes)

    # Second-pass adjacent-region claim (\u00a74.9 / \u00a711.3). Iterate tribes in
    # alphabetical order so inter-tribe collisions resolve deterministically.
    if second_region_by_tribe is None:
        for tribe in sorted(tribes):
            home_region_id = home_region_by_tribe[tribe]
            adj = adjacent_regions(state, home_region_id)
            adjacent_claim: str | None = None
            for cand in adj:  # adj is already sorted alphabetically
                cand_region = state.regions[cand]
                if cand_region.owner is None:
                    adjacent_claim = cand
                    break
            if adjacent_claim is not None:
                state.regions[adjacent_claim].owner = tribe
            else:
                # Degenerate map case: every neighbour is already another tribe's
                # home. Record and continue -- do NOT steal a neighbour's home.
                state.announcements.append(
                    Announcement(
                        tick=0,
                        kind="starting_adjacent_unavailable",
                        parties=[tribe],
                        detail=home_region_id,
                    )
                )
    else:
        for tribe in tribes:
            home_region_id = home_region_by_tribe[tribe]
            adjacent_claim = second_region_by_tribe.get(tribe)
            if adjacent_claim is None:
                state.announcements.append(
                    Announcement(
                        tick=0,
                        kind="starting_adjacent_unavailable",
                        parties=[tribe],
                        detail=home_region_id,
                    )
                )
                continue
            if adjacent_claim not in state.regions:
                raise ValueError(
                    f"unknown authored second region {adjacent_claim!r} for tribe {tribe!r}"
                )
            if adjacent_claim not in adjacent_regions(state, home_region_id):
                raise ValueError(
                    f"authored second region {adjacent_claim!r} is not adjacent to "
                    f"home {home_region_id!r} for tribe {tribe!r}"
                )
            adjacent_region = state.regions[adjacent_claim]
            if adjacent_region.owner is not None and adjacent_region.owner != tribe:
                raise ValueError(
                    f"authored second region {adjacent_claim!r} for tribe {tribe!r} "
                    f"is already owned by {adjacent_region.owner!r}"
                )
            adjacent_region.owner = tribe

    if "grey" in tribes:
        grey_home = state.regions[home_region_by_tribe["grey"]]
        grey_home.structures.append("fort")
    if "brown" in tribes:
        brown_home_id = home_region_by_tribe["brown"]
        brown_home = state.regions[brown_home_id]
        brown_home.structures.append("road")
        adj = adjacent_regions(state, brown_home_id)
        if adj:
            target = adj[0]
            brown_home.road_targets[len(brown_home.structures) - 1] = target


def procedural_map(state: GameState, seed: int) -> None:
    raise NotImplementedError(
        "Procedural map generation (RULES_v2.md \u00a711) deferred to v2.1; "
        "use build_hand_map, build_expanded_map, or build_continent_map_6p."
    )
