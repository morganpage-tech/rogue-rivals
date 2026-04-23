import {
  DEFAULT_NAP_LENGTH,
  DEFAULT_SHARED_VISION_LENGTH,
  FORCE_RECRUIT_COST,
  FORGE_REQUIRED_FOR_TIER,
  fuzzyTierFor,
  MAX_STRUCTURES_PER_REGION,
  SCOUT_COST,
  STRUCTURE_COST,
  DEFAULT_TICK_LIMIT,
} from "./constants.js";
import { adjacentRegions, trailBetween } from "./graph.js";
import type {
  GameState,
  LegalOrderOption,
  Order,
  ProjectedView,
  Proposal,
  Region,
  RegionId,
  Tribe,
  VisibleForce,
  VisibleScout,
  VisibleTransit,
} from "./types.js";

export function visibleRegionSet(state: GameState, tribe: Tribe): Set<RegionId> {
  const visible = new Set<RegionId>();
  const owned = Object.keys(state.regions).filter(
    (rid) => state.regions[rid]!.owner === tribe,
  );
  for (const rid of owned) {
    visible.add(rid);
    const adjList = adjacentRegions(state, rid);
    for (const adj of adjList) {
      visible.add(adj);
    }
    if (state.regions[rid]!.structures.includes("watchtower")) {
      for (const adj of adjList) {
        for (const adj2 of adjacentRegions(state, adj)) {
          visible.add(adj2);
        }
      }
    }
  }
  for (const scout of Object.values(state.scouts)) {
    if (scout.owner !== tribe || scout.location.kind !== "arrived") continue;
    const rid = scout.location.regionId;
    visible.add(rid);
    for (const adj of adjacentRegions(state, rid)) {
      visible.add(adj);
    }
  }
  for (const pact of state.pacts) {
    if (pact.kind !== "shared_vision" || !pact.parties.includes(tribe)) continue;
    const other = pact.parties[0] === tribe ? pact.parties[1] : pact.parties[0];
    const otherOwned = Object.keys(state.regions).filter(
      (rid) => state.regions[rid]!.owner === other,
    );
    for (const rid of otherOwned) {
      visible.add(rid);
      for (const adj of adjacentRegions(state, rid)) {
        visible.add(adj);
      }
    }
  }
  return visible;
}

export function canSeeTribe(state: GameState, observer: Tribe, target: Tribe): boolean {
  const visible = visibleRegionSet(state, observer);
  for (const rid of visible) {
    if (state.regions[rid]?.owner === target) return true;
  }
  return false;
}

function hasPact(state: GameState, kind: string, a: Tribe, b: Tribe): boolean {
  for (const pact of state.pacts) {
    if (pact.kind !== kind) continue;
    const s = new Set(pact.parties);
    if (s.has(a) && s.has(b)) return true;
  }
  return false;
}

