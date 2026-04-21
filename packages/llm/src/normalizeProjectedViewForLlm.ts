/**
 * Convert browser / @rr/engine2 ProjectedView JSON to the shape expected by
 * compactView (snake_case, flat location_* fields). Port of tools/v2/projected_view_bridge.py.
 */

function camelToSnake(name: string): string {
  const s1 = name.replace(/(.)([A-Z][a-z]+)/g, "$1_$2");
  return s1.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function keysToSnake(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map((x) => keysToSnake(x));
  if (obj !== null && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const nk = typeof k === "string" ? camelToSnake(k) : k;
      out[String(nk)] = keysToSnake(v);
    }
    return out;
  }
  return obj;
}

function flattenForce(f: Record<string, unknown>): Record<string, unknown> {
  if ("location_kind" in f) return f;
  const loc = f.location;
  if (loc === null || typeof loc !== "object") return f;
  const l = loc as Record<string, unknown>;
  const kind = l.kind;
  const base: Record<string, unknown> = { ...f };
  delete base.location;
  if (kind === "garrison") {
    base.location_kind = "garrison";
    base.location_region_id = l.region_id;
    base.location_transit = null;
    return base;
  }
  if (kind === "transit") {
    base.location_kind = "transit";
    base.location_region_id = null;
    base.location_transit = {
      trail_index: l.trail_index,
      direction_from: l.direction_from,
      direction_to: l.direction_to,
      ticks_remaining: l.ticks_remaining,
    };
    return base;
  }
  return f;
}

function flattenScout(s: Record<string, unknown>): Record<string, unknown> {
  if ("location_kind" in s) return s;
  const loc = s.location;
  if (loc === null || typeof loc !== "object") return s;
  const l = loc as Record<string, unknown>;
  const kind = l.kind;
  const base: Record<string, unknown> = { ...s };
  delete base.location;
  if (kind === "transit") {
    base.location_kind = "transit";
    base.location_region_id = null;
    base.expires_tick = null;
    base.transit = {
      trail_index: l.trail_index,
      direction_from: l.direction_from,
      direction_to: l.direction_to,
      ticks_remaining: l.ticks_remaining,
    };
    return base;
  }
  if (kind === "arrived") {
    base.location_kind = "arrived";
    base.location_region_id = l.region_id;
    base.expires_tick = l.expires_tick;
    base.transit = null;
    return base;
  }
  return s;
}

function liftMessageFrom(d: Record<string, unknown>): void {
  if ("from" in d && !("from_tribe" in d)) {
    d.from_tribe = d.from;
    delete d.from;
  }
}

function liftProposalParties(p: Record<string, unknown>): void {
  if ("from" in p && !("from_tribe" in p)) {
    p.from_tribe = p.from;
    delete p.from;
  }
  if ("to" in p && !("to_tribe" in p)) {
    p.to_tribe = p.to;
    delete p.to;
  }
}

function fixInboxLists(view: Record<string, unknown>): void {
  const inboxNew = view.inbox_new;
  if (Array.isArray(inboxNew)) {
    for (const m of inboxNew) {
      if (m !== null && typeof m === "object") {
        const mm = m as Record<string, unknown>;
        liftMessageFrom(mm);
        const prop = mm.proposal;
        if (prop !== null && typeof prop === "object") liftProposalParties(prop as Record<string, unknown>);
      }
    }
  }

  const ps = view.my_player_state;
  if (ps !== null && typeof ps === "object") {
    const pso = ps as Record<string, unknown>;
    const inbox = pso.inbox;
    if (Array.isArray(inbox)) {
      for (const m of inbox) {
        if (m !== null && typeof m === "object") {
          const mm = m as Record<string, unknown>;
          liftMessageFrom(mm);
          const prop = mm.proposal;
          if (prop !== null && typeof prop === "object") liftProposalParties(prop as Record<string, unknown>);
        }
      }
    }
    const outstanding = pso.outstanding_proposals;
    if (Array.isArray(outstanding)) {
      for (const p of outstanding) {
        if (p !== null && typeof p === "object") liftProposalParties(p as Record<string, unknown>);
      }
    }
  }

  const legal = view.legal_order_options;
  if (Array.isArray(legal)) {
    for (const opt of legal) {
      if (opt !== null && typeof opt === "object") {
        const payload = (opt as Record<string, unknown>).payload;
        if (payload !== null && typeof payload === "object") {
          const prop = (payload as Record<string, unknown>).proposal;
          if (prop !== null && typeof prop === "object") liftProposalParties(prop as Record<string, unknown>);
        }
      }
    }
  }
}

export function normalizeProjectedViewForLlm(view: unknown): Record<string, unknown> {
  const raw = JSON.stringify(view);
  let data = JSON.parse(raw) as Record<string, unknown>;
  data = keysToSnake(data) as Record<string, unknown>;

  const mf = data.my_forces;
  if (Array.isArray(mf)) {
    data.my_forces = mf.map((x) =>
      x !== null && typeof x === "object" ? flattenForce(x as Record<string, unknown>) : x,
    );
  }

  const ms = data.my_scouts;
  if (Array.isArray(ms)) {
    data.my_scouts = ms.map((x) =>
      x !== null && typeof x === "object" ? flattenScout(x as Record<string, unknown>) : x,
    );
  }

  fixInboxLists(data);
  return data;
}
