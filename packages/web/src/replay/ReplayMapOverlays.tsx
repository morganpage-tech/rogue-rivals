/**
 * Resolution overlay layer (ported from tools/v2/render_replay.py renderMap overlays).
 */

import type { RegionId, Tribe } from "@rr/shared";
import type { ReactNode } from "react";
import type { ReplayFrame } from "./types.js";

function tribeAbbr(tribe: string): string {
  return tribe
    .split("_")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function tribeColor(tribeStroke: Record<string, string>, tribe: string): string {
  return tribeStroke[tribe] ?? "#666";
}

function prevStateForces(prev: unknown): Record<string, { location_kind?: string; location_region_id?: string }> {
  if (typeof prev !== "object" || prev === null) return {};
  const forces = (prev as { forces?: Record<string, unknown> }).forces;
  if (typeof forces !== "object" || forces === null) return {};
  const out: Record<string, { location_kind?: string; location_region_id?: string }> = {};
  for (const [k, v] of Object.entries(forces)) {
    if (typeof v === "object" && v !== null) {
      const o = v as Record<string, unknown>;
      out[k] = {
        location_kind: o.location_kind != null ? String(o.location_kind) : undefined,
        location_region_id:
          o.location_region_id != null ? String(o.location_region_id) : undefined,
      };
    }
  }
  return out;
}

export function buildReplayMapOverlays(props: {
  frame: ReplayFrame;
  prevFrame: ReplayFrame | null;
  showOverlays: boolean;
  layout: Record<string, readonly [number, number]>;
  tribeStroke: Record<string, string>;
}): ReactNode {
  const { frame, prevFrame, showOverlays, layout, tribeStroke } = props;
  if (!showOverlays) return null;

  const events = (frame.resolution_events ?? []) as Record<string, unknown>[];
  const prevState = prevFrame?.state;

  const builtKeys = new Set(
    events.filter((e) => e.kind === "built").map((e) => `${e.tribe}|${e.region_id}|${e.structure}`),
  );
  const recruitedKeys = new Set(
    events.filter((e) => e.kind === "recruited").map((e) => `${e.tribe}|${e.region_id}|${e.tier}`),
  );
  const moveKeys = new Set(
    events
      .filter((e) => e.kind === "dispatch_move")
      .map((e) => `${e.tribe}|${e.force_id}|${e.to}`),
  );
  const scoutKeys = new Set(
    events
      .filter((e) => e.kind === "dispatch_scout")
      .map((e) => `${e.tribe}|${e.from}|${e.to}`),
  );

  const buildFailReasons: Record<string, string[]> = {};
  for (const event of events) {
    if (event.kind === "build_failed" && event.tribe) {
      const t = String(event.tribe);
      if (!buildFailReasons[t]) buildFailReasons[t] = [];
      buildFailReasons[t]!.push(String(event.reason ?? "failed"));
    }
  }

  const regionBadgeCount: Record<string, number> = {};

  const nodes: ReactNode[] = [];

  const addRegionBadge = (
    rid: RegionId,
    text: string,
    fill: string,
  ) => {
    const p = layout[rid];
    if (!p) return;
    const [x, y] = p;
    const n = regionBadgeCount[rid] ?? 0;
    regionBadgeCount[rid] = n + 1;
    const bx = x - 50;
    const by = y + 38 + n * 18;
    const width = Math.max(42, 8 * text.length + 10);
    nodes.push(
      <g key={`badge-${rid}-${n}-${text}`}>
        <rect
          x={bx}
          y={by}
          width={width}
          height={16}
          rx={8}
          fill={fill}
          stroke="#111"
          opacity={0.95}
        />
        <text
          x={bx + width / 2}
          y={by + 11}
          fill="#fff"
          fontSize={9}
          fontWeight="bold"
          textAnchor="middle"
        >
          {text}
        </text>
      </g>,
    );
  };

  const addPathOverlay = (
    fromRid: RegionId,
    toRid: RegionId,
    tribe: Tribe,
    text: string,
    colorOverride: string | null,
    dashed: boolean,
  ) => {
    const a = layout[fromRid];
    const b = layout[toRid];
    if (!a || !b) return;
    const sx = a[0];
    const sy = a[1];
    const ex = b[0];
    const ey = b[1];
    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2;
    const color = colorOverride ?? tribeColor(tribeStroke, tribe);
    const labelWidth = Math.max(54, 8 * text.length + 10);
    nodes.push(
      <g key={`path-${fromRid}-${toRid}-${text}`}>
        <line
          x1={sx}
          y1={sy}
          x2={ex}
          y2={ey}
          stroke={color}
          strokeWidth={4}
          opacity={0.9}
          strokeDasharray={dashed ? "8,5" : undefined}
          markerEnd="url(#replayOverlayArrow)"
        />
        <rect
          x={mx - labelWidth / 2}
          y={my - 28}
          width={labelWidth}
          height={18}
          rx={8}
          fill={color}
          stroke="#111"
          opacity={0.95}
        />
        <text
          x={mx}
          y={my - 15}
          fill="#fff"
          fontSize={9}
          fontWeight="bold"
          textAnchor="middle"
        >
          {text}
        </text>
      </g>,
    );
  };

  const addRegionPulse = (rid: RegionId, stroke: string, widthPx: number) => {
    const p = layout[rid];
    if (!p) return;
    nodes.push(
      <circle
        key={`pulse-${rid}-${stroke}`}
        cx={p[0]}
        cy={p[1]}
        r={48}
        fill="none"
        stroke={stroke}
        strokeWidth={widthPx}
        opacity={0.95}
      />,
    );
  };

  const ordersByTribe = frame.orders_by_tribe ?? {};
  for (const [tribe, pkt] of Object.entries(ordersByTribe)) {
    const orders = pkt.orders ?? [];
    for (const order of orders) {
      const payload = (order.payload ?? {}) as Record<string, unknown>;
      if (order.kind === "build" && payload.region_id) {
        const rid = String(payload.region_id);
        const label = `${tribeAbbr(tribe)} build ${String(payload.structure ?? "")}`.trim();
        addRegionBadge(rid, label, tribeColor(tribeStroke, tribe));
        const ok = builtKeys.has(`${tribe}|${rid}|${String(payload.structure)}`);
        if (!ok) {
          const reason = (buildFailReasons[tribe] ?? []).shift();
          addRegionBadge(
            rid,
            reason ? `fail ${reason}` : "build failed",
            "#a12b2b",
          );
        }
      } else if (order.kind === "recruit" && payload.region_id) {
        const rid = String(payload.region_id);
        const ok = recruitedKeys.has(`${tribe}|${rid}|${String(payload.tier ?? "?")}`);
        if (!ok) {
          addRegionBadge(rid, `${tribeAbbr(tribe)} rec T${String(payload.tier ?? "?")}`, tribeColor(tribeStroke, tribe));
          addRegionBadge(rid, "recruit failed", "#a12b2b");
        }
      } else if (
        order.kind === "move" &&
        payload.force_id &&
        payload.destination_region_id &&
        prevState
      ) {
        const ok = moveKeys.has(
          `${tribe}|${String(payload.force_id)}|${String(payload.destination_region_id)}`,
        );
        if (!ok) {
          const prevForces = prevStateForces(prevState);
          const prevForce = prevForces[String(payload.force_id)];
          const fromRid =
            prevForce?.location_kind === "garrison" ? prevForce.location_region_id : null;
          if (fromRid) {
            addPathOverlay(
              fromRid,
              String(payload.destination_region_id),
              tribe as Tribe,
              `${tribeAbbr(tribe)} move fail`,
              "#a12b2b",
              true,
            );
          }
        }
      } else if (order.kind === "scout" && payload.from_region_id && payload.target_region_id) {
        const ok = scoutKeys.has(
          `${tribe}|${String(payload.from_region_id)}|${String(payload.target_region_id)}`,
        );
        if (!ok) {
          addPathOverlay(
            String(payload.from_region_id),
            String(payload.target_region_id),
            tribe as Tribe,
            `${tribeAbbr(tribe)} scout fail`,
            "#a12b2b",
            true,
          );
        }
      }
    }
  }

  for (const event of events) {
    const k = String(event.kind);
    if (k === "dispatch_move") {
      addPathOverlay(
        String(event.from),
        String(event.to),
        String(event.tribe) as Tribe,
        `${tribeAbbr(String(event.tribe))} move`,
        null,
        false,
      );
    } else if (k === "dispatch_scout") {
      addPathOverlay(
        String(event.from),
        String(event.to),
        String(event.tribe) as Tribe,
        `${tribeAbbr(String(event.tribe))} scout`,
        null,
        false,
      );
    } else if (k === "built") {
      addRegionBadge(String(event.region_id), `built ${String(event.structure)}`, "#4d7c3a");
    } else if (k === "recruited") {
      addRegionBadge(String(event.region_id), `recruit T${String(event.tier)}`, "#2d6fb0");
    } else if (k === "force_arrived") {
      addRegionPulse(String(event.region_id), "#5ee173", 4);
    } else if (k === "scout_arrived") {
      addRegionPulse(String(event.region_id), "#72d5ff", 4);
    } else if (k === "combat") {
      const rid = String(event.region ?? event.region_id);
      addRegionPulse(rid, "#ff5d5d", 6);
      addRegionBadge(rid, "COMBAT", "#8f2222");
    } else if (k === "region_transferred" || k === "region_captured" || k === "region_claimed") {
      addRegionBadge(
        String(event.region_id),
        "capture",
        "#8a5a17",
      );
    }
  }

  return (
    <>
      <defs>
        <marker
          id="replayOverlayArrow"
          viewBox="0 0 10 10"
          refX={8}
          refY={5}
          markerWidth={7}
          markerHeight={7}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#ffffff" />
        </marker>
      </defs>
      {nodes}
    </>
  );
}
