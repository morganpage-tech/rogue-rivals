/**
 * Human-readable resolution event lines (ported from tools/v2/render_replay.py describeEvent).
 */

function str(x: unknown): string {
  if (x == null) return "";
  return String(x);
}

export function describeReplayEvent(event: Record<string, unknown>): string {
  const kind = str(event.kind);
  if (kind === "combat") {
    return `${str(event.attacker)} vs ${str(event.defender)} at ${str(event.region ?? event.region_id)} → ${str(event.result)}`;
  }
  if (kind === "dispatch_move") {
    return `${str(event.tribe)} moved ${str(event.force_id)}: ${str(event.from)} → ${str(event.to)} (${str(event.ticks)}t)`;
  }
  if (kind === "dispatch_scout") {
    return `${str(event.tribe)} dispatched scout ${str(event.scout_id)}: ${str(event.from)} → ${str(event.to)}`;
  }
  if (kind === "force_arrived") {
    return `${str(event.force_id)} arrived at ${str(event.region_id)}`;
  }
  if (kind === "scout_arrived") {
    return `${str(event.scout_id)} arrived at ${str(event.region_id)}`;
  }
  if (kind === "recruited") {
    return `${str(event.tribe)} recruited Tier ${str(event.tier)} at ${str(event.region_id)}`;
  }
  if (kind === "built") {
    return `${str(event.tribe)} built ${str(event.structure)} at ${str(event.region_id)}`;
  }
  if (kind === "proposal_sent") {
    return `${str(event.from)} proposed ${str(event.proposal_kind)} to ${str(event.to)}`;
  }
  if (kind === "pact_formed") {
    const parties = Array.isArray(event.parties) ? (event.parties as unknown[]).join(" / ") : "";
    return `Pact formed: ${parties} (${str(event.pact)})`;
  }
  if (kind === "pact_broken" || kind === "pact_broken_by_move") {
    return `Pact broken by ${str(event.breaker)}: ${Array.isArray(event.parties) ? (event.parties as unknown[]).join(" / ") : ""}`;
  }
  if (kind === "war_declared") {
    return `War declared: ${Array.isArray(event.parties) ? (event.parties as unknown[]).join(" / ") : ""}`;
  }
  if (kind === "caravan_delivered") {
    return `Caravan delivered: ${str(event.from)} → ${str(event.to)} (${str(event.amount)})`;
  }
  if (kind === "caravan_intercepted") {
    return `Caravan intercepted: ${str(event.from)} → ${str(event.to)} by ${str(event.interceptor)} (${str(event.amount)})`;
  }
  if (kind === "proposal_expired") {
    return `Proposal expired: ${str(event.id)} (${str(event.from)} → ${str(event.to)})`;
  }
  if (kind === "influence_credited") {
    return `${str(event.tribe)} gained ${str(event.amount)} Influence`;
  }
  if (kind.endsWith("_failed")) {
    return `${kind}: ${str(event.reason) || "unknown"}`;
  }
  return JSON.stringify(event);
}
