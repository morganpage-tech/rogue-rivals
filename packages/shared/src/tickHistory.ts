import type { ProjectedView, ResolutionEvent, Tribe } from "./engineTypes.js";

export function countOwnedRegions(view: ProjectedView): number {
  return Object.values(view.visibleRegions).filter((r) => r.owner === view.forTribe).length;
}

export function extractFailuresForTribe(
  events: readonly ResolutionEvent[],
  tribe: Tribe,
): { id: string; reason: string }[] {
  const failures: { id: string; reason: string }[] = [];
  for (const e of events) {
    if (e.kind === "build_failed" && e.tribe === tribe) {
      failures.push({ id: "build", reason: String(e.reason ?? "unknown") });
    } else if (e.kind === "recruit_failed") {
      failures.push({ id: "recruit", reason: String(e.reason ?? "unknown") });
    } else if (e.kind === "move_failed" && e.tribe === tribe) {
      failures.push({ id: "move", reason: String(e.reason ?? "unknown") });
    } else if (e.kind === "scout_failed" && e.tribe === tribe) {
      failures.push({ id: "scout", reason: String(e.reason ?? "unknown") });
    } else if (e.kind === "respond_failed") {
      failures.push({ id: "respond", reason: String(e.reason ?? "unknown") });
    }
  }
  return failures;
}

export function extractSuccessesForTribe(
  events: readonly ResolutionEvent[],
  tribe: Tribe,
): string[] {
  const successes: string[] = [];
  for (const e of events) {
    if (e.kind === "built" && e.tribe === tribe) {
      successes.push(`build:${String(e.region_id)}:${String(e.structure)}`);
    } else if (e.kind === "recruited" && e.tribe === tribe) {
      successes.push(`recruit:${String(e.region_id)}:t${String(e.tier)}`);
    } else if (e.kind === "dispatch_move" && e.tribe === tribe) {
      successes.push(`move:${String(e.force_id)}:${String(e.to)}`);
    } else if (e.kind === "dispatch_scout" && e.tribe === tribe) {
      successes.push(`scout:${String(e.to)}`);
    } else if (e.kind === "proposal_sent" && e.from === tribe) {
      successes.push(`propose:${String(e.proposal_kind)}:${String(e.to)}`);
    } else if (e.kind === "pact_formed" && (e.parties as string[]).includes(tribe)) {
      successes.push(`pact:${String(e.pact)}`);
    }
  }
  return successes;
}

export function computeNarrativeForTribe(
  events: readonly ResolutionEvent[],
  tribe: Tribe,
): string[] {
  const entries: string[] = [];
  for (const e of events) {
    if (e.kind === "region_captured" && e.tribe === tribe) {
      entries.push(`You captured ${String(e.region_id)} from ${String(e.previous_owner ?? "unclaimed")}`);
    } else if (e.kind === "region_claimed" && e.tribe === tribe) {
      entries.push(`You claimed unclaimed region ${String(e.region_id)}`);
    } else if (e.kind === "region_captured" && e.previous_owner === tribe) {
      entries.push(`You LOST ${String(e.region_id)} to ${String(e.tribe)}`);
    } else if (e.kind === "combat" && (e.attacker === tribe || e.defender === tribe)) {
      const role = e.attacker === tribe ? "attacked" : "defended against";
      const result = String(e.result);
      entries.push(`Combat: you ${role} ${e.attacker === tribe ? String(e.defender) : String(e.attacker)} at ${String(e.region)} (${result})`);
    } else if (e.kind === "pact_broken" && (e.parties as string[]).includes(tribe)) {
      const breaker = String(e.breaker);
      if (breaker === tribe) {
        entries.push(`You broke a pact with ${(e.parties as string[]).find((p) => p !== tribe)}`);
      } else {
        entries.push(`${breaker} broke a pact with you`);
      }
    } else if (e.kind === "war_declared" && (e.parties as string[]).includes(tribe)) {
      const other = (e.parties as string[]).find((p) => p !== tribe);
      entries.push(`War declared between you and ${other}`);
    } else if (e.kind === "tribe_eliminated" && e.tribe !== tribe) {
      entries.push(`${String(e.tribe)} was eliminated`);
    } else if (e.kind === "tribe_eliminated" && e.tribe === tribe) {
      entries.push(`You were eliminated`);
    } else if (e.kind === "caravan_intercepted" && e.from === tribe) {
      entries.push(`Your caravan to ${String(e.to)} was intercepted by ${String(e.interceptor)} (${String(e.amount)} Influence lost)`);
    } else if (e.kind === "caravan_delivered" && e.from === tribe) {
      entries.push(`Your caravan delivered ${String(e.amount)} Influence to ${String(e.to)}`);
    } else if (e.kind === "force_destroyed_no_retreat" && String(e.force_id).startsWith(`f_${tribe}_`)) {
      entries.push(`Your force ${String(e.force_id)} was destroyed (no retreat)`);
    } else if (e.kind === "arrival_rejected_garrison_cap" && String(e.force_id).startsWith(`f_${tribe}_`)) {
      entries.push(`Your force ${String(e.force_id)} arrived at full region and was destroyed`);
    } else if (e.kind === "victory") {
      entries.push(`GAME END: ${String(e.condition)}`);
    }
  }
  return entries;
}

export interface PrevTickState {
  readonly influence: number;
  readonly regionCount: number;
  readonly chooseIds: readonly string[];
}

export interface TickHistoryInput {
  readonly lastChooseIds: readonly string[];
  readonly lastFailedActions: readonly { id: string; reason: string }[];
  readonly lastSucceededActions: readonly string[];
  readonly stateDelta: {
    readonly influenceBefore: number;
    readonly influenceAfter: number;
    readonly regionsGained: number;
    readonly regionsLost: number;
    readonly forcesLost: number;
    readonly structuresBuilt: number;
  };
}

export function buildTickHistory(
  prev: PrevTickState,
  currentView: ProjectedView,
  prevEvents: readonly ResolutionEvent[],
  tribe: Tribe,
): TickHistoryInput {
  const failed = extractFailuresForTribe(prevEvents, tribe);
  const succeeded = extractSuccessesForTribe(prevEvents, tribe);
  let forcesLost = 0;
  let structuresBuilt = 0;
  for (const e of prevEvents) {
    if (e.kind === "force_destroyed_no_retreat" && String(e.force_id).startsWith(`f_${tribe}_`)) {
      forcesLost++;
    }
    if (e.kind === "arrival_rejected_garrison_cap" && String(e.force_id).startsWith(`f_${tribe}_`)) {
      forcesLost++;
    }
    if (e.kind === "built" && e.tribe === tribe) {
      structuresBuilt++;
    }
  }
  const currentRegionCount = countOwnedRegions(currentView);
  return {
    lastChooseIds: prev.chooseIds,
    lastFailedActions: failed,
    lastSucceededActions: succeeded,
    stateDelta: {
      influenceBefore: prev.influence,
      influenceAfter: currentView.myPlayerState.influence,
      regionsGained: Math.max(0, currentRegionCount - prev.regionCount),
      regionsLost: Math.max(0, prev.regionCount - currentRegionCount),
      forcesLost,
      structuresBuilt,
    },
  };
}
