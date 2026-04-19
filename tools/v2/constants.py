"""Normative constants mirroring packages/engine2/src/constants.ts.

Single source of truth is RULES_v2.md \u00a74. Any divergence from the TS
package is a bug in whichever came last.
"""

from __future__ import annotations

from typing import Dict, Tuple

# Influence production (\u00a74.1)
REGION_PRODUCTION: Dict[str, int] = {
    "plains": 2,
    "mountains": 2,
    "swamps": 1,
    "desert": 1,
    "ruins": 3,
    "forest": 1,
    "river_crossing": 2,
}

STRUCTURE_PRODUCTION_BONUS: Dict[str, int] = {
    "granary": 1,
    "shrine": 1,
}

# Force recruiting (\u00a74.2)
FORCE_RECRUIT_COST: Dict[int, int] = {1: 2, 2: 5, 3: 12, 4: 30}
FORCE_TRAVEL_PENALTY: Dict[int, int] = {1: 0, 2: 0, 3: 1, 4: 2}
FORGE_REQUIRED_FOR_TIER: int = 4

# Structure costs (\u00a74.3)
STRUCTURE_COST: Dict[str, int] = {
    "granary": 8,
    "fort": 10,
    "road": 6,
    "watchtower": 6,
    "shrine": 12,
    "forge": 15,
}
MAX_STRUCTURES_PER_REGION: int = 2


def base_trail_length(a: str, b: str) -> int:
    """Symmetric base trail length in ticks for a terrain pair (\u00a74.4)."""
    pair = "+".join(sorted([a, b]))
    if pair == "plains+plains":
        return 1
    if pair == "plains+river_crossing":
        return 1
    if pair == "mountains+mountains":
        return 3
    if pair == "swamps+swamps":
        return 3
    return 2


def road_modified_length(base_length: int) -> int:
    return max(1, base_length // 2)


# Combat (\u00a74.5, \u00a77)
COMBAT_DEFENDER_OWN_REGION_BONUS: int = 1
COMBAT_FORT_BONUS: int = 1
COMBAT_REINFORCEMENT_BONUS_PER_ALLY: int = 1
COMBAT_REINFORCEMENT_BONUS_CAP: int = 2
COMBAT_SCOUT_REVEAL_PENALTY: int = -1

# Scouts & caravans (\u00a74.6, \u00a74.7)
SCOUT_COST: int = 3
SCOUT_DWELL_TICKS: int = 1

CARAVAN_TRAVEL_TICKS_DEFAULT: int = 2
CARAVAN_INTERCEPT_MIN_TIER: int = 2
CARAVAN_DECLINE_REFUND_FRACTION: float = 0.5

# Reputation (\u00a74.8)
REPUTATION_PENALTY_DURATION_EARLY_BREAK: int = 4
REPUTATION_PENALTY_DURATION_LATE_BREAK: int = 2
REPUTATION_EARLY_BREAK_THRESHOLD_TICKS: int = 3

# Starting conditions (\u00a74.9)
TRIBE_HOME_TERRAIN: Dict[str, str] = {
    "orange": "plains",
    "grey": "mountains",
    "brown": "swamps",
    "red": "desert",
}
STARTING_INFLUENCE: Dict[str, int] = {
    "orange": 5,
    "grey": 5,
    "brown": 5,
    "red": 10,
}
STARTING_GARRISON_TIER: int = 2

FUZZY_TIER: Dict[int, str] = {
    1: "raiding_party",
    2: "warband",
    3: "large_host",
    4: "massive_army",
}

# Victory (\u00a78)
TERRITORIAL_DOMINANCE_FRACTION: float = 0.6
ECONOMIC_SUPREMACY_FRACTION: float = 0.5
CULTURAL_SHRINE_REQUIREMENT: int = 4

FINAL_SCORE_WEIGHTS: Dict[str, float] = {
    "regions_owned": 0.40,
    "influence_share": 0.30,
    "shrines_owned": 0.20,
    "active_naps": 0.10,
}

# Defaults for MatchConfig
DEFAULT_TICK_LIMIT: int = 60
DEFAULT_VICTORY_SUSTAIN_TICKS: int = 3
DEFAULT_NAP_LENGTH: int = 8
DEFAULT_SHARED_VISION_LENGTH: int = 5
