import { applyCommand } from "./commands.js";
import type { Action, MatchState } from "./state.js";
import type { BuildingType, Region } from "./rules.js";

/** One `turn` record from simulations/batch_v0.7.3.jsonl */
export interface SimTurnEvent {
  type: "turn";
  player_id: string;
  offers_rejected: string[];
  offers_accepted: string[];
  offers_made: Array<{
    offer_id: string;
    to: string;
    offered: Record<string, number>;
    requested: Record<string, number>;
  }>;
  action: Record<string, unknown>;
}

export function mapSimActionPayload(payload: Record<string, unknown>): Action {
  const t = payload.type as string;
  if (t === "pass") return { kind: "pass" };
  if (t === "gather") {
    return { kind: "gather", region: payload.region as Region };
  }
  if (t === "scout") {
    return { kind: "scout", region: payload.region as Region };
  }
  if (t === "ambush") {
    return { kind: "ambush", region: payload.region as Region };
  }
  if (t === "build") {
    return { kind: "build", building: payload.building as BuildingType };
  }
  return { kind: "pass" };
}

export function replayOneTurn(state: MatchState, turn: SimTurnEvent, now: Date): MatchState {
  let s = state;
  const pid = turn.player_id;

  for (const oid of [...turn.offers_rejected].sort()) {
    const out = applyCommand(s, pid, { kind: "reject_trade", offerId: oid }, now);
    if ("error" in out) {
      throw new Error(`reject ${oid}: ${out.error.code} ${out.error.message}`);
    }
    s = out.newState;
  }
  for (const oid of [...turn.offers_accepted].sort()) {
    const out = applyCommand(s, pid, { kind: "accept_trade", offerId: oid }, now);
    if ("error" in out) {
      throw new Error(`accept ${oid}: ${out.error.code} ${out.error.message}`);
    }
    s = out.newState;
  }
  for (const pr of turn.offers_made) {
    const out = applyCommand(s, pid, {
      kind: "propose_trade",
      offer: {
        offerer: pid,
        recipient: pr.to,
        offered: pr.offered,
        requested: pr.requested,
        id: pr.offer_id,
      },
    }, now);
    if ("error" in out) {
      throw new Error(`propose ${pr.offer_id}: ${out.error.code} ${out.error.message}`);
    }
    s = out.newState;
  }

  const action = mapSimActionPayload(turn.action);
  const out = applyCommand(s, pid, { kind: "take_action", action }, now);
  if ("error" in out) {
    throw new Error(`action: ${out.error.code} ${out.error.message}`);
  }
  return out.newState;
}