function legalOrderOptions(state: GameState, tribe: Tribe): LegalOrderOption[] {
  const ps = state.players[tribe];
  if (!ps) return [];

  const options: LegalOrderOption[] = [];

  const addOption = (
    id: string,
    kind: Order["kind"],
    summary: string,
    payload: Readonly<Record<string, unknown>>,
  ) => {
    options.push({ id, kind, summary, payload });
  };

  const myForcesSorted = Object.values(state.forces)
    .filter((f) => f.owner === tribe && f.location.kind === "garrison")
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const force of myForcesSorted) {
    if (force.location.kind !== "garrison") continue;
    const origin = force.location.regionId;
    for (const dest of adjacentRegions(state, origin)) {
      addOption(
        `move:${force.id}:${dest}`,
        "move",
        `Move ${force.id} (Tier ${force.tier}) from ${origin} to ${dest}`,
        { forceId: force.id, destinationRegionId: dest },
      );
    }
  }

  for (const regionId of Object.keys(state.regions).sort()) {
    const region = state.regions[regionId]!;
    if (region.owner !== tribe) continue;

    if (region.garrisonForceId === null) {
      for (const tier of Object.keys(FORCE_RECRUIT_COST).map(Number) as (keyof typeof FORCE_RECRUIT_COST)[]) {
        if (tier === FORGE_REQUIRED_FOR_TIER && !region.structures.includes("forge")) continue;
        const cost = FORCE_RECRUIT_COST[tier];
        if (ps.influence < cost) continue;
        addOption(
          `recruit:${regionId}:t${tier}`,
          "recruit",
          `Recruit Tier ${tier} at ${regionId} (cost ${cost})`,
          { regionId, tier },
        );
      }
    }

    if (region.structures.length < MAX_STRUCTURES_PER_REGION) {
      for (const structure of Object.keys(STRUCTURE_COST).sort() as (keyof typeof STRUCTURE_COST)[]) {
        if (region.structures.includes(structure)) continue;
        const cost = STRUCTURE_COST[structure];
        if (ps.influence < cost) continue;
        if (structure === "road") {
          for (const roadTarget of adjacentRegions(state, regionId)) {
            addOption(
              `build:${regionId}:road:${roadTarget}`,
              "build",
              `Build road at ${regionId} toward ${roadTarget} (cost ${cost})`,
              { regionId, structure: "road", roadTarget },
            );
          }
        } else {
          addOption(
            `build:${regionId}:${structure}`,
            "build",
            `Build ${structure} at ${regionId} (cost ${cost})`,
            { regionId, structure },
          );
        }
      }
    }

    if (ps.influence >= SCOUT_COST) {
      for (const target of adjacentRegions(state, regionId)) {
        if (!trailBetween(state, regionId, target)) continue;
        addOption(
          `scout:${regionId}:${target}`,
          "scout",
          `Scout from ${regionId} to ${target} (cost ${SCOUT_COST})`,
          { fromRegionId: regionId, targetRegionId: target },
        );
      }
    }
  }

  for (const proposal of [...ps.outstandingProposals].sort((a, b) => a.id.localeCompare(b.id))) {
    addOption(
      `respond:${proposal.id}:accept`,
      "respond",
      `Accept ${proposal.kind} proposal ${proposal.id} from ${proposal.from}`,
      { proposalId: proposal.id, response: "accept" },
    );
    addOption(
      `respond:${proposal.id}:decline`,
      "respond",
      `Decline ${proposal.kind} proposal ${proposal.id} from ${proposal.from}`,
      { proposalId: proposal.id, response: "decline" },
    );
  }

  for (const other of state.tribesAlive.filter((t) => t !== tribe).sort()) {
    const hasNap = hasPact(state, "nap", tribe, other);
    const hasSharedVision = hasPact(state, "shared_vision", tribe, other);
    const hasWar = hasPact(state, "war", tribe, other);
    const canSeeOther = canSeeTribe(state, tribe, other);

    if (!hasNap && !hasWar && canSeeOther) {
      addOption(
        `propose:nap:${other}`,
        "propose",
        `Propose NAP to ${other} (${DEFAULT_NAP_LENGTH} ticks)`,
        {
          proposal: {
            id: "pending",
            kind: "nap",
            from: tribe,
            to: other,
            lengthTicks: DEFAULT_NAP_LENGTH,
            amountInfluence: 0,
            expiresTick: 0,
          } satisfies Proposal,
        },
      );
    }
    if (!hasSharedVision && !hasWar && canSeeOther) {
      addOption(
        `propose:shared_vision:${other}`,
        "propose",
        `Propose Shared Vision to ${other} (${DEFAULT_SHARED_VISION_LENGTH} ticks)`,
        {
          proposal: {
            id: "pending",
            kind: "shared_vision",
            from: tribe,
            to: other,
            lengthTicks: DEFAULT_SHARED_VISION_LENGTH,
            amountInfluence: 0,
            expiresTick: 0,
          } satisfies Proposal,
        },
      );
    }
    if (ps.influence >= 6 && canSeeOther) {
      addOption(
        `propose:trade_offer:${other}:5`,
        "propose",
        `Propose 5-Influence trade caravan to ${other}`,
        {
          proposal: {
            id: "pending",
            kind: "trade_offer",
            from: tribe,
            to: other,
            lengthTicks: 0,
            amountInfluence: 5,
            expiresTick: 0,
          } satisfies Proposal,
        },
      );
    }
    if (hasNap) {
      addOption(
        `propose:break_pact:${other}`,
        "propose",
        `Break NAP with ${other}`,
        {
          proposal: {
            id: "pending",
            kind: "break_pact",
            from: tribe,
            to: other,
            lengthTicks: 0,
            amountInfluence: 0,
            expiresTick: 0,
          } satisfies Proposal,
        },
      );
    }
    if (!hasWar && canSeeOther) {
      addOption(
        `propose:declare_war:${other}`,
        "propose",
        `Declare war on ${other}`,
        {
          proposal: {
            id: "pending",
            kind: "declare_war",
            from: tribe,
            to: other,
            lengthTicks: 0,
            amountInfluence: 0,
            expiresTick: 0,
          } satisfies Proposal,
        },
      );
    }
  }

  return options;
}

