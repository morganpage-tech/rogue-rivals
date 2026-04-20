#!/usr/bin/env python3
"""
**Legacy** synchronous-turn simulator (v0.7.x resource economy). Not the canonical v2 ruleset.

Canonical design and engine: `RULES.md`, `GDD.md`, `packages/engine2`, `tools/v2/`.
This file remains for `run_llm_batch.py`, `llm_agent.py`, and validating archived v0.7 JSONL.

Original docstring — RULES v0.7.3 era, SIMULATION_SCHEMA.md v1.0.

Ambiguities (also noted in simulations/SUMMARY_v0.6_initial.md):
- VP>=8 ends immediately after that turn; remaining seats that round are skipped.
  end_of_round_resolution still runs once for the partial round.
- Great Hall ends after the full round completes (everyone gets their seat that round).
- Round cap: exactly 15 rounds may be played; after round 15 end_of_round_resolution, trigger is round_limit.
- Forge cost tie-break: lexicographically smallest feasible 3-resource multiset (see _forge_triple).
- Deterministic timestamps in run_metadata derived from seed so repeated runs match bytes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import sys
import time
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))
from collections import defaultdict
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Sequence, Set, Tuple

SCHEMA_VERSION = "1.0"
RULES_VERSION = "v0.8"

VP_WIN_THRESHOLD = 8
# Hard cap on total per-player turns in a match (safety; 15 rounds * 4 players = 60 normally)
MAX_TURNS_SAFETY = 200

RES_KEYS = ("T", "O", "F", "Rel", "S")
REGION_KEYS = ("plains", "mountains", "swamps", "desert", "ruins")

TRIBE_HOME: Dict[str, Tuple[str, str]] = {
    "orange": ("plains", "T"),
    "grey": ("mountains", "O"),
    "brown": ("swamps", "F"),
    "red": ("desert", "Rel"),
}

REGION_TO_RES = {
    "plains": "T",
    "mountains": "O",
    "swamps": "F",
    "desert": "Rel",
    "ruins": "S",
}

BUILD_ORDER = ("shack", "den", "watchtower", "forge", "great_hall")

# -----------------------------------------------------------------------------
# Experimental rule knobs (off by default; canonical v0.7.3.1 rules apply when
# neither env var is set). These are intended for A/B rule experiments only;
# any batch run with non-default values is NOT a v0.7.3.1 canonical batch.
#
# RR_AMBUSH_MULT   integer multiplier applied to pre-ambush yield on a hit
#                  (canonical = 2; tested alternatives: 3)
# RR_AMBUSH_COST_S integer Scrap cost to set an ambush
#                  (canonical = 1; tested alternatives: 0 = free ambush)
# RR_AMBUSH_PERSIST_ROUNDS how many end-of-round ticks an ambush survives
#                  (canonical v0.7.4 = 2; set 1 to replay v0.7.3.1 baselines)
# RR_BEAD_VULN_MODE  {"off","deny","steal"} bead-in-transit rule.
#                  Canonical v0.8 = "steal". Trade beads earned in the current
#                  round are placed in `pending_beads` and the 2-bead -> 1-VP
#                  conversion is deferred to end_of_round. At EOR, if the
#                  earner was a victim of any successful ambush that round,
#                  pending beads are transferred to the first successful
#                  ambusher (who banks + converts them). Otherwise they bank
#                  normally. "deny" variant destroys the beads instead of
#                  transferring. "off" reverts to the v0.7.4 behaviour where
#                  beads are immune to ambush (kept for regression / replay
#                  use; any batch run with RR_BEAD_VULN_MODE=off is NOT a
#                  canonical v0.8 batch).
#
# v0.7.4 note: the canonical default for AMBUSH_PERSIST_ROUNDS was bumped from
# 1 to 2 after the raider A/B experiment in simulations/raider_ab/ showed this
# is the only lever that meaningfully improves raider hit rate without
# distorting the balance of economic archetypes.
# -----------------------------------------------------------------------------
try:
    AMBUSH_MULT = int(os.environ.get("RR_AMBUSH_MULT", "2"))
except ValueError:
    AMBUSH_MULT = 2
try:
    AMBUSH_COST_S = int(os.environ.get("RR_AMBUSH_COST_S", "1"))
except ValueError:
    AMBUSH_COST_S = 1
try:
    AMBUSH_PERSIST_ROUNDS = int(os.environ.get("RR_AMBUSH_PERSIST_ROUNDS", "2"))
except ValueError:
    AMBUSH_PERSIST_ROUNDS = 2

_BEAD_VULN_RAW = os.environ.get("RR_BEAD_VULN_MODE", "steal").strip().lower()
if _BEAD_VULN_RAW not in ("off", "deny", "steal"):
    _BEAD_VULN_RAW = "steal"
BEAD_VULN_MODE = _BEAD_VULN_RAW

# Greedy / trade heuristics (v0.7.1 agents; bead VP, no new-partner bonus)
W1_AFFORD_DELTA = 10
W2_FUTURE_NEED = 2
W_BEAD = 5  # trade completes -> +1 bead ~= 0.5 VP scale factor
W4_DIVERSIFY = 2
PENALTY_ZERO_NEEDED = 25
GH_RESOURCE_BOOST = 8  # at 5+ VP, weight Great Hall ingredients in future-need scoring


def empty_res() -> Dict[str, int]:
    return {k: 0 for k in RES_KEYS}


def canonical_pair(a: str, b: str) -> str:
    return f"{a}-{b}" if a < b else f"{b}-{a}"


def stable_agent_rng(seed: int, round_num: int, pid: str) -> random.Random:
    """Deterministic RNG for agent decisions (never uses global random)."""
    idx = int(pid[1]) if len(pid) >= 2 and pid[1].isdigit() else 0
    x = seed ^ (round_num * 1_000_003) ^ (idx * 97_673) ^ (len(pid) << 19)
    return random.Random(x & 0xFFFFFFFFFFFFFFFF)


@dataclass
class PlayerState:
    pid: str
    tribe: str
    agent: str
    agent_params: Dict[str, Any]
    vp: int = 0
    resources: Dict[str, int] = field(default_factory=empty_res)
    beads: int = 0
    partners_traded: List[str] = field(default_factory=list)
    buildings: Set[str] = field(default_factory=set)
    active_ambush_region: Optional[str] = None
    trailing_bonus_active: bool = False
    watchtower_used: bool = False
    tribute_route: Optional[Dict[str, Any]] = None
    tribute_request_used: bool = False
    beads_earned_this_round: int = 0
    # v0.8 canonical rule: beads awarded from trades in the current round sit
    # here until end_of_round. If the player was a victim of any ambush that
    # round, pending beads are transferred to the first successful ambusher
    # (canonical: steal mode). Otherwise they are added to `beads` and the
    # normal 2-bead -> 1-VP conversion runs at EOR. See BEAD_VULN_MODE for the
    # regression / deny alternatives.
    pending_beads: int = 0


class GameEngine:
    def __init__(
        self,
        seed: int,
        tribes: Sequence[str],
        agents: Sequence[str],
        agent_params_list: Sequence[Dict[str, Any]],
        turn_order: Optional[Sequence[str]] = None,
    ):
        assert len(tribes) == len(agents) == len(agent_params_list)
        self.seed = seed
        self.rng = random.Random(seed)
        self.num_players = len(tribes)
        self.player_ids = [f"P{i+1}" for i in range(self.num_players)]

        self.players: Dict[str, PlayerState] = {}
        for i, pid in enumerate(self.player_ids):
            ps = PlayerState(pid, tribes[i], agents[i], dict(agent_params_list[i]))
            hr = TRIBE_HOME[tribes[i]][1]
            ps.resources[hr] = 2
            self.players[pid] = ps

        if turn_order is not None:
            self.turn_order = list(turn_order)
        else:
            o = list(self.player_ids)
            self.rng.shuffle(o)
            self.turn_order = o

        self.scrap_pool = 5 * self.num_players
        self.round_num = 0
        self.match_ended = False
        self.end_trigger: Optional[str] = None
        self.great_hall_this_round = False

        self.pending_offers: Dict[str, Dict[str, Any]] = {}
        self.offer_seq = 0

        # stats
        self.trades_completed_total = 0
        self.trades_by_pair: Dict[str, int] = defaultdict(int)
        self.buildings_by_player: Dict[str, List[str]] = {p: [] for p in self.player_ids}
        self.ambushes_attempted = self.ambushes_hit = self.ambushes_scouted = self.ambushes_expired = 0
        self.scouts_attempted = 0
        # Per-ambusher TTL counter (end-of-round ticks remaining); canonical v0.7.4
        # rules expire after AMBUSH_PERSIST_ROUNDS ticks (default 2).
        self._ambush_ttl: Dict[str, int] = {p: 0 for p in self.player_ids}
        # Per-ambusher successful-hit counter (used by agent heuristics to decide
        # when to stop re-arming and pivot to building). Not serialised.
        self._ambush_hits: Dict[str, int] = {p: 0 for p in self.player_ids}
        # v0.8 per-round bookkeeping for bead-diversion on hit (reset in
        # end_of_round). _ambushed_this_round counts hits suffered;
        # _hit_by_this_round records the ambushers in hit order so pending
        # beads are transferred to the *first* hitter deterministically.
        self._ambushed_this_round: Dict[str, int] = {p: 0 for p in self.player_ids}
        self._hit_by_this_round: Dict[str, List[str]] = {p: [] for p in self.player_ids}

        self._gathered: Dict[str, Dict[str, int]] = {p: empty_res() for p in self.player_ids}
        self._spent_build: Dict[str, Dict[str, int]] = {p: empty_res() for p in self.player_ids}
        self._spent_ambush: Dict[str, int] = {p: 0 for p in self.player_ids}
        self._vp_build: Dict[str, int] = {p: 0 for p in self.player_ids}
        self._vp_bead: Dict[str, int] = {p: 0 for p in self.player_ids}

        self.vp_curve: Dict[str, List[int]] = {p: [0] for p in self.player_ids}
        self.leader_identity_history: List[str] = []
        self.rounds_last_place: Dict[str, int] = {p: 0 for p in self.player_ids}

        # Short string digest for agent prompts (LLM track); deterministic order append
        self.recent_turn_summaries: List[str] = []

    def home_region(self, pid: str) -> str:
        return TRIBE_HOME[self.players[pid].tribe][0]

    def home_res(self, pid: str) -> str:
        return TRIBE_HOME[self.players[pid].tribe][1]

    def _can_pay(self, ps: PlayerState, cost: Dict[str, int]) -> bool:
        return all(ps.resources.get(k, 0) >= v for k, v in cost.items())

    def compute_base_yield(self, pid: str, region: str) -> int:
        if region == "ruins":
            return min(1, self.scrap_pool)
        return 2 if region == self.home_region(pid) else 1

    def compute_gather_yield(self, pid: str, region: str) -> Tuple[int, str]:
        ps = self.players[pid]
        amt = self.compute_base_yield(pid, region)
        if region != "ruins":
            if {"shack", "den"} & ps.buildings and region == self.home_region(pid):
                amt += sum(1 for b in ("shack", "den") if b in ps.buildings)
            if "forge" in ps.buildings:
                amt += 1
            if ps.trailing_bonus_active:
                amt += 1
        else:
            if "forge" in ps.buildings:
                amt += 1
            if ps.trailing_bonus_active:
                amt += 1
            amt = min(amt, self.scrap_pool)
        rk = REGION_TO_RES[region]
        return amt, rk

    def ambushers_at(self, region: str) -> List[str]:
        return [p for p in self.turn_order if self.players[p].active_ambush_region == region]

    def _forge_triple(self, ps: PlayerState) -> Optional[Tuple[str, str, str]]:
        keys = list(RES_KEYS)
        cand: List[Tuple[str, str, str]] = []
        for i in range(5):
            for j in range(i + 1, 5):
                for k in range(j + 1, 5):
                    a, b, c = keys[i], keys[j], keys[k]
                    need_s = 1 + (1 if "S" in (a, b, c) else 0)
                    if ps.resources.get(a, 0) < 1 or ps.resources.get(b, 0) < 1 or ps.resources.get(c, 0) < 1:
                        continue
                    if ps.resources.get("S", 0) < need_s:
                        continue
                    cand.append((a, b, c))
        if not cand:
            return None
        cand.sort()
        return cand[0]

    def compute_build_cost(self, pid: str, bt: str) -> Optional[Dict[str, int]]:
        ps = self.players[pid]
        home = self.home_res(pid)
        if bt == "shack":
            return {home: 1, "S": 1}
        if bt == "den":
            for nh in sorted(k for k in ("T", "O", "F", "Rel") if k != home):
                c = {home: 1, nh: 1, "S": 1}
                if self._can_pay(ps, c):
                    return c
            return None
        if bt == "watchtower":
            # "2 of any single resource + 1 Scrap". When k == "S", that is 2 + 1 = 3 Scrap total;
            # the dict-literal {k: 2, "S": 1} would key-collide to {"S": 1}, so construct explicitly.
            for k in RES_KEYS:
                if k == "S":
                    c = {"S": 3}
                else:
                    c = {k: 2, "S": 1}
                if self._can_pay(ps, c):
                    return c
            return None
        if bt == "forge":
            t = self._forge_triple(ps)
            if t is None:
                return None
            cost = {x: 1 for x in t}
            cost["S"] = cost.get("S", 0) + 1
            return cost
        if bt == "great_hall":
            return {"T": 1, "O": 1, "F": 1, "Rel": 1, "S": 2}
        return None

    def legal_actions(self, pid: str) -> List[Dict[str, Any]]:
        ps = self.players[pid]
        acts: List[Dict[str, Any]] = []
        for reg in REGION_KEYS:
            acts.append({"kind": "gather", "region": reg})
        for reg in REGION_KEYS:
            acts.append({"kind": "scout", "region": reg})
        if ps.resources.get("S", 0) >= AMBUSH_COST_S and ps.active_ambush_region is None:
            for reg in ("plains", "mountains", "swamps", "desert", "ruins"):
                acts.append({"kind": "ambush", "region": reg})
        for bt in BUILD_ORDER:
            if bt in ps.buildings:
                continue
            c = self.compute_build_cost(pid, bt)
            if c and self._can_pay(ps, c):
                acts.append({"kind": "build", "building": bt})
        acts.append({"kind": "pass"})
        return acts

    def pay(self, pid: str, cost: Dict[str, int], ledger: Optional[Dict[str, Dict[str, int]]] = None) -> None:
        ps = self.players[pid]
        assert self._can_pay(ps, cost)
        for k, v in cost.items():
            ps.resources[k] -= v
            if ledger is not None:
                ledger[pid][k] = ledger[pid].get(k, 0) + v

    def apply_build(self, pid: str, bt: str, cost: Dict[str, int]) -> int:
        vp_gain = {"shack": 1, "den": 1, "watchtower": 2, "forge": 2, "great_hall": 4}[bt]
        self.pay(pid, cost, self._spent_build)
        ps = self.players[pid]
        ps.buildings.add(bt)
        ps.vp += vp_gain
        self._vp_build[pid] += vp_gain
        self.buildings_by_player[pid].append(bt)
        if bt == "great_hall":
            self.great_hall_this_round = True
        return vp_gain

    def apply_bead_conversions(self, pid: str) -> List[Dict[str, Any]]:
        ps = self.players[pid]
        out: List[Dict[str, Any]] = []
        while ps.beads >= 2:
            ps.beads -= 2
            ps.vp += 1
            self._vp_bead[pid] += 1
            out.append({"type": "bead_converted", "round": self.round_num, "player_id": pid, "vp_gained": 1})
        return out

    def resolve_trade(self, offer: Dict[str, Any]) -> Tuple[bool, Dict[str, Any], List[Dict[str, Any]]]:
        oid = offer["id"]
        a, b = offer["offerer"], offer["recipient"]
        pa, pb = self.players[a], self.players[b]
        off, req = dict(offer["offered"]), dict(offer["requested"])
        if not self._can_pay(pa, off) or not self._can_pay(pb, req):
            return False, {}, []
        first = b not in pa.partners_traded
        for k in RES_KEYS:
            pa.resources[k] -= off.get(k, 0)
            pa.resources[k] += req.get(k, 0)
            pb.resources[k] -= req.get(k, 0)
            pb.resources[k] += off.get(k, 0)
        beads_awarded: Dict[str, int] = {a: 0, b: 0}
        extra: List[Dict[str, Any]] = []
        if b not in pa.partners_traded:
            pa.partners_traded.append(b)
        if a not in pb.partners_traded:
            pb.partners_traded.append(a)
        for pid, partner in ((a, b), (b, a)):
            ps = self.players[pid]
            if ps.beads_earned_this_round < 2:
                if BEAD_VULN_MODE == "off":
                    # Regression / replay only. Canonical v0.8 flows below.
                    ps.beads += 1
                else:
                    # v0.8 canonical: bead is pending until end_of_round so
                    # that ambush pressure on the earner can divert it.
                    ps.pending_beads += 1
                ps.beads_earned_this_round += 1
                beads_awarded[pid] = 1
                extra.append({"type": "bead_earned", "round": self.round_num, "player_id": pid, "partner": partner})
            else:
                beads_awarded[pid] = 0
                extra.append(
                    {
                        "type": "bead_capped",
                        "round": self.round_num,
                        "player_id": pid,
                        "partner": partner,
                    }
                )
        # v0.8 canonical: the 2-bead -> 1-VP conversion is deferred to
        # end_of_round so a pending bead can actually be diverted. Only the
        # legacy "off" mode performs immediate conversion here (kept for
        # regression / replay determinism).
        if BEAD_VULN_MODE == "off":
            for pid in sorted((a, b)):
                extra.extend(self.apply_bead_conversions(pid))
        self.trades_completed_total += 1
        self.trades_by_pair[canonical_pair(a, b)] += 1
        resolved = {
            "type": "trade_resolved",
            "round": self.round_num,
            "offer_id": oid,
            "offerer_id": a,
            "acceptor_id": b,
            "offered": off,
            "requested": req,
            "beads_awarded": beads_awarded,
            "first_trade_between_pair": first,
        }
        return True, resolved, extra

    def expire_my_offers(self, pid: str) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        rm = [oid for oid, o in self.pending_offers.items() if o["offerer"] == pid]
        for oid in rm:
            self.pending_offers.pop(oid)
            out.append({"type": "trade_expired", "round": self.round_num, "offer_id": oid})
        return out

    def snapshot_private(self, pid: str) -> Dict[str, Any]:
        ps = self.players[pid]
        return {
            "vp": ps.vp,
            "resources": {k: ps.resources.get(k, 0) for k in RES_KEYS},
            "beads": ps.beads,
            "partners_traded": list(ps.partners_traded),
            "buildings": sorted(ps.buildings),
            "active_ambush_region": ps.active_ambush_region,
            "trailing_bonus_active": ps.trailing_bonus_active,
            "tribute_route": deepcopy(ps.tribute_route) if ps.tribute_route else None,
            "beads_earned_this_round": ps.beads_earned_this_round,
        }

    def incoming_offers(self, pid: str) -> List[Dict[str, Any]]:
        res: List[Dict[str, Any]] = []
        for oid in sorted(self.pending_offers.keys()):
            o = self.pending_offers[oid]
            if o["recipient"] == pid:
                res.append(
                    {
                        "offer_id": oid,
                        "from": o["offerer"],
                        "offered": dict(o["offered"]),
                        "requested": dict(o["requested"]),
                        "tribute_route_payment": bool(o.get("tribute_route_payment")),
                    }
                )
        return res

    def standings(self) -> Dict[str, Dict[str, Any]]:
        order = sorted(self.player_ids, key=lambda p: (-self.players[p].vp, -len(self.players[p].buildings), p))
        out: Dict[str, Dict[str, Any]] = {}
        rank = 0
        last = None
        pos = 0
        for p in order:
            vp = self.players[p].vp
            pos += 1
            if vp != last:
                rank = pos
                last = vp
            out[p] = {"vp": vp, "rank": rank, "beads": self.players[p].beads}
        return out

    def leader_id(self) -> str:
        return sorted(
            self.player_ids,
            key=lambda p: (
                -self.players[p].vp,
                -len(self.players[p].buildings),
                -len(self.players[p].partners_traded),
                p,
            ),
        )[0]


def compute_build_cost_for_player(
    eng: GameEngine, pid: str, ps: PlayerState, bt: str
) -> Optional[Dict[str, int]]:
    """Same logic as GameEngine.compute_build_cost but for an arbitrary PlayerState (simulated trade)."""
    home = eng.home_res(pid)
    if bt == "shack":
        return {home: 1, "S": 1}
    if bt == "den":
        for nh in sorted(k for k in ("T", "O", "F", "Rel") if k != home):
            c = {home: 1, nh: 1, "S": 1}
            if eng._can_pay(ps, c):
                return c
        return None
    if bt == "watchtower":
        # See GameEngine.compute_build_cost for the S-collision rationale.
        for k in RES_KEYS:
            if k == "S":
                c = {"S": 3}
            else:
                c = {k: 2, "S": 1}
            if eng._can_pay(ps, c):
                return c
        return None
    if bt == "forge":
        keys = list(RES_KEYS)
        cand: List[Tuple[str, str, str]] = []
        for i in range(5):
            for j in range(i + 1, 5):
                for k in range(j + 1, 5):
                    a, b, c = keys[i], keys[j], keys[k]
                    need_s = 1 + (1 if "S" in (a, b, c) else 0)
                    if ps.resources.get(a, 0) < 1 or ps.resources.get(b, 0) < 1 or ps.resources.get(c, 0) < 1:
                        continue
                    if ps.resources.get("S", 0) < need_s:
                        continue
                    cand.append((a, b, c))
        if not cand:
            return None
        cand.sort()
        t = cand[0]
        cost = {x: 1 for x in t}
        cost["S"] = cost.get("S", 0) + 1
        return cost
    if bt == "great_hall":
        return {"T": 1, "O": 1, "F": 1, "Rel": 1, "S": 2}
    return None


def _affordable_build_set(eng: GameEngine, pid: str, ps: PlayerState) -> Set[str]:
    out: Set[str] = set()
    for bt in BUILD_ORDER:
        if bt in ps.buildings:
            continue
        c = compute_build_cost_for_player(eng, pid, ps, bt)
        if c and eng._can_pay(ps, c):
            out.add(bt)
    return out


def future_need_weights(eng: GameEngine, pid: str, ps: PlayerState) -> Dict[str, int]:
    """How many not-yet-built building types still structurally depend on each resource."""
    home = eng.home_res(pid)
    w = {k: 0 for k in RES_KEYS}
    for bt in BUILD_ORDER:
        if bt in ps.buildings:
            continue
        if bt == "shack":
            w[home] += 1
            w["S"] += 1
        elif bt == "den":
            w[home] += 1
            w["S"] += 1
            for nh in ("T", "O", "F", "Rel"):
                if nh != home:
                    w[nh] += 1
        elif bt == "watchtower":
            for k in RES_KEYS:
                w[k] += 1
        elif bt == "forge":
            for k in RES_KEYS:
                w[k] += 1
        elif bt == "great_hall":
            for k in ("T", "O", "F", "Rel"):
                w[k] += 1
            w["S"] += 2
    return w


def immediate_next_build(eng: GameEngine, pid: str, ps: PlayerState) -> Optional[str]:
    for bt in BUILD_ORDER:
        if bt not in ps.buildings:
            return bt
    return None


def is_endgame(eng: GameEngine) -> bool:
    """True if any player has reached the endgame VP band (>=6, within 2 of winning at 8)."""
    return any(eng.players[p].vp >= 6 for p in eng.player_ids)


def any_player_vp_at_least(eng: GameEngine, threshold: int) -> bool:
    return any(eng.players[p].vp >= threshold for p in eng.player_ids)


def recipient_state_after_trade_resolution(
    eng: GameEngine, recipient_pid: str, offered: Dict[str, int], requested: Dict[str, int]
) -> PlayerState:
    """Simulate resource transfer + this round's bead award/conversion for the recipient only (deterministic)."""
    st = deepcopy(eng.players[recipient_pid])
    for k in RES_KEYS:
        st.resources[k] -= requested.get(k, 0)
        st.resources[k] += offered.get(k, 0)
    if st.beads_earned_this_round < 2:
        st.beads += 1
        st.beads_earned_this_round += 1
    while st.beads >= 2:
        st.beads -= 2
        st.vp += 1
    return st


