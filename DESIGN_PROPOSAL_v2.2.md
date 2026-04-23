# Rogue Rivals v2.2 — Neptune's Pride Strength Model

**Status:** proposed
**Prerequisite:** v2.1 force stacking (§2.2.1) must be adopted and validated first.
**Goal:** Replace discrete Force entities with a simple strength-number model, like Neptune's Pride.

## 1. Why

v2.1's force stacking (merge-on-arrival, merge-on-recruit) is a bridge — it keeps Force as an object but lets tiers stack beyond 4. The next logical step is to simplify the model entirely:

- **Current (v2.1):** Forces are objects with a `tier` number. A region has one garrison force per owner. Stacking works by adding tier values. You recruit tier 1–4 "building blocks" and they stack.
- **Proposed (v2.2):** A region has a `strength` number per owner. No Force objects. You recruit any strength amount (cost proportional). You move a portion of your strength to another region. Combat is attacker strength vs defender strength + bonuses.

This eliminates the `Force` entity, `garrisonForceId`, the merge logic, and the tier ceiling entirely. The mental model becomes "I have 7 armies here, I send 4 there."

## 2. Model

### 2.1 Region strength replaces Force

```ts
interface Region {
  id: RegionId;
  type: RegionType;
  owner: Tribe | null;
  structures: StructureKind[];
  roadTargets: Record<number, RegionId>;
  // NEW: replaces garrisonForceId + Force entity
  strength: number; // ≥ 0, per-owner defensive power
}
```

No more `Force` interface. No more `forces: Record<ForceId, Force>` in GameState. No more `garrisonForceId`.

### 2.2 Recruitment becomes "add strength"

```ts
interface RecruitOrder {
  kind: "recruit";
  regionId: RegionId;
  amount: number; // any positive integer, not just tier 1–4
}
```

Cost: `amount * STRENGTH_COST_PER_POINT` (tune from current tier costs). Current tier 2 costs 5 for strength 2 → 2.5 per point. Suggest `STRENGTH_COST_PER_POINT = 3` for simplicity, adjustable.

Forge requirement: regions with a forge can recruit in larger amounts (e.g., `MAX_RECRUIT_WITHOUT_FORGE = 4`, `MAX_RECRUIT_WITH_FORGE = 10`).

### 2.3 Movement becomes "send strength"

```ts
interface MoveOrder {
  kind: "move";
  fromRegionId: RegionId;    // NEW: explicit source
  destinationRegionId: RegionId;
  amount: number;            // how much strength to send
}
```

No more `forceId` in move orders. You specify the source region, destination, and how much strength to send. Minimum 1, maximum the region's current strength minus 1 (must leave at least 1 behind — a region with 0 strength loses ownership).

Transit is now a strength blob:
```ts
interface Transit {
  id: string;
  owner: Tribe;
  amount: number;
  trailIndex: number;
  directionFrom: RegionId;
  directionTo: RegionId;
  ticksRemaining: number;
}
```

### 2.4 Combat

Same structure as v2.1 — attacker effective strength vs defender effective strength + bonuses. The numbers are just bigger now.

- Defender bonus: flat bonuses stay (`+1 own region`, `+1 fort`, etc.) — these become less significant at higher strength values, which is intentional. Forts matter more early game.
- Alternatively, scale bonuses as a percentage of defender strength. This is a tuning decision for implementation.

### 2.5 Fog of war

Visible enemy strength is fuzzy: instead of exact numbers, observers see ranges:
- 1–2: "skirmishers"
- 3–4: "warband"
- 5–7: "large host"
- 8–12: "massive army"
- 13+: "overwhelming force"

### 2.6 Split orders

A new order type allows splitting a transit mid-flight (optional, v2.2+):
```ts
interface SplitOrder {
  kind: "split";
  transitId: string;
  keepAmount: number; // how much stays on original path
  // remaining amount returns to origin or reroutes
}
```

## 3. Migration from v2.1

| v2.1 Concept | v2.2 Replacement |
|-------------|-----------------|
| `Force` entity | Region `strength` + `Transit` |
| `garrisonForceId` | Region `strength` |
| `ForceTier` | `number` (strength amount) |
| `FUZZY_TIER_FOR` | `fuzzyStrength()` range function |
| `FORCE_RECRUIT_COST` | `STRENGTH_COST_PER_POINT` |
| `FORCE_TRAVEL_PENALTY` | `TRANSIT_SPEED_PENALTY_PER_POINT` or flat |
| `arrival_rejected_garrison_cap` | Gone (regions always accept friendly strength) |
| `force_merged` event | Gone (strength just adds) |
| `garrison_reinforced` event | `strength_reinforced` event |
| Move by `forceId` | Move by `fromRegionId` + `amount` |
| Recruit `tier: ForceTier` | Recruit `amount: number` |

## 4. Rollout

| Phase | Scope | Notes |
|-------|-------|-------|
| **Prerequisite** | v2.1 force stacking adopted and validated | Confirms stacking works in practice |
| **2.2-alpha** | Replace Force with strength, update recruit/move orders | Engine-only, no LLM changes yet |
| **2.2-beta** | Update LLM legal-order grammar, compact view, personas | LLMs use new order format |
| **2.2-rc** | Re-run seed triplet, verify attacker win rate > 30% | Validate the model works end-to-end |

## 5. Open questions

1. **Strength cost per point:** 2, 3, or variable? Current tier costs aren't linear (2/5/12/30) — tier 4 is 7.5x tier 1. A flat cost per point loses this escalation. Options: flat cost, or escalating marginal cost (each point costs more than the last).
2. **Travel penalty:** Current model penalizes higher tiers more. With strength-as-number, do we penalize large movements? Neptune's Pride doesn't — all fleets move at the same speed. Recommend flat transit time for simplicity.
3. **Minimum garrison:** Should a region with 0 strength auto-abandon? Neptune's Pride says yes. This creates interesting raiding dynamics but requires careful handling of production regions.
4. **Combat resolution:** When attacker strength 8 hits defender strength 6 (with +1 fort = 7), does the attacker lose 6 strength and capture with 2 remaining? Or does the loser lose a fixed amount? Neptune's Pride uses "attacker wins by margin, both lose the loser's strength." Recommend: winner loses `loser_strength`, captures with remaining. Ties: both reduced to 0, region becomes unclaimed.
