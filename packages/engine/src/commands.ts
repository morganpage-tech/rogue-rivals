import type { Command, MatchState, Action } from "./state.js";
import { cloneMatchState, snapshotPrivate } from "./state.js";
import type { Region } from "./rules.js";
import { REGION_KEYS, RES_KEYS } from "./rules.js";
import type { LogEvent } from "./log.js";
import {
  canPayResources,
  expireOffersFromOfferer,
  findOffer,
  removeOffer,
  resolveTrade,
} from "./trade.js";
import {
  applyGather,
  applyScout,
  applyAmbushSet,
  applyBuild,
  computeBuildCost,
  passActionPayload,
} from "./actions.js";
import { advanceAfterTakeAction } from "./matchEnd.js";

export type RuleError = { code: string; message: string };

function err(code: string, message: string): RuleError {
  return { code, message };
}

function currentPlayer(state: MatchState): string {
  return state.currentPlayerId;
}

/** Structural legality of one action for `playerId` at `state.currentPlayerId`. */
export function actionIsLegalNow(state: MatchState, playerId: string, act: Action): boolean {
  if (state.matchEnded || playerId !== currentPlayer(state)) return false;
  switch (act.kind) {
    case "pass":
      return true;
    case "gather":
    case "scout":
      return REGION_KEYS.includes(act.region);
    case "ambush": {
      const ps = state.players[playerId];
      return (
        REGION_KEYS.includes(act.region) &&
        ps.resources.S >= 1 &&
        ps.activeAmbushRegion === null
      );
    }
    case "build": {
      const ps = state.players[playerId];
      if (ps.buildings.includes(act.building)) return false;
      const forgePick =
        act.building === "forge" && act.forgePickedResources?.length
          ? act.forgePickedResources
          : undefined;
      return computeBuildCost(state, playerId, act.building, forgePick) !== null;
    }
    default:
      return false;
  }
}

function assertFreePhase(state: MatchState): RuleError | null {
  if (state.matchEnded) return err("match_ended", "Match already ended");
  return null;
}

function ensureCurrentPlayer(state: MatchState, playerId: string): RuleError | null {
  if (playerId !== currentPlayer(state)) {
    return err("wrong_turn", `Not ${playerId}'s turn`);
  }
  return null;
}

export function listLegalActions(state: MatchState, playerId: string): Action[] {
  if (state.matchEnded || playerId !== currentPlayer(state)) return [];
  const ps = state.players[playerId];
  const acts: Action[] = [];
  for (const reg of REGION_KEYS) {
    acts.push({ kind: "gather", region: reg });
  }
  for (const reg of REGION_KEYS) {
    acts.push({ kind: "scout", region: reg });
  }
  if (ps.resources.S >= 1 && ps.activeAmbushRegion === null) {
    for (const reg of REGION_KEYS) {
      acts.push({ kind: "ambush", region: reg });
    }
  }
  for (const bt of ["shack", "den", "watchtower", "forge", "great_hall"] as const) {
    if (ps.buildings.includes(bt)) continue;
    const c = computeBuildCost(state, playerId, bt);
    if (c) acts.push({ kind: "build", building: bt });
  }
  acts.push({ kind: "pass" });
  return acts;
}

export function isLegal(
  state: MatchState,
  playerId: string,
  command: Command,
): true | RuleError {
  const e = assertFreePhase(state);
  if (e) return e;
  const turn = ensureCurrentPlayer(state, playerId);
  if (turn) return turn;

  switch (command.kind) {
    case "take_action":
      return actionIsLegalNow(state, playerId, command.action)
        ? true
        : err("illegal_action", "Action not legal");
    case "reject_trade": {
      const o = findOffer(state, command.offerId);
      if (!o || o.recipient !== playerId) return err("bad_offer", "Offer not pending for you");
      return true;
    }
    case "accept_trade": {
      const o = findOffer(state, command.offerId);
      if (!o || o.recipient !== playerId) return err("bad_offer", "Offer not pending for you");
      return true;
    }
    case "counter_trade": {
      const o = findOffer(state, command.offerId);
      if (!o || o.recipient !== playerId) return err("bad_offer", "Offer not pending for you");
      return true;
    }
    case "propose_trade": {
      const to = command.offer.recipient;
      if (to === playerId) return err("bad_trade", "Cannot trade with self");
      if (!state.seatPlayerIds.includes(to)) return err("bad_trade", "Unknown recipient");
      return true;
    }
    default:
      return err("unknown", "Unknown command");
  }
}