def trade_enables_win_for_recipient(eng: GameEngine, recipient_pid: str, st: PlayerState) -> bool:
    """True if bead conversions already reach the threshold, or one affordable build pushes VP to win threshold."""
    if st.vp >= VP_WIN_THRESHOLD:
        return True
    for bt in BUILD_ORDER:
        if bt in st.buildings:
            continue
        c = compute_build_cost_for_player(eng, recipient_pid, st, bt)
        if not c or not eng._can_pay(st, c):
            continue
        vpg = {"shack": 1, "den": 1, "watchtower": 2, "forge": 2, "great_hall": 4}[bt]
        if st.vp + vpg >= VP_WIN_THRESHOLD:
            return True
    return False


def leader_awareness_should_reject(
    eng: GameEngine,
    recipient_pid: str,
    offerer_pid: str,
    offered: Dict[str, int],
    requested: Dict[str, int],
    *,
    skip_for_alliance_partner: bool = False,
    is_tribute_payment: bool = False,
) -> bool:
    # Under v0.7.2, strategic agents refuse to feed a near-winning opponent with resources or Beads,
    # unless the trade also closes out the match for us (or we are also racing, or it is tribute).
    if is_tribute_payment or skip_for_alliance_partner:
        return False
    if not any_player_vp_at_least(eng, 4):
        return False
    offerer = eng.players[offerer_pid]
    if offerer.vp < VP_WIN_THRESHOLD - 2:
        return False
    recipient = eng.players[recipient_pid]
    if recipient.vp >= VP_WIN_THRESHOLD - 2:
        return False
    st = recipient_state_after_trade_resolution(eng, recipient_pid, offered, requested)
    if trade_enables_win_for_recipient(eng, recipient_pid, st):
        return False
    return True


