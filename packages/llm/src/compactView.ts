/**
 * Render normalized ProjectedView (snake_case) as prompt text.
 * Port of tools/v2/llm_agent._compact_view.
 */

function str(x: unknown): string {
  return x === undefined || x === null ? "" : String(x);
}

export function compactView(view: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`Tick: ${str(view.tick)}  (you are ${str(view.for_tribe)})`);
  lines.push(`Tribes alive: ${((view.tribes_alive as string[]) ?? []).join(", ")}`);

  const ps = (view.my_player_state as Record<string, unknown>) ?? {};
  lines.push(
    `Your Influence: ${str(ps.influence)}   ` +
      `Reputation penalty until tick: ${str(ps.reputation_penalty_expires_tick)}`,
  );

  lines.push("");
  lines.push("Your forces:");
  const myForces = (view.my_forces as Record<string, unknown>[]) ?? [];
  for (const f of myForces) {
    const loc =
      f.location_kind === "garrison"
        ? `garrisoned at ${str(f.location_region_id)}`
        : f.location_kind === "transit" && f.location_transit
          ? `in transit ${str((f.location_transit as Record<string, unknown>).direction_from)} -> ${str((f.location_transit as Record<string, unknown>).direction_to)} (${str((f.location_transit as Record<string, unknown>).ticks_remaining)} ticks left)`
          : "";
    lines.push(`  ${str(f.id)} (Tier ${str(f.tier)}) ${loc}`);
  }
  if (!myForces.length) lines.push("  (none)");

  const myScouts = (view.my_scouts as Record<string, unknown>[]) ?? [];
  if (myScouts.length) {
    lines.push("Your scouts:");
    for (const s of myScouts) {
      let loc: string;
      if (s.location_kind === "transit" && s.transit) {
        const t = s.transit as Record<string, unknown>;
        loc = `in transit ${str(t.direction_from)} -> ${str(t.direction_to)} (${str(t.ticks_remaining)} left)`;
      } else if (s.location_kind === "arrived") {
        loc = `arrived at ${str(s.location_region_id)} (expires tick ${str(s.expires_tick)})`;
      } else {
        loc = "";
      }
      lines.push(`  ${str(s.id)} targeting ${str(s.target_region_id)}, ${loc}`);
    }
  }

  const myCaravans = (view.my_caravans as Record<string, unknown>[]) ?? [];
  if (myCaravans.length) {
    lines.push("Your caravans:");
    for (const c of myCaravans) {
      lines.push(
        `  ${str(c.id)} to ${str(c.recipient)} (${str(c.amount_influence)} Influence), ` +
          `path ${str(c.path)}, at index ${str(c.current_index)}, ` +
          `${str(c.ticks_to_next_region)} ticks to next hop`,
      );
    }
  }

  lines.push("");
  lines.push("Visible regions:");
  const vis = view.visible_regions as Record<string, Record<string, unknown>> | undefined;
  const regionIds = vis ? Object.keys(vis).sort() : [];
  for (const rid of regionIds) {
    const r = vis![rid]!;
    const structures = ((r.structures as string[]) ?? []).join(",") || "-";
    const owner = str(r.owner) || "unclaimed";
    const garrison = r.garrison_force_id;
    const garrisonTxt = garrison ? " (has garrison)" : "";
    lines.push(
      `  ${rid} (${str(r.type)}) owner=${owner} structures=[${structures}]${garrisonTxt}`,
    );
  }

  const vf = (view.visible_forces as Record<string, unknown>[]) ?? [];
  if (vf.length) {
    lines.push("");
    lines.push("Visible foreign forces (fuzzy tier):");
    for (const f of vf) {
      lines.push(`  ${str(f.owner)}'s ${str(f.fuzzy_tier)} at ${str(f.region_id)}`);
    }
  }

  const vt = (view.visible_transits as Record<string, unknown>[]) ?? [];
  if (vt.length) {
    lines.push("");
    lines.push("Visible foreign transits (fuzzy tier):");
    for (const t of vt) {
      lines.push(
        `  ${str(t.owner)}'s ${str(t.fuzzy_tier)} in transit ` +
          `${str(t.direction_from)} -> ${str(t.direction_to)} (seen in ${str(t.observed_in_region_id)})`,
      );
    }
  }

  const vs = (view.visible_scouts as Record<string, unknown>[]) ?? [];
  if (vs.length) {
    lines.push("");
    lines.push("Visible foreign scouts:");
    for (const s of vs) {
      lines.push(`  ${str(s.owner)}'s scout at ${str(s.region_id)}`);
    }
  }

  const pacts = (view.pacts_involving_me as Record<string, unknown>[]) ?? [];
  if (pacts.length) {
    lines.push("");
    lines.push("Active pacts involving you:");
    for (const p of pacts) {
      const parties = (p.parties as string[]) ?? [];
      const other = parties.find((t) => t !== view.for_tribe) ?? "";
      lines.push(
        `  ${str(p.kind)} with ${other} (formed tick ${str(p.formed_tick)}, ` +
          `expires tick ${str(p.expires_tick)})`,
      );
    }
  }

  const inboxNew = (view.inbox_new as Record<string, unknown>[]) ?? [];
  if (inboxNew.length) {
    lines.push("");
    lines.push("New inbox this tick:");
    for (const m of inboxNew) {
      if (str(m.kind) === "proposal") {
        const prop = (m.proposal as Record<string, unknown>) ?? {};
        const repTag = m.reputation_penalty ? " [RECENT PACT-BREAKER]" : "";
        let extras = "";
        if (prop.kind === "trade_offer") extras = ` amount=${str(prop.amount_influence)}`;
        if (prop.kind === "nap" || prop.kind === "shared_vision")
          extras = ` length=${str(prop.length_ticks)} ticks`;
        lines.push(
          `  PROPOSAL id=${str(prop.id)}${repTag} ${str(prop.kind)} from ${str(m.from_tribe)}${extras}`,
        );
      } else if (str(m.kind) === "message") {
        lines.push(`  MESSAGE from ${str(m.from_tribe)}: "${str(m.text)}"`);
      } else if (str(m.kind) === "scout_report") {
        const pl = (m.payload as Record<string, unknown>) ?? {};
        lines.push(`  SCOUT REPORT region=${str(pl.region_id)}`);
      } else if (str(m.kind) === "caravan_delivered") {
        const pl = (m.payload as Record<string, unknown>) ?? {};
        lines.push(`  CARAVAN DELIVERED from ${str(m.from_tribe)} amount=${str(pl.amount)}`);
      } else {
        lines.push(`  ${str(m.kind)}: ${str(m.text) ?? str(m.payload)}`);
      }
    }
  }

  const ann = (view.announcements_new as Record<string, unknown>[]) ?? [];
  if (ann.length) {
    lines.push("");
    lines.push("Public announcements this tick:");
    for (const a of ann) {
      const k = str(a.kind);
      if (k === "pact_formed") lines.push(`  PACT FORMED (${str(a.detail)}): ${JSON.stringify(a.parties)}`);
      else if (k === "pact_broken")
        lines.push(
          `  PACT BROKEN (${str(a.detail)}): ${JSON.stringify(a.parties)} -- breaker: ${str(a.breaker)}`,
        );
      else if (k === "war_declared") lines.push(`  WAR DECLARED between ${JSON.stringify(a.parties)}`);
      else if (k === "tribe_eliminated") lines.push(`  TRIBE ELIMINATED: ${JSON.stringify(a.parties)}`);
      else if (k === "caravan_intercepted")
        lines.push(
          `  CARAVAN INTERCEPTED between ${JSON.stringify(a.parties)} by ${str(a.interceptor)} for ${str(a.amount)} Influence`,
        );
      else if (k === "victory")
        lines.push(`  VICTORY: ${JSON.stringify(a.parties)} via ${str(a.condition)}`);
    }
  }

  const outstanding = (ps.outstanding_proposals as Record<string, unknown>[]) ?? [];
  if (outstanding.length) {
    lines.push("");
    lines.push("Pending proposals awaiting YOUR response:");
    for (const p of outstanding) {
      let extras = "";
      if (p.kind === "trade_offer") extras = ` amount=${str(p.amount_influence)}`;
      if (p.kind === "nap" || p.kind === "shared_vision") extras = ` length=${str(p.length_ticks)} ticks`;
      lines.push(`  id=${str(p.id)} ${str(p.kind)} from ${str(p.from_tribe)}${extras}`);
    }
  }

  const legalOptions = (view.legal_order_options as Record<string, unknown>[]) ?? [];
  if (legalOptions.length) {
    lines.push("");
    lines.push("Legal order options (choose by id):");
    for (const opt of legalOptions) {
      lines.push(`  ${str(opt.id)}: ${str(opt.summary)}`);
    }
  }

  return lines.join("\n");
}