export function projectForPlayer(state: GameState, tribe: Tribe): ProjectedView {
  const visible = visibleRegionSet(state, tribe);

  const visibleRegions: Record<RegionId, Region> = {};
  for (const rid of [...visible].sort()) {
    const r = state.regions[rid];
    if (r) visibleRegions[rid] = r;
  }

  const visibleForces: VisibleForce[] = [];
  for (const f of Object.values(state.forces)) {
    if (f.location.kind !== "garrison") continue;
    const regionId = f.location.regionId;
    if (!visible.has(regionId)) continue;
    if (f.owner === tribe) continue;
    visibleForces.push({
      regionId,
      owner: f.owner,
      fuzzyTier: fuzzyTierFor(f.tier),
    });
  }

  const visibleTransits: VisibleTransit[] = [];
  for (const f of Object.values(state.forces)) {
    if (f.location.kind !== "transit") continue;
    if (f.owner === tribe) continue;
    const tr = f.location;
    let observedIn: RegionId | undefined;
    if (visible.has(tr.directionFrom)) observedIn = tr.directionFrom;
    else if (visible.has(tr.directionTo)) observedIn = tr.directionTo;
    if (observedIn === undefined) continue;
    visibleTransits.push({
      trailIndex: tr.trailIndex,
      observedInRegionId: observedIn,
      owner: f.owner,
      fuzzyTier: fuzzyTierFor(f.tier),
      directionFrom: tr.directionFrom,
      directionTo: tr.directionTo,
    });
  }

  const visibleScouts: VisibleScout[] = [];
  for (const s of Object.values(state.scouts)) {
    if (s.owner === tribe) continue;
    if (s.location.kind === "arrived" && visible.has(s.location.regionId)) {
      visibleScouts.push({ regionId: s.location.regionId, owner: s.owner });
    }
  }

  const myState = state.players[tribe]!;
  const myForces = Object.values(state.forces).filter((f) => f.owner === tribe);
  const myScouts = Object.values(state.scouts).filter((s) => s.owner === tribe);
  const myCaravans = Object.values(state.caravans).filter((c) => c.owner === tribe);

  const inboxNew = myState.inbox.filter((m) => m.tick === state.tick);
  const announcementsNew = state.announcements.filter((a) => a.tick === state.tick);
  const pactsInvolvingMe = state.pacts.filter((p) => p.parties.includes(tribe));

  return {
    tick: state.tick,
    forTribe: tribe,
    visibleRegions,
    visibleForces,
    visibleTransits,
    visibleScouts,
    myPlayerState: myState,
    myForces,
    myScouts,
    myCaravans,
    inboxNew,
    announcementsNew,
    pactsInvolvingMe,
    legalOrderOptions: legalOrderOptions(state, tribe),
    tribesAlive: [...state.tribesAlive],
    tickLimit: DEFAULT_TICK_LIMIT,
  };
}