def player_is_strict_leader(eng: GameEngine, pid: str) -> bool:
    return eng.leader_id() == pid


def _great_hall_ingredient_weights() -> Dict[str, int]:
    return {"T": 1, "O": 1, "F": 1, "Rel": 1, "S": 2}


def trade_utility_greedy(
    eng: GameEngine,
    pid: str,
    ps: PlayerState,
    partner_id: str,
    offered: Dict[str, int],
    requested: Dict[str, int],
    offerer_ps: PlayerState,
) -> float:
    """Forward-looking utility for accepting a trade as the recipient (we pay requested, gain offered)."""
    off = dict(offered)
    req = dict(requested)
    if not eng._can_pay(ps, req):
        return -1e9
    if not eng._can_pay(offerer_ps, off):
        return -1e9

    st = deepcopy(ps)
    for k in RES_KEYS:
        st.resources[k] -= req.get(k, 0)
        st.resources[k] += off.get(k, 0)

    before_aff = _affordable_build_set(eng, pid, ps)
    after_aff = _affordable_build_set(eng, pid, st)
    new_types = after_aff - before_aff
    u = W1_AFFORD_DELTA * len(new_types)

    fut = dict(future_need_weights(eng, pid, ps))
    if ps.vp >= 5 and "great_hall" not in ps.buildings:
        gh_w = _great_hall_ingredient_weights()
        for k, w in gh_w.items():
            fut[k] = fut.get(k, 0) + GH_RESOURCE_BOOST * w

    net = {k: st.resources.get(k, 0) - ps.resources.get(k, 0) for k in RES_KEYS}
    u += W2_FUTURE_NEED * sum(max(0, net[k]) * fut[k] for k in RES_KEYS)

    bead_mult = 3 if ps.vp >= 6 else 1
    u += W_BEAD * bead_mult

    if any(ps.resources.get(k, 0) == 0 and st.resources.get(k, 0) > 0 for k in RES_KEYS):
        u += W4_DIVERSIFY

    home = eng.home_res(pid)
    nb = immediate_next_build(eng, pid, ps)
    if nb:
        c = compute_build_cost_for_player(eng, pid, ps, nb)
        if c:
            for k in RES_KEYS:
                if c.get(k, 0) > 0 and st.resources.get(k, 0) == 0:
                    skip_penalty = k == "S" or (
                        ps.vp >= 5
                        and "great_hall" not in ps.buildings
                        and k != home
                    )
                    if not skip_penalty:
                        u -= PENALTY_ZERO_NEEDED

    return u


def _state_after_accepting_offers(
    eng: GameEngine,
    ps: PlayerState,
    incoming: List[Dict[str, Any]],
    accept_ids: Sequence[str],
) -> PlayerState:
    """Simulate our resources after accepting offers, in deterministic sorted order (recipient side only)."""
    st = deepcopy(ps)
    by_id = {o["offer_id"]: o for o in incoming}
    for oid in sorted(accept_ids):
        o = by_id.get(oid)
        if not o:
            continue
        off = dict(o["offered"])
        req = dict(o["requested"])
        if not eng._can_pay(st, req):
            continue
        for k in RES_KEYS:
            st.resources[k] += off.get(k, 0) - req.get(k, 0)
    return st


