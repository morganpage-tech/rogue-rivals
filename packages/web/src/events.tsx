import React from "react";
import type { Resource, Region, BuildingType } from "@rr/engine";
import {
  BUILDING_LABEL,
  REGION_LABEL,
  RES_SHORT,
  TRIBE_LABEL,
  formatResourceBag,
} from "./format";

type Ev = Record<string, unknown>;

function who(pid: string, nameOf: (id: string) => string): React.ReactNode {
  return <span className="who">{nameOf(pid)}</span>;
}

function bag(res: unknown): string {
  if (!res || typeof res !== "object") return "—";
  return formatResourceBag(res as Partial<Record<Resource, number>>);
}

function renderAction(
  action: Record<string, unknown>,
  actorId: string,
  ev: Ev,
  nameOf: (id: string) => string,
): { text: React.ReactNode; className: string } {
  const t = action.type as string;
  if (t === "pass") {
    return { text: <>{who(actorId, nameOf)} passed.</>, className: "sys" };
  }
  if (t === "gather") {
    const region = action.region as Region;
    const y = bag(action.yield);
    const interceptedBy = action.intercepted_by as string | null;
    if (interceptedBy) {
      return {
        text: (
          <>
            {who(actorId, nameOf)} gathered from {REGION_LABEL[region]} — intercepted.
          </>
        ),
        className: "ambush",
      };
    }
    return {
      text: (
        <>
          {who(actorId, nameOf)} gathered <b>{y}</b> from {REGION_LABEL[region]}.
        </>
      ),
      className: "",
    };
  }
  if (t === "build") {
    const b = action.building as BuildingType;
    const vp = (action.vp_gained as number) ?? 0;
    const cost = bag(action.cost_paid);
    return {
      text: (
        <>
          {who(actorId, nameOf)} built a <b>{BUILDING_LABEL[b]}</b> (+{vp} VP) for {cost}.
        </>
      ),
      className: "build",
    };
  }
  if (t === "ambush") {
    return {
      text: <>{who(actorId, nameOf)} is lying in wait…</>,
      className: "ambush",
    };
  }
  if (t === "scout") {
    const region = action.region as Region;
    const reveal = action.reveal as
      | { ambush_detected: boolean; ambusher_id?: string }
      | undefined;
    if (reveal?.ambush_detected && reveal.ambusher_id) {
      return {
        text: (
          <>
            {who(actorId, nameOf)} scouted {REGION_LABEL[region]} and spotted{" "}
            {who(reveal.ambusher_id, nameOf)} lying in wait.
          </>
        ),
        className: "ambush",
      };
    }
    return {
      text: (
        <>
          {who(actorId, nameOf)} scouted {REGION_LABEL[region]} — all clear.
        </>
      ),
      className: "",
    };
  }
  void ev;
  return { text: <span className="muted">{t}</span>, className: "sys" };
}

export function renderEvent(
  ev: Ev,
  nameOf: (id: string) => string,
): React.ReactNode {
  const type = ev.type as string;

  if (type === "turn") {
    const actor = ev.player_id as string;
    const action = ev.action as Record<string, unknown>;
    const r = renderAction(action, actor, ev, nameOf);
    return (
      <div className={`ev ${r.className}`}>
        <span className="muted">R{ev.round as number} · </span>
        {r.text}
      </div>
    );
  }

  if (type === "ambush_triggered") {
    const attacker = ev.attacker_id as string;
    const victim = ev.victim_id as string;
    const region = ev.region as Region;
    const absorbed = ev.watchtower_absorbed as boolean;
    if (absorbed) {
      return (
        <div className="ev ambush">
          {who(victim, nameOf)}'s watchtower blocked {who(attacker, nameOf)}'s ambush at{" "}
          {REGION_LABEL[region]}.
        </div>
      );
    }
    const stolen = bag(ev.stolen);
    return (
      <div className="ev ambush">
        {who(attacker, nameOf)} ambushed {who(victim, nameOf)} at {REGION_LABEL[region]} —
        took <b>{stolen}</b>.
      </div>
    );
  }

  if (type === "ambush_expired") {
    return (
      <div className="ev sys">
        {who(ev.player_id as string, nameOf)}'s ambush at{" "}
        {REGION_LABEL[ev.region as Region]} expired.
      </div>
    );
  }

  if (type === "trade_proposed") {
    return (
      <div className="ev trade">
        {who(ev.from as string, nameOf)} proposed a trade to {who(ev.to as string, nameOf)}.
      </div>
    );
  }

  if (type === "trade_resolved") {
    return (
      <div className="ev trade">
        Trade resolved — {who(ev.offerer as string, nameOf)} ?{" "}
        {who(ev.recipient as string, nameOf)}.
      </div>
    );
  }

  if (type === "trade_rejected") {
    return (
      <div className="ev sys">
        {who(ev.by as string, nameOf)} rejected a trade.
      </div>
    );
  }

  if (type === "trade_countered") {
    return (
      <div className="ev trade">
        {who(ev.from as string, nameOf)} countered a trade to {who(ev.to as string, nameOf)}.
      </div>
    );
  }

  if (type === "trade_expired") {
    return <div className="ev sys">A trade offer expired.</div>;
  }

  if (type === "bead_earned") {
    return (
      <div className="ev bead">
        {who(ev.player_id as string, nameOf)} earned a trade bead{" "}
        <span className="muted">(pending)</span>.
      </div>
    );
  }

  if (type === "bead_converted") {
    return (
      <div className="ev bead">
        {who(ev.player_id as string, nameOf)} converted 2 beads ? <b>+1 VP</b>.
      </div>
    );
  }

  if (type === "bead_stolen") {
    return (
      <div className="ev bead">
        {who(ev.from as string, nameOf)}'s pending beads were stolen by{" "}
        {who(ev.to as string, nameOf)}.
      </div>
    );
  }

  if (type === "bead_denied") {
    return (
      <div className="ev bead">
        {who(ev.player_id as string, nameOf)}'s pending beads were lost.
      </div>
    );
  }

  if (type === "round_end") {
    return (
      <div className="ev round">
        ?? End of round {(ev.round as number) ?? ""} ??
      </div>
    );
  }

  if (type === "round_start") {
    return (
      <div className="ev round">
        ?? Round {(ev.round as number) ?? ""} begins ??
      </div>
    );
  }

  if (type === "trailing_bonus_awarded") {
    return (
      <div className="ev sys">
        Trailing bonus awarded to {who(ev.player_id as string, nameOf)}.
      </div>
    );
  }

  if (type === "match_end") {
    const winner = ev.winner_id as string | undefined;
    return (
      <div className="ev round">
        Match ended — {winner ? `winner: ${nameOf(winner)}` : "no winner"}.
      </div>
    );
  }

  if (type === "turn_start") {
    return (
      <div className="ev sys">
        {who(ev.player_id as string, nameOf)}'s turn.
      </div>
    );
  }

  // Unknown/debug fallback — show the raw type but keep it subtle.
  void RES_SHORT;
  void TRIBE_LABEL;
  return <div className="ev sys">· {type}</div>;
}
