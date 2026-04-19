"""Map construction.

Two hand-built maps:

- `build_hand_map` + `MINIMAL_REGION_LAYOUT`: the original v2.0 6-region
  test map used to validate the tick resolution loop. Too thin to force
  contested borders.

- `build_expanded_map` + `EXPANDED_REGION_LAYOUT`: a 16-region map
  designed so every tribe has direct adjacency pressure with at least two
  rivals. The 4 central regions (ruins_ctr, river_crossing, shrine_vale,
  dark_forest) are the dispute zone -- any pair of tribes can reach any
  central region in 2-3 ticks through trails that cross each other's
  natural expansion paths.

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
# Shared placement core
# ---------------------------------------------------------------------------


def _place_tribes_core(
    state: GameState,
    tribes: List[str],
    home_region_by_tribe: Dict[str, str],
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
        "use build_hand_map or build_expanded_map."
    )