def greedy_gather_action(eng: GameEngine, pid: str, ps: PlayerState) -> Dict[str, Any]:
    """When not building: prefer gathering a missing resource type unless the next build needs a surplus type."""
    target_bt = next((b for b in BUILD_ORDER if b not in ps.buildings), None)
    next_cost = compute_build_cost_for_player(eng, pid, ps, target_bt) if target_bt else None

    def need_for_next(rk: str) -> int:
        if not next_cost:
            return 0
        return max(0, next_cost.get(rk, 0) - ps.resources.get(rk, 0))

    best_reg = "ruins"
    best_score = (-10**9, -10**9, -10**9, 0)  # tuple for ordering

    for reg in REGION_KEYS:
        amt, rk = eng.compute_gather_yield(pid, reg)
        tier = 0
        if need_for_next(rk) > 0:
            tier = 3
        elif ps.resources.get(rk, 0) == 0:
            tier = 2
        else:
            tier = 1
        gained = min(amt, eng.scrap_pool) if reg == "ruins" else amt
        eff = min(need_for_next(rk), gained) if tier == 3 else (1 if tier == 2 else 0)
        key = (tier, eff, gained, amt)
        if key > best_score:
            best_score = key
            best_reg = reg

    return {"kind": "gather", "region": best_reg}


# -----------------------------------------------------------------------------
# Agents
# -----------------------------------------------------------------------------

AgentFn = Callable[[Dict[str, Any], random.Random], Dict[str, Any]]

AGENTS: Dict[str, AgentFn] = {}


def register_agent(name: str):
    def deco(fn: AgentFn):
        AGENTS[name] = fn
        return fn

    return deco


@register_agent("random")
def agent_random(view: Dict[str, Any], rng: random.Random) -> Dict[str, Any]:
    eng: GameEngine = view["_engine"]
    pid = view["acting_player"]
    incoming = view["pending_offers_to_you"]
    act = rng.choice(eng.legal_actions(pid))
    return {
        "trade_accept": [o["offer_id"] for o in incoming],
        "trade_reject": [],
        "trade_counter": [],
        "proposals": [],
        "action": act,
    }


def _closing_trade_proposals_greedy(
    eng: GameEngine, pid: str, ps: PlayerState, prefer_willing_opponents: bool = True
) -> List[Dict[str, Any]]:
    """When pushing for VP via beads, offer 1 home for 1 of a scarce resource."""
    out: List[Dict[str, Any]] = []
    hm = eng.home_res(pid)
    if ps.resources.get(hm, 0) < 1:
        return out
    gh_need = _great_hall_ingredient_weights()

    def rank_key(op: str, rk: str) -> Tuple[int, int, str]:
        opp = eng.players[op]
        willing = 1 if len(opp.partners_traded) > 0 else 0
        gh_pri = gh_need.get(rk, 0)
        stock = opp.resources.get(rk, 0)
        pref = willing if prefer_willing_opponents else 1
        return (pref * 100 + gh_pri * 10 + min(stock, 9), stock, op)

    scored: List[Tuple[Tuple[int, int, str], str, str]] = []
    for op in eng.player_ids:
        if op == pid:
            continue
        opp = eng.players[op]
        if prefer_willing_opponents and len(opp.partners_traded) == 0:
            continue
        for rk in RES_KEYS:
            if rk == hm:
                continue
            if opp.resources.get(rk, 0) < 1:
                continue
            scored.append((rank_key(op, rk), op, rk))
    if prefer_willing_opponents and not scored:
        return _closing_trade_proposals_greedy(eng, pid, ps, prefer_willing_opponents=False)

    scored.sort(reverse=True, key=lambda t: t[0])
    seen_to: Set[str] = set()
    for _key, op, rk in scored:
        if op in seen_to:
            continue
        seen_to.add(op)
        out.append({"to": op, "offered": {hm: 1}, "requested": {rk: 1}})
    return out


@register_agent("greedy_builder")
def agent_greedy_builder(view: Dict[str, Any], rng: random.Random) -> Dict[str, Any]:
    eng: GameEngine = view["_engine"]
    pid = view["acting_player"]
    ps = eng.players[pid]
    incoming = view["pending_offers_to_you"]
    endg = is_endgame(eng)
    leading = player_is_strict_leader(eng, pid)

    accept: List[str] = []
    reject_reasons: Dict[str, str] = {}
    for o in incoming:
        oid = o["from"]
        util = trade_utility_greedy(
            eng,
            pid,
            ps,
            oid,
            dict(o["offered"]),
            dict(o["requested"]),
            eng.players[oid],
        )
        if util <= 0:
            continue
        if leader_awareness_should_reject(
            eng,
            pid,
            oid,
            dict(o["offered"]),
            dict(o["requested"]),
            is_tribute_payment=bool(o.get("tribute_route_payment")),
        ):
            reject_reasons[o["offer_id"]] = "leader_awareness"
            continue
        accept.append(o["offer_id"])

    proposals: List[Dict[str, Any]] = []
    if ps.vp >= 6 and ps.beads <= 1:
        hm0 = eng.home_res(pid)
        if ps.resources.get(hm0, 0) >= 1:
            proposals.extend(_closing_trade_proposals_greedy(eng, pid, ps))

    action: Optional[Dict[str, Any]] = None
    if "great_hall" not in ps.buildings:
        c_gh = eng.compute_build_cost(pid, "great_hall")
        if c_gh and eng._can_pay(ps, c_gh):
            action = {"kind": "build", "building": "great_hall"}
    if action is None:
        for bt in BUILD_ORDER:
            if bt in ps.buildings:
                continue
            c = eng.compute_build_cost(pid, bt)
            if c and eng._can_pay(ps, c):
                action = {"kind": "build", "building": bt}
                break

    if action is None:
        pst = _state_after_accepting_offers(eng, ps, incoming, accept)
        want_ambush_risk = (
            endg
            and not leading
            and ps.vp >= 6
            and pst.resources.get("S", 0) >= AMBUSH_COST_S
            and ps.active_ambush_region is None
        )
        if want_ambush_risk:
            leader = eng.leader_id()
            action = {"kind": "ambush", "region": eng.home_region(leader)}
        else:
            action = greedy_gather_action(eng, pid, ps)

    return {
        "trade_accept": accept,
        "trade_reject": [o["offer_id"] for o in incoming if o["offer_id"] not in accept],
        "trade_reject_reasons": reject_reasons,
        "trade_counter": [],
        "proposals": proposals,
        "action": action,
    }


@register_agent("aggressive_raider")
def agent_aggressive_raider(view: Dict[str, Any], rng: random.Random) -> Dict[str, Any]:
    """v0.7.4 raider: ambush to disrupt, then convert stolen loot to builds.

    Context (from simulations/raider_ab/COMPARISON_raider_ab.md):
      - With ambush persistence bumped to 2 rounds in v0.7.4, the raider now
        lands roughly 30% of its ambushes (up from 12%), so stolen loot
        genuinely flows in. The v0.7.3.1 heuristic could not convert that
        loot into VP because it (a) re-armed too eagerly after every success
        and (b) never chased the Great Hall.
      - v0.7.4 raider: after landing 1+ ambushes this match, raise the bar
        for re-arming, actively pursue Great Hall, and use the smart
        resource-seeking gather (greedy_gather_action) instead of always
        mining Ruins.

    Behavioural identity preserved:
      - Still the only archetype that actively sets ambushes.
      - Still keeps its last Scrap for an ambush when behind mid-game.
      - Threshold curve still aggressive at behind_gap >= 1.
    """
    eng: GameEngine = view["_engine"]
    pid = view["acting_player"]
    ps = eng.players[pid]
    leader = eng.leader_id()
    lh = eng.home_region(leader)
    incoming = view["pending_offers_to_you"]
    endg = is_endgame(eng)
    leading = player_is_strict_leader(eng, pid)
    max_vp = max(eng.players[p].vp for p in eng.player_ids)
    behind_gap = max_vp - ps.vp
    my_hits = eng._ambush_hits.get(pid, 0)

    accept: List[str] = []
    reject_reasons: Dict[str, str] = {}
    for o in incoming:
        req = dict(o["requested"])
        if req.get("S", 0) > 0 and ps.resources.get("S", 0) <= 1 and leader != pid:
            continue
        if not eng._can_pay(ps, req):
            continue
        oid = o["from"]
        if leader_awareness_should_reject(
            eng,
            pid,
            oid,
            dict(o["offered"]),
            req,
            is_tribute_payment=bool(o.get("tribute_route_payment")),
        ):
            reject_reasons[o["offer_id"]] = "leader_awareness"
            continue
        accept.append(o["offer_id"])

    action: Optional[Dict[str, Any]] = None

    if "great_hall" not in ps.buildings:
        cgh = eng.compute_build_cost(pid, "great_hall")
        if cgh and eng._can_pay(ps, cgh):
            action = {"kind": "build", "building": "great_hall"}

    if action is None:
        pst_res = ps.resources
        last_scrap = pst_res.get("S", 0) == 1
        ambush_plausible = (
            last_scrap
            and ps.active_ambush_region is None
            and leader != pid
            and not leading
            and behind_gap >= 1
            and 3 <= eng.round_num <= 12
            and my_hits == 0
        )
        for bt in ("shack", "den"):
            if bt in ps.buildings:
                continue
            c = eng.compute_build_cost(pid, bt)
            if c and eng._can_pay(ps, c):
                if c.get("S", 0) >= 1 and ambush_plausible:
                    break
                action = {"kind": "build", "building": bt}
                break

    if action is None:
        for bt in ("watchtower", "forge"):
            if bt in ps.buildings:
                continue
            c = eng.compute_build_cost(pid, bt)
            if c and eng._can_pay(ps, c):
                action = {"kind": "build", "building": bt}
                break

    scout_chance = 0.04 if (endg and leading) else 0.10
    if action is None and rng.random() < scout_chance and ps.active_ambush_region is None:
        action = {"kind": "scout", "region": rng.choice(list(REGION_KEYS))}

    pst = _state_after_accepting_offers(eng, ps, incoming, accept)
    if (
        action is None
        and pst.resources.get("S", 0) >= AMBUSH_COST_S
        and ps.active_ambush_region is None
        and leader != pid
    ):
        do_ambush = False
        if ps.vp >= 6 and endg:
            do_ambush = not leading
        else:
            roll = rng.random()
            # Base aggressive curve (same as v0.7.3.1).
            thresh = 0.50 if behind_gap >= 2 else (0.30 if behind_gap == 1 else 0.12)
            # v0.7.4: mild post-hit throttle so the raider converts loot into
            # builds between raids, without abandoning its signature identity.
            # Tested values (scrap-reserve gather, persist=2, 50-match batch):
            #   throttle  raider_wr  trader_wr  raider_avgVP
            #   none      13.3%      55.0%      4.80
            #   0.75/0.50 16.7%      55.0%      4.97
            #   0.85/0.70 16.7%      55.0%      4.93
            # Trader dominance (~55%) is a separate, persist=2 side-effect
            # (trade beads are immune to ambush) and is a v0.8 design question.
            if my_hits >= 2:
                thresh *= 0.70
            elif my_hits == 1:
                thresh *= 0.85
            if leading and max_vp >= 6:
                thresh *= 0.35
            do_ambush = roll < thresh
        if do_ambush:
            action = {"kind": "ambush", "region": lh}

    # v0.7.4 gather policy: keep a Scrap reserve sufficient to fund an ambush
    # AND the next build's Scrap cost; beyond that, steer toward the next
    # missing build ingredient (via greedy_gather_action) so stolen loot is
    # actually converted to VP. Without the reserve, the raider starves itself
    # of the one resource that powers its signature action.
    if action is None:
        next_bt = next((b for b in BUILD_ORDER if b not in ps.buildings), None)
        next_cost_s = 0
        if next_bt is not None:
            nc = eng.compute_build_cost(pid, next_bt) or {}
            next_cost_s = int(nc.get("S", 0))
        # Want: 1 Scrap for ambush + the Scrap needed for the next build.
        scrap_target = AMBUSH_COST_S + next_cost_s if leader != pid else next_cost_s
        have_s = ps.resources.get("S", 0)
        if have_s < scrap_target and eng.scrap_pool > 0:
            action = {"kind": "gather", "region": "ruins"}
        else:
            action = greedy_gather_action(eng, pid, ps)

    return {
        "trade_accept": accept,
        "trade_reject": [o["offer_id"] for o in incoming if o["offer_id"] not in accept],
        "trade_reject_reasons": reject_reasons,
        "trade_counter": [],
        "proposals": [],
        "action": action,
    }