export function applyCommand(
  state: MatchState,
  playerId: string,
  command: Command,
  _now: Date,
): { newState: MatchState; events: LogEvent[] } | { error: RuleError } {
  const draft = cloneMatchState(state);
  const events: LogEvent[] = [];

  const phaseErr = assertFreePhase(draft);
  if (phaseErr) return { error: phaseErr };
  const turnErr = ensureCurrentPlayer(draft, playerId);
  if (turnErr) return { error: turnErr };

  if (draft.needsTurnOpenExpire) {
    events.push(...expireOffersFromOfferer(draft, playerId));
    draft.needsTurnOpenExpire = false;
  }

  switch (command.kind) {
    case "reject_trade": {
      const o = removeOffer(draft, command.offerId);
      if (!o || o.recipient !== playerId) {
        return { error: err("bad_offer", "Cannot reject this offer") };
      }
      events.push({
        type: "trade_rejected",
        round: draft.round,
        offer_id: command.offerId,
        by: playerId,
      });
      return { newState: draft, events };
    }
    case "accept_trade": {
      const o = removeOffer(draft, command.offerId);
      if (!o || o.recipient !== playerId) {
        return { error: err("bad_offer", "Cannot accept this offer") };
      }
      const pa = draft.players[o.offerer];
      const pb = draft.players[o.recipient];
      if (!canPayResources(pa, o.offered) || !canPayResources(pb, o.requested)) {
        return { newState: draft, events };
      }
      const res = resolveTrade(draft, o);
      if (!res.ok) {
        return { newState: draft, events };
      }
      events.push(res.resolved);
      events.push(...res.events);
      return { newState: draft, events };
    }
    case "counter_trade": {
      const old = findOffer(draft, command.offerId);
      if (!old || old.recipient !== playerId) {
        return { error: err("bad_offer", "Cannot counter this offer") };
      }
      removeOffer(draft, command.offerId);
      draft.offerSeq += 1;
      const oid = `o${draft.round}_${draft.offerSeq}`;
      const newOffer = {
        id: oid,
        offerer: playerId,
        recipient: old.offerer,
        offered: { ...command.counter.offered },
        requested: { ...command.counter.requested },
        createdTurn: draft.round,
        status: "pending" as const,
      };
      draft.pendingOffers.push(newOffer);
      events.push({
        type: "trade_countered",
        round: draft.round,
        old_offer_id: command.offerId,
        new_offer_id: oid,
        from: playerId,
        to: old.offerer,
      });
      return { newState: draft, events };
    }
    case "propose_trade": {
      let oid: string;
      if (command.offer.id) {
        oid = command.offer.id;
        const m = /^o\d+_(\d+)$/.exec(oid);
        if (m) {
          draft.offerSeq = Math.max(draft.offerSeq, parseInt(m[1]!, 10));
        }
      } else {
        draft.offerSeq += 1;
        oid = `o${draft.round}_${draft.offerSeq}`;
      }
      const offer = {
        id: oid,
        offerer: playerId,
        recipient: command.offer.recipient,
        offered: { ...command.offer.offered },
        requested: { ...command.offer.requested },
        createdTurn: draft.round,
        status: "pending" as const,
        tributeRoutePayment: command.offer.tributeRoutePayment,
      };
      draft.pendingOffers.push(offer);
      events.push({
        type: "trade_proposed",
        round: draft.round,
        offer_id: oid,
        from: playerId,
        to: command.offer.recipient,
      });
      return { newState: draft, events };
    }
    case "take_action": {
      const act = command.action;
      const sb = snapshotPrivate(draft.players[playerId]);
      const turnIdx = draft.turnOrder.indexOf(playerId);

      const ilegal = isLegal(draft, playerId, command);
      if (ilegal !== true) {
        return { error: ilegal };
      }

      if (act.kind === "pass") {
        events.push(buildTurnEvent(draft, playerId, turnIdx, sb, passActionPayload));
        advanceAfterTakeAction(draft, events);
        return { newState: draft, events };
      }

      if (act.kind === "gather") {
        const g = applyGather(draft, playerId, act.region as Region);
        events.push(...g.events);
        events.push(buildTurnEvent(draft, playerId, turnIdx, sb, g.action));
        advanceAfterTakeAction(draft, events);
        return { newState: draft, events };
      }

      if (act.kind === "scout") {
        const sc = applyScout(draft, playerId, act.region as Region);
        events.push(...sc.events);
        events.push(buildTurnEvent(draft, playerId, turnIdx, sb, sc.action));
        advanceAfterTakeAction(draft, events);
        return { newState: draft, events };
      }

      if (act.kind === "ambush") {
        const am = applyAmbushSet(draft, playerId, act.region as Region);
        if (!am.ok) {
          return { error: err("illegal_action", "Cannot ambush") };
        }
        const apay = {
          type: "ambush",
          region: act.region,
          cost_paid: am.costPaid,
        };
        events.push(buildTurnEvent(draft, playerId, turnIdx, sb, apay));
        advanceAfterTakeAction(draft, events);
        return { newState: draft, events };
      }

      if (act.kind === "build") {
        const bt = act.building;
        const forgePick =
          bt === "forge" && act.forgePickedResources?.length
            ? act.forgePickedResources
            : undefined;
        const cost = computeBuildCost(draft, playerId, bt, forgePick);
        if (!cost) {
          return { error: err("illegal_action", "Cannot afford building") };
        }
        const vpg = applyBuild(draft, playerId, bt, cost);
        const apay = {
          type: "build",
          building: bt,
          cost_paid: Object.fromEntries(
            RES_KEYS.filter((k) => (cost[k] ?? 0) > 0).map((k) => [k, cost[k]]),
          ),
          vp_gained: vpg,
        };
        events.push(buildTurnEvent(draft, playerId, turnIdx, sb, apay));
        advanceAfterTakeAction(draft, events);
        return { newState: draft, events };
      }

      return { error: err("bad_action", "Unsupported action") };
    }
    default:
      return { error: err("unknown", "Unknown command") };
  }
}

function buildTurnEvent(
  state: MatchState,
  pid: string,
  turnIndexInRound: number,
  stateBefore: Record<string, unknown>,
  action: Record<string, unknown>,
): LogEvent {
  return {
    type: "turn",
    round: state.round,
    turn_index_in_round: turnIndexInRound,
    player_id: pid,
    state_before: stateBefore,
    offers_seen: [],
    offers_accepted: [],
    offers_rejected: [],
    offers_countered: [],
    offers_made: [],
    action,
    state_after: snapshotPrivate(state.players[pid]),
  };
}