def _best_diversified_offer(
    eng: GameEngine, pid: str, ps: PlayerState
) -> Optional[Dict[str, Any]]:
    """Offer 1 home for 1 of the scarcest-needed resource held by the best-stocked willing opponent."""
    hm = eng.home_res(pid)
    if ps.resources.get(hm, 0) < 1:
        return None

    fut = future_need_weights(eng, pid, ps)
    nb = immediate_next_build(eng, pid, ps)
    next_cost = compute_build_cost_for_player(eng, pid, ps, nb) if nb else None

    def rk_priority(rk: str) -> Tuple[int, int]:
        miss = 0
        if next_cost:
            miss = max(0, next_cost.get(rk, 0) - ps.resources.get(rk, 0))
        return (miss, fut.get(rk, 0))

    ranked_rk = sorted((rk for rk in RES_KEYS if rk != hm), key=lambda rk: rk_priority(rk), reverse=True)

    def pick_for_rk(rk: str, require_willing: bool) -> Optional[Dict[str, Any]]:
        cand: List[Tuple[int, str]] = []
        for op in eng.player_ids:
            if op == pid:
                continue
            opp = eng.players[op]
            if require_willing and len(opp.partners_traded) == 0:
                continue
            stock = opp.resources.get(rk, 0)
            if stock < 1:
                continue
            cand.append((stock, op))
        if not cand:
            return None
        cand.sort(reverse=True)
        best_op = cand[0][1]
        return {"to": best_op, "offered": {hm: 1}, "requested": {rk: 1}}

    for rk in ranked_rk:
        got = pick_for_rk(rk, require_willing=True)
        if got:
            return got
    for rk in ranked_rk:
        got = pick_for_rk(rk, require_willing=False)
        if got:
            return got
    return None


@register_agent("diversified_trader")
def agent_diversified_trader(view: Dict[str, Any], rng: random.Random) -> Dict[str, Any]:
    eng: GameEngine = view["_engine"]
    pid = view["acting_player"]
    ps = eng.players[pid]
    proposals: List[Dict[str, Any]] = []
    hm = eng.home_res(pid)
    if ps.resources.get(hm, 0) >= 1:
        offer = _best_diversified_offer(eng, pid, ps)
        if offer:
            proposals.append(offer)

    incoming = view["pending_offers_to_you"]

    accept: List[str] = []
    reject_reasons: Dict[str, str] = {}
    for o in incoming:
        oid = o["from"]
        req = dict(o["requested"])
        if not eng._can_pay(ps, req):
            continue
        util = trade_utility_greedy(
            eng,
            pid,
            ps,
            oid,
            dict(o["offered"]),
            req,
            eng.players[oid],
        )
        if util <= 0:
            continue
        if leader_awareness_should_reject(
            eng,
            pid,
            oid,
            dict(o["offered"]),
            req,
            is_tribute_payment=bool(o.get("tribute_route_payment")),
        ):
            reject_reasons[o["offer_id"]] = "leader_awareness"
            continue
        accept.append(o["offer_id"])

    action: Optional[Dict[str, Any]] = None
    if "great_hall" not in ps.buildings:
        cgh = eng.compute_build_cost(pid, "great_hall")
        if cgh and eng._can_pay(ps, cgh):
            action = {"kind": "build", "building": "great_hall"}
    if action is None:
        for bt in BUILD_ORDER:
            if bt in ps.buildings:
                continue
            c = eng.compute_build_cost(pid, bt)
            if c and eng._can_pay(ps, c):
                action = {"kind": "build", "building": bt}
                break
    if action is None:
        action = greedy_gather_action(eng, pid, ps)

    return {
        "trade_accept": accept,
        "trade_reject": [o["offer_id"] for o in incoming if o["offer_id"] not in accept],
        "trade_reject_reasons": reject_reasons,
        "trade_counter": [],
        "proposals": proposals,
        "action": action,
    }


def _banker_trivial_proposals(eng: GameEngine, pid: str, ps: PlayerState) -> List[Dict[str, Any]]:
    """Offer 1 surplus resource for 1 needed resource per counterparty when possible."""
    out: List[Dict[str, Any]] = []
    for op in eng.player_ids:
        if op == pid:
            continue
        opp = eng.players[op]
        placed = False
        give_order = sorted(RES_KEYS, key=lambda rk: (-ps.resources.get(rk, 0), rk))
        for rk in give_order:
            if ps.resources.get(rk, 0) < 1:
                continue
            take_order = sorted(
                (x for x in RES_KEYS if x != rk),
                key=lambda rq: (-opp.resources.get(rq, 0), rq),
            )
            for rq in take_order:
                if opp.resources.get(rq, 0) < 1:
                    continue
                out.append({"to": op, "offered": {rk: 1}, "requested": {rq: 1}})
                placed = True
                break
            if placed:
                break
    return out


@register_agent("banker")
def agent_banker(view: Dict[str, Any], rng: random.Random) -> Dict[str, Any]:
    eng: GameEngine = view["_engine"]
    pid = view["acting_player"]
    ps = eng.players[pid]
    incoming = view["pending_offers_to_you"]

    acc: List[str] = []
    reject_reasons: Dict[str, str] = {}
    for o in incoming:
        req = dict(o["requested"])
        if not eng._can_pay(ps, req):
            continue
        oid = o["from"]
        if leader_awareness_should_reject(
            eng,
            pid,
            oid,
            dict(o["offered"]),
            req,
            is_tribute_payment=bool(o.get("tribute_route_payment")),
        ):
            reject_reasons[o["offer_id"]] = "leader_awareness"
            continue
        acc.append(o["offer_id"])

    proposals = _banker_trivial_proposals(eng, pid, ps)

    action: Optional[Dict[str, Any]] = None
    if "great_hall" not in ps.buildings:
        cgh = eng.compute_build_cost(pid, "great_hall")
        if cgh and eng._can_pay(ps, cgh):
            action = {"kind": "build", "building": "great_hall"}
    if action is None:
        for bt in BUILD_ORDER:
            if bt in ps.buildings:
                continue
            c = eng.compute_build_cost(pid, bt)
            if c and eng._can_pay(ps, c):
                action = {"kind": "build", "building": bt}
                break
    if action is None:
        action = greedy_gather_action(eng, pid, ps)

    return {
        "trade_accept": acc,
        "trade_reject": [o["offer_id"] for o in incoming if o["offer_id"] not in acc],
        "trade_reject_reasons": reject_reasons,
        "trade_counter": [],
        "proposals": proposals,
        "action": action,
    }


@register_agent("alliance_duopoly")
def agent_alliance_duopoly(view: Dict[str, Any], rng: random.Random) -> Dict[str, Any]:
    eng: GameEngine = view["_engine"]
    pid = view["acting_player"]
    ps = eng.players[pid]
    partner = ps.agent_params.get("partner_id")
    full = view["pending_offers_to_you"]

    gb = agent_greedy_builder(view, rng)

    accept: List[str] = []
    reject_reasons: Dict[str, str] = dict(gb.get("trade_reject_reasons") or {})
    for o in full:
        frm = o["from"]
        req = dict(o["requested"])
        if not eng._can_pay(ps, req):
            continue
        if partner and frm == partner:
            accept.append(o["offer_id"])
            continue
        util = trade_utility_greedy(
            eng,
            pid,
            ps,
            frm,
            dict(o["offered"]),
            req,
            eng.players[frm],
        )
        if util <= 0:
            continue
        if leader_awareness_should_reject(
            eng,
            pid,
            frm,
            dict(o["offered"]),
            req,
            skip_for_alliance_partner=False,
            is_tribute_payment=bool(o.get("tribute_route_payment")),
        ):
            reject_reasons[o["offer_id"]] = "leader_awareness"
            continue
        accept.append(o["offer_id"])

    proposals: List[Dict[str, Any]] = []
    if partner:
        hm, oh = eng.home_res(pid), eng.home_res(partner)
        if ps.resources.get(hm, 0) >= 1:
            proposals.append({"to": partner, "offered": {hm: 1}, "requested": {oh: 1}})
    proposals.extend(gb["proposals"])

    return {
        "trade_accept": accept,
        "trade_reject": [o["offer_id"] for o in full if o["offer_id"] not in accept],
        "trade_reject_reasons": reject_reasons,
        "trade_counter": [],
        "proposals": proposals,
        "action": gb["action"],
    }


@register_agent("scout_paranoid")
def agent_scout_paranoid(view: Dict[str, Any], rng: random.Random) -> Dict[str, Any]:
    if view.get("secrets", {}).get("secret_ambush_pending"):
        reg = view["secrets"].get("scout_target_region", "ruins")
        gb = agent_greedy_builder(view, rng)
        return {**gb, "action": {"kind": "scout", "region": reg}}
    return agent_greedy_builder(view, rng)


@register_agent("greedy_builder_llm")
def agent_greedy_builder_llm(view: Dict[str, Any], rng: random.Random) -> Dict[str, Any]:
    from tools.llm_agent import llm_agent_decide

    return llm_agent_decide("greedy_builder_llm", view, rng)


@register_agent("aggressive_raider_llm")
def agent_aggressive_raider_llm(view: Dict[str, Any], rng: random.Random) -> Dict[str, Any]:
    from tools.llm_agent import llm_agent_decide

    return llm_agent_decide("aggressive_raider_llm", view, rng)


@register_agent("diversified_trader_llm")
def agent_diversified_trader_llm(view: Dict[str, Any], rng: random.Random) -> Dict[str, Any]:
    from tools.llm_agent import llm_agent_decide

    return llm_agent_decide("diversified_trader_llm", view, rng)


@register_agent("banker_llm")
def agent_banker_llm(view: Dict[str, Any], rng: random.Random) -> Dict[str, Any]:
    from tools.llm_agent import llm_agent_decide

    return llm_agent_decide("banker_llm", view, rng)


@register_agent("alliance_duopoly_llm")
def agent_alliance_duopoly_llm(view: Dict[str, Any], rng: random.Random) -> Dict[str, Any]:
    from tools.llm_agent import llm_agent_decide

    return llm_agent_decide("alliance_duopoly_llm", view, rng)


@register_agent("scout_paranoid_llm")
def agent_scout_paranoid_llm(view: Dict[str, Any], rng: random.Random) -> Dict[str, Any]:
    from tools.llm_agent import llm_agent_decide

    return llm_agent_decide("scout_paranoid_llm", view, rng)


@register_agent("random_llm")
def agent_random_llm(view: Dict[str, Any], rng: random.Random) -> Dict[str, Any]:
    from tools.llm_agent import llm_agent_decide

    return llm_agent_decide("random_llm", view, rng)


# -----------------------------------------------------------------------------
# Turn / round / match
# -----------------------------------------------------------------------------


def _apply_gather(engine: GameEngine, pid: str, region: str, events: List[Dict[str, Any]]) -> Dict[str, Any]:
    ps = engine.players[pid]
    amt, rk = engine.compute_gather_yield(pid, region)
    ambushers = [p for p in engine.ambushers_at(region) if p != pid]
    ambushers.sort(key=lambda x: engine.turn_order.index(x))
    if not ambushers:
        if region == "ruins":
            take = min(amt, engine.scrap_pool)
            engine.scrap_pool -= take
            ps.resources["S"] += take
            engine._gathered[pid]["S"] += take
            return {"type": "gather", "region": region, "yield": {"S": take}, "intercepted_by": None}
        ps.resources[rk] += amt
        engine._gathered[pid][rk] += amt
        return {"type": "gather", "region": region, "yield": {rk: amt}, "intercepted_by": None}

    amb = ambushers[0]
    rest = ambushers[1:]
    ap = engine.players[amb]
    if "watchtower" in ps.buildings and not ps.watchtower_used:
        ps.watchtower_used = True
        if region == "ruins":
            take = min(amt, engine.scrap_pool)
            engine.scrap_pool -= take
            ps.resources["S"] += take
            engine._gathered[pid]["S"] += take
            yv = {"S": take}
        else:
            ps.resources[rk] += amt
            engine._gathered[pid][rk] += amt
            yv = {rk: amt}
        st_dict = {"S": 0} if region == "ruins" else {rk: 0}
        events.append(
            {
                "type": "ambush_triggered",
                "round": engine.round_num,
                "ambusher_id": amb,
                "victim_id": pid,
                "region": region,
                "stolen": st_dict,
                "watchtower_absorbed": True,
            }
        )
        ap.active_ambush_region = None
        for x in rest:
            engine.players[x].active_ambush_region = None
        return {"type": "gather", "region": region, "yield": yv, "intercepted_by": None}

    stolen = amt * AMBUSH_MULT
    rtype = REGION_TO_RES[region]
    if rtype == "S":
        take = min(stolen, engine.scrap_pool)
        engine.scrap_pool -= take
        ap.resources["S"] += take
        engine._gathered[amb]["S"] += take
    else:
        ap.resources[rtype] += stolen
        engine._gathered[amb][rtype] += stolen
    engine.ambushes_hit += 1
    engine._ambush_hits[amb] = engine._ambush_hits.get(amb, 0) + 1
    # v0.8: record that `pid` was hit this round (by `amb`, in hit order).
    # Used by end_of_round to transfer (or, under the deny fallback, destroy)
    # the victim's pending beads.
    engine._ambushed_this_round[pid] = engine._ambushed_this_round.get(pid, 0) + 1
    engine._hit_by_this_round.setdefault(pid, []).append(amb)
    events.append(
        {
            "type": "ambush_triggered",
            "round": engine.round_num,
            "ambusher_id": amb,
            "victim_id": pid,
            "region": region,
            "stolen": {rtype: stolen},
            "watchtower_absorbed": False,
        }
    )
    ap.active_ambush_region = None
    for x in rest:
        engine.players[x].active_ambush_region = None
    return {"type": "gather", "region": region, "yield": {}, "intercepted_by": amb}


def _apply_scout(engine: GameEngine, pid: str, region: str, events: List[Dict[str, Any]]) -> Dict[str, Any]:
    engine.scouts_attempted += 1
    ps = engine.players[pid]
    ambushers = [p for p in engine.ambushers_at(region) if p != pid]
    if ambushers:
        engine.ambushes_scouted += len(ambushers)
        for a in ambushers:
            engine.players[a].active_ambush_region = None
        events.append(
            {
                "type": "ambush_scouted",
                "round": engine.round_num,
                "scout_id": pid,
                "ambusher_ids": ambushers,
                "region": region,
            }
        )
        return {"type": "scout", "region": region, "revealed_ambushers": ambushers, "yield": {}}
    rk = REGION_TO_RES[region]
    if region == "ruins":
        take = min(1, engine.scrap_pool)
        engine.scrap_pool -= take
        ps.resources["S"] += take
        engine._gathered[pid]["S"] += take
        return {"type": "scout", "region": region, "revealed_ambushers": [], "yield": {"S": take}}
    ps.resources[rk] += 1
    engine._gathered[pid][rk] += 1
    return {"type": "scout", "region": region, "revealed_ambushers": [], "yield": {rk: 1}}


def execute_turn(engine: GameEngine, pid: str, turn_idx: int) -> List[Dict[str, Any]]:
    ps = engine.players[pid]
    agent_fn = AGENTS.get(ps.agent)
    if agent_fn is None:
        raise RuntimeError(f"unknown agent {ps.agent}")

    events: List[Dict[str, Any]] = []

    secret_pending = False
    scout_reg = "ruins"
    for ot in engine.turn_order:
        if ot == pid:
            break
        ar = engine.players[ot].active_ambush_region
        if ar:
            secret_pending = True
            scout_reg = ar

    view = {
        "round": engine.round_num,
        "acting_player": pid,
        "turn_order": list(engine.turn_order),
        "scrap_pool": engine.scrap_pool,
        "players_public": {
            p: {
                "tribe": engine.players[p].tribe,
                "vp": engine.players[p].vp,
                "buildings_count": len(engine.players[p].buildings),
            }
            for p in engine.player_ids
        },
        "your_state": engine.snapshot_private(pid),
        "pending_offers_to_you": engine.incoming_offers(pid),
        "recent_turn_digest": list(engine.recent_turn_summaries[-16:]),
        "secrets": {"secret_ambush_pending": secret_pending, "scout_target_region": scout_reg},
        "_engine": engine,
    }

    events.extend(engine.expire_my_offers(pid))

    rng = stable_agent_rng(engine.seed, engine.round_num, pid)
    dec = agent_fn(view, rng)

    reject_reasons: Dict[str, str] = dict(dec.get("trade_reject_reasons") or {})
    for oid in sorted(dec.get("trade_reject", [])):
        if oid in engine.pending_offers:
            engine.pending_offers.pop(oid)
            evr: Dict[str, Any] = {
                "type": "trade_rejected",
                "round": engine.round_num,
                "offer_id": oid,
                "by": pid,
            }
            r = reject_reasons.get(oid)
            if r:
                evr["reason"] = r
            events.append(evr)

    for oid in sorted(dec.get("trade_accept", [])):
        if oid not in engine.pending_offers:
            continue
        offer = engine.pending_offers.pop(oid)
        ok, res, extra = engine.resolve_trade(offer)
        if ok:
            events.append(res)
            events.extend(extra)

    for prop in dec.get("proposals", []):
        to = prop.get("to")
        if not to or to not in engine.player_ids or to == pid:
            continue
        engine.offer_seq += 1
        oid = f"o{engine.round_num}_{engine.offer_seq}"
        engine.pending_offers[oid] = {
            "id": oid,
            "offerer": pid,
            "recipient": to,
            "offered": dict(prop.get("offered", {})),
            "requested": dict(prop.get("requested", {})),
            "created_turn": engine.round_num,
            "tribute_route_payment": bool(prop.get("tribute_route_payment")),
        }
        events.append({"type": "trade_proposed", "round": engine.round_num, "offer_id": oid, "from": pid, "to": to})

    sb = engine.snapshot_private(pid)
    action = dec.get("action") or {"kind": "pass"}
    kind = action.get("kind", "pass")

    if kind == "pass":
        apay: Dict[str, Any] = {"type": "pass"}
    elif kind == "gather":
        apay = _apply_gather(engine, pid, action["region"], events)
    elif kind == "scout":
        apay = _apply_scout(engine, pid, action["region"], events)
    elif kind == "ambush":
        if ps.resources.get("S", 0) < AMBUSH_COST_S or ps.active_ambush_region is not None:
            apay = {"type": "pass"}
        else:
            engine.ambushes_attempted += 1
            if AMBUSH_COST_S > 0:
                engine.pay(pid, {"S": AMBUSH_COST_S}, None)
                engine._spent_ambush[pid] += AMBUSH_COST_S
            ps.active_ambush_region = action["region"]
            engine._ambush_ttl[pid] = AMBUSH_PERSIST_ROUNDS
            cost_log: Dict[str, int] = {"S": AMBUSH_COST_S} if AMBUSH_COST_S > 0 else {}
            apay = {"type": "ambush", "region": action["region"], "cost_paid": cost_log}
    elif kind == "build":
        bt = action["building"]
        cost = engine.compute_build_cost(pid, bt)
        if not cost or not engine._can_pay(ps, cost):
            apay = {"type": "pass"}
        else:
            vpg = engine.apply_build(pid, bt, cost)
            apay = {"type": "build", "building": bt, "cost_paid": dict(cost), "vp_gained": vpg}
    else:
        apay = {"type": "pass"}

    sa = engine.snapshot_private(pid)

    made: List[Dict[str, Any]] = []
    for ev in events:
        if ev.get("type") == "trade_proposed" and ev.get("from") == pid:
            oid = ev["offer_id"]
            off = engine.pending_offers.get(oid, {})
            made.append(
                {
                    "offer_id": oid,
                    "to": ev.get("to"),
                    "offered": dict(off.get("offered", {})),
                    "requested": dict(off.get("requested", {})),
                }
            )

    rationale_txt = dec.get("rationale")
    if isinstance(rationale_txt, str) and rationale_txt.strip():
        pass
    else:
        rationale_txt = ""

    events.append(
        {
            "type": "turn",
            "round": engine.round_num,
            "turn_index_in_round": turn_idx,
            "player_id": pid,
            "state_before": sb,
            "offers_seen": view["pending_offers_to_you"],
            "offers_accepted": dec.get("trade_accept", []),
            "offers_rejected": dec.get("trade_reject", []),
            "offers_countered": [],
            "offers_made": made,
            "action": apay,
            "rationale": rationale_txt,
            "state_after": sa,
        }
    )

    atype = apay.get("type", "pass")
    summ = f"R{engine.round_num} {pid} act={atype}"
    if atype == "gather":
        summ += f" region={apay.get('region')}"
    elif atype in ("scout", "ambush"):
        summ += f" region={apay.get('region')}"
    elif atype == "build":
        summ += f" {apay.get('building')}"
    engine.recent_turn_summaries.append(summ)
    if len(engine.recent_turn_summaries) > 64:
        engine.recent_turn_summaries = engine.recent_turn_summaries[-64:]

    return events


def end_of_round(engine: GameEngine, round_events: List[Dict[str, Any]]) -> None:
    # v0.8 canonical: settle pending trade beads before resetting the per-round
    # bead cap. Legacy "off" mode is a no-op here (no pending beads ever stored).
    if BEAD_VULN_MODE != "off":
        # Iterate in deterministic turn order so "steal" transfers are stable.
        for p in engine.turn_order:
            ps = engine.players[p]
            pending = ps.pending_beads
            if pending <= 0:
                continue
            ps.pending_beads = 0
            hits = engine._ambushed_this_round.get(p, 0)
            if hits > 0:
                # Victim was ambushed this round -> pending beads are at risk.
                ambushers = engine._hit_by_this_round.get(p, [])
                primary = ambushers[0] if ambushers else None
                if BEAD_VULN_MODE == "deny" or primary is None:
                    round_events.append(
                        {
                            "type": "bead_denied",
                            "round": engine.round_num,
                            "victim_id": p,
                            "beads": pending,
                            "cause": "ambushed",
                        }
                    )
                else:  # steal
                    ap = engine.players[primary]
                    # Stolen beads bypass the 2-per-round cap (they're not
                    # earned via trade this round from the ambusher's POV,
                    # they're loot that enters `beads` directly).
                    ap.beads += pending
                    round_events.append(
                        {
                            "type": "bead_stolen",
                            "round": engine.round_num,
                            "victim_id": p,
                            "ambusher_id": primary,
                            "beads": pending,
                        }
                    )
                    round_events.extend(engine.apply_bead_conversions(primary))
            else:
                # Safe -> bank and convert.
                ps.beads += pending
                round_events.extend(engine.apply_bead_conversions(p))
    # Reset per-round bookkeeping.
    for p in engine.player_ids:
        engine.players[p].beads_earned_this_round = 0
        engine._ambushed_this_round[p] = 0
        engine._hit_by_this_round[p] = []
    for p in engine.player_ids:
        ps = engine.players[p]
        if ps.active_ambush_region:
            # Decrement TTL; only expire when it reaches zero. Default
            # AMBUSH_PERSIST_ROUNDS == 1 reproduces the canonical behaviour
            # (ambush cleared at the first end-of-round tick).
            engine._ambush_ttl[p] = max(0, engine._ambush_ttl[p] - 1)
            if engine._ambush_ttl[p] <= 0:
                engine.ambushes_expired += 1
                round_events.append(
                    {
                        "type": "ambush_expired",
                        "round": engine.round_num,
                        "ambusher_id": p,
                        "region": ps.active_ambush_region,
                    }
                )
                ps.active_ambush_region = None
        ps.watchtower_used = False

    st = engine.standings()
    mv = max(engine.players[p].vp for p in engine.player_ids)
    mi = min(engine.players[p].vp for p in engine.player_ids)
    gap = mv - mi
    lasts = [p for p in engine.player_ids if engine.players[p].vp == mi]
    for p in engine.player_ids:
        engine.players[p].trailing_bonus_active = (engine.players[p].vp == mi and gap >= 3)
    for p in lasts:
        engine.rounds_last_place[p] += 1

    leader = engine.leader_id()
    if not engine.leader_identity_history:
        engine.leader_identity_history.append(leader)
    elif engine.leader_identity_history[-1] != leader:
        engine.leader_identity_history.append(leader)

    for p in engine.player_ids:
        engine.vp_curve[p].append(engine.players[p].vp)

    round_events.append(
        {
            "type": "round_end",
            "round": engine.round_num,
            "standings_snapshot": st,
            "vp_gap": gap,
        }
    )


def run_match(
    seed: int,
    tribes: Sequence[str],
    agents: Sequence[str],
    agent_params: Sequence[Dict[str, Any]],
    turn_order: Optional[Sequence[str]],
) -> Tuple[GameEngine, List[Dict[str, Any]], Dict[str, Any]]:
    eng = GameEngine(seed, tribes, agents, agent_params, turn_order)
    rounds_out: List[Dict[str, Any]] = []
    final_round = 0
    total_turns_run = 0

    for r in range(1, 16):
        eng.round_num = r
        eng.great_hall_this_round = False
        evs: List[Dict[str, Any]] = []
        for ti, pid in enumerate(eng.turn_order):
            if eng.match_ended:
                break
            total_turns_run += 1
            if total_turns_run > MAX_TURNS_SAFETY:
                eng.match_ended = True
                eng.end_trigger = "round_limit"
                break
            evs.extend(execute_turn(eng, pid, ti))
            if any(eng.players[p].vp >= VP_WIN_THRESHOLD for p in eng.player_ids):
                eng.match_ended = True
                eng.end_trigger = "vp_threshold"
                break
        final_round = eng.round_num
        end_of_round(eng, evs)
        rounds_out.append(
            {
                "round": eng.round_num,
                "events": evs,
                "standings_after": eng.standings(),
                "scrap_pool_after": eng.scrap_pool,
                "trailing_bonus_recipients": [
                    p for p in eng.player_ids if eng.players[p].trailing_bonus_active
                ],
                "vp_gap_after": max(eng.players[x].vp for x in eng.player_ids)
                - min(eng.players[x].vp for x in eng.player_ids),
            }
        )
        if eng.match_ended and eng.end_trigger == "vp_threshold":
            break
        if eng.great_hall_this_round:
            eng.match_ended = True
            eng.end_trigger = "great_hall"
            break
        if r == 15:
            eng.match_ended = True
            eng.end_trigger = "round_limit"
            break

    # outcome / winner
    ranked = sorted(
        eng.player_ids,
        key=lambda p: (-eng.players[p].vp, -len(eng.players[p].buildings), -len(eng.players[p].partners_traded), p),
    )
    top_vp = eng.players[ranked[0]].vp
    tied = [p for p in eng.player_ids if eng.players[p].vp == top_vp]
    tb_used = None
    shared = False
    if len(tied) == 1:
        winners = [tied[0]]
    else:
        mb = max(len(eng.players[p].buildings) for p in tied)
        t2 = [p for p in tied if len(eng.players[p].buildings) == mb]
        if len(t2) == 1:
            winners = [t2[0]]
            tb_used = "buildings"
        else:
            mp = max(len(eng.players[p].partners_traded) for p in t2)
            t3 = [p for p in t2 if len(eng.players[p].partners_traded) == mp]
            if len(t3) == 1:
                winners = [t3[0]]
                tb_used = "trade_partners"
            else:
                winners = list(sorted(t3))
                shared = True

    trailing_player_won = False
    mx = max(eng.rounds_last_place.values())
    if mx > 0:
        trailing_player_won = eng.rounds_last_place.get(winners[0], 0) == mx

    leader_changes = max(0, len(eng.leader_identity_history) - 1)

    aggregates = {
        "trades_completed_total": eng.trades_completed_total,
        "trades_by_pair": dict(eng.trades_by_pair),
        "buildings_by_player": {p: list(eng.buildings_by_player[p]) for p in eng.player_ids},
        "ambushes_attempted": eng.ambushes_attempted,
        "ambushes_hit": eng.ambushes_hit,
        "ambushes_scouted": eng.ambushes_scouted,
        "ambushes_expired": eng.ambushes_expired,
        "scouts_attempted": eng.scouts_attempted,
        "vp_curve": eng.vp_curve,
        "trailing_player_won": trailing_player_won,
        "leader_changed_count": leader_changes,
        "resources_held_at_end": {p: {k: eng.players[p].resources.get(k, 0) for k in RES_KEYS} for p in eng.player_ids},
    }

    outcome = {
        "winner_ids": winners,
        "end_trigger": eng.end_trigger or "round_limit",
        "final_round": final_round,
        "final_scores": {p: eng.players[p].vp for p in eng.player_ids},
        "tiebreaker_used": tb_used,
        "shared_victory": shared,
    }

    meta = {
        "engine": eng,
        "rounds_out": rounds_out,
        "outcome": outcome,
        "aggregates": aggregates,
    }
    return eng, rounds_out, meta


def deterministic_iso(seed: int, offset_ms: int = 0) -> str:
    ts = 1704067200 + (abs(seed) % 86_400_000) + offset_ms // 1000
    return datetime.fromtimestamp(ts, tz=timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def build_match_json(
    seed: int,
    tribes: Sequence[str],
    agents: Sequence[str],
    agent_params: Sequence[Dict[str, Any]],
    turn_order: Optional[Sequence[str]],
    match_id: Optional[str],
    runner_tag: str = "tools/sim.py",
    runner_model: str = "script",
    llm_trace_batch_id: Optional[str] = None,
) -> Dict[str, Any]:
    if turn_order is not None:
        to_for_id = list(turn_order)
    else:
        to_for_id = None

    if match_id is None:
        if to_for_id is None:
            probe = GameEngine(seed, tribes, agents, agent_params, None)
            to_for_id = list(probe.turn_order)
        key = json.dumps(
            {"seed": seed, "tribes": list(tribes), "agents": list(agents), "turn_order": to_for_id},
            sort_keys=True,
        )
        match_id = "m_" + hashlib.sha256(key.encode("utf-8")).hexdigest()[:20]

    if llm_trace_batch_id:
        from tools.llm_agent import begin_match_trace

        begin_match_trace(llm_trace_batch_id, match_id, seed)

    try:
        t0 = time.perf_counter()
        eng, rounds_out, meta = run_match(seed, tribes, agents, agent_params, turn_order)
        dur_ms = int((time.perf_counter() - t0) * 1000)
    finally:
        if llm_trace_batch_id:
            from tools.llm_agent import end_match_trace

            end_match_trace()

    if turn_order is None:
        turn_order = eng.turn_order
    else:
        turn_order = list(turn_order)

    players = [
        {
            "id": eng.player_ids[i],
            "tribe": tribes[i],
            "agent": agents[i],
            "agent_params": dict(agent_params[i]),
        }
        for i in range(len(tribes))
    ]

    started = deterministic_iso(seed, 0)
    completed = deterministic_iso(seed, dur_ms)

    obj = {
        "schema_version": SCHEMA_VERSION,
        "rules_version": RULES_VERSION,
        "match_id": match_id,
        "seed": seed,
        "run_metadata": {
            "runner": runner_tag,
            "runner_model": runner_model,
            "started_at": started,
            "completed_at": completed,
            "duration_ms": dur_ms,
            "notes": "",
        },
        "config": {
            "num_players": len(tribes),
            "tribes_in_play": list(tribes),
            "max_rounds": 15,
            "vp_win_threshold": VP_WIN_THRESHOLD,
            "scrap_pool_initial": 5 * len(tribes),
            "turn_order": turn_order,
        },
        "players": players,
        "rounds": rounds_out,
        "outcome": meta["outcome"],
        "aggregates": meta["aggregates"],
        "_internal_engine_ref": eng,
    }
    return obj


def validate_accounting(obj: Dict[str, Any]) -> None:
    eng: GameEngine = obj["_internal_engine_ref"]
    for p in eng.player_ids:
        vp = eng.players[p].vp
        vb = eng._vp_build[p] + eng._vp_bead[p]
        if vp != vb:
            raise AssertionError(f"VP mismatch {p}: vp={vp} build+bead_vp={vb}")

    scrap_initial = 5 * eng.num_players
    held_pool_s = sum(eng.players[p].resources.get("S", 0) for p in eng.player_ids) + eng.scrap_pool
    destroyed_s = sum(eng._spent_build[p].get("S", 0) for p in eng.player_ids) + sum(
        eng._spent_ambush[p] for p in eng.player_ids
    )
    if held_pool_s != scrap_initial - destroyed_s:
        raise AssertionError(
            f"Scrap conservation failed: held+pool={held_pool_s} initial={scrap_initial} destroyed={destroyed_s}"
        )

    for rk in ("T", "O", "F", "Rel"):
        initial = sum(2 if TRIBE_HOME[eng.players[p].tribe][1] == rk else 0 for p in eng.player_ids)
        held = sum(eng.players[p].resources.get(rk, 0) for p in eng.player_ids)
        gath = sum(eng._gathered[p].get(rk, 0) for p in eng.player_ids)
        spent = sum(eng._spent_build[p].get(rk, 0) for p in eng.player_ids)
        if initial + gath != held + spent:
            raise AssertionError(f"{rk} conservation failed: init={initial} gath={gath} held={held} spent={spent}")


def validate_stripped_match(obj: Dict[str, Any]) -> None:
    """Validate a persisted match JSON object (no engine reference)."""
    validate_schema_basic(obj)
    fin = obj["outcome"]["final_scores"]
    curve = obj["aggregates"]["vp_curve"]
    for pid, vp in fin.items():
        cv = curve.get(pid, [])
        assert cv, f"vp_curve missing {pid}"
        assert cv[-1] == vp, f"vp_curve tail mismatch {pid}: curve={cv[-1]} final={vp}"
    assert obj["aggregates"]["trades_completed_total"] == sum(obj["aggregates"]["trades_by_pair"].values())


def validate_schema_basic(obj: Dict[str, Any]) -> None:
    assert obj["schema_version"] == SCHEMA_VERSION
    assert obj["rules_version"] == RULES_VERSION
    assert obj["config"]["num_players"] == len(obj["players"])
    ag = obj["aggregates"]
    req = [
        "trades_completed_total",
        "trades_by_pair",
        "buildings_by_player",
        "ambushes_attempted",
        "ambushes_hit",
        "ambushes_scouted",
        "ambushes_expired",
        "scouts_attempted",
        "vp_curve",
        "trailing_player_won",
        "leader_changed_count",
    ]
    for k in req:
        assert k in ag, f"missing aggregate {k}"
    assert ag["trades_completed_total"] == sum(ag["trades_by_pair"].values())


def strip_internal(obj: Dict[str, Any]) -> Dict[str, Any]:
    o = dict(obj)
    o.pop("_internal_engine_ref", None)
    return o


def dumps_json(obj: Dict[str, Any]) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


# -----------------------------------------------------------------------------
# CLI
# -----------------------------------------------------------------------------


def parse_agents_arg(s: str) -> Tuple[List[str], List[str], List[Dict[str, Any]]]:
    """Format: orange:greedy_builder,grey:aggressive_raider,..."""
    tribes: List[str] = []
    agents: List[str] = []
    params: List[Dict[str, Any]] = []
    parts = [p.strip() for p in s.split(",") if p.strip()]
    for p in parts:
        if ":" not in p:
            raise ValueError(f"bad agent token {p}")
        tr, ag = p.split(":", 1)
        tribes.append(tr.strip())
        agents.append(ag.strip())
        params.append({})
    if len(tribes) not in (2, 3, 4):
        raise ValueError("need 2-4 players")
    return tribes, agents, params


def cmd_validate(path: str) -> int:
    err = 0
    with open(path, "r", encoding="utf-8") as f:
        for li, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as e:
                print(f"Line {li}: JSON error {e}", file=sys.stderr)
                err += 1
                continue
            try:
                if "_internal_engine_ref" in obj:
                    validate_schema_basic(obj)
                    validate_accounting(obj)
                else:
                    validate_stripped_match(obj)
            except AssertionError as e:
                print(f"Line {li}: {e}", file=sys.stderr)
                err += 1
    return 1 if err else 0


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Rogue Rivals simulator")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--agents", type=str, default="orange:greedy_builder,grey:greedy_builder,brown:greedy_builder,red:greedy_builder")
    ap.add_argument("--turn-order", type=str, default="", help='JSON array e.g. ["P1","P3","P2","P4"]')
    ap.add_argument("--out", type=str, default="")
    ap.add_argument("--batch", type=str, default="", help="batch JSON config path")
    ap.add_argument("--validate", type=str, default="", help="validate JSONL")
    args = ap.parse_args(argv)

    if args.validate:
        return cmd_validate(args.validate)

    if args.batch:
        with open(args.batch, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        lines: List[str] = []
        for run in cfg.get("runs", []):
            seed = int(run["seed"])
            tribes = run["tribes"]
            agents = run["agents"]
            n = len(agents)
            apar = run.get("agent_params") or [{} for _ in range(n)]
            if len(apar) < n:
                apar = (apar + [{}] * n)[:n]
            to = run.get("turn_order")
            mid = run.get("match_id")
            obj = build_match_json(seed, tribes, agents, apar, to, mid)
            validate_schema_basic(obj)
            validate_accounting(obj)
            validate_stripped_match(strip_internal(obj))
            lines.append(dumps_json(strip_internal(obj)))
        out = args.out or "simulations/batch.jsonl"
        with open(out, "w", encoding="utf-8") as wf:
            wf.write("\n".join(lines) + "\n")
        print(out)
        return 0

    tribes, agents, aparams = parse_agents_arg(args.agents)
    turn_order = None
    if args.turn_order.strip():
        turn_order = json.loads(args.turn_order)

    obj = build_match_json(args.seed, tribes, agents, aparams, turn_order, None)
    validate_schema_basic(obj)
    validate_accounting(obj)
    validate_stripped_match(strip_internal(obj))
    out = strip_internal(obj)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as wf:
            wf.write(dumps_json(out) + "\n")
        print(args.out)
    else:
        sys.stdout.write(dumps_json(out) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
