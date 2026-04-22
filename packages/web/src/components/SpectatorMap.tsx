import type {
  Region,
  SpectatorForce,
  SpectatorView,
  Tribe,
} from "@rr/shared";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { REPLAY_TRIBE_STROKE } from "../replay/replayTheme.js";
import { getSpectatorMapLayout } from "../replay/spectatorMapLayout.js";
import { regionShortName } from "../v2/formatV2.js";
import { useMapPanZoom } from "../v2/useMapPanZoom.js";

const TERRAIN_CLASS: Record<string, string> = {
  plains: "terrain-plains",
  mountains: "terrain-mountains",
  swamps: "terrain-swamps",
  desert: "terrain-desert",
  ruins: "terrain-ruins",
  forest: "terrain-forest",
  river_crossing: "terrain-river",
};

function tribeClass(owner: Tribe | null): string {
  if (!owner) return "";
  return `owner-${owner}`;
}

function tribeStrokeHex(tribe: Tribe): string {
  return REPLAY_TRIBE_STROKE[tribe] ?? "#888";
}

function transitMidpoint(
  from: string,
  to: string,
  layout: Record<string, readonly [number, number]>,
): [number, number] | null {
  const a = layout[from];
  const b = layout[to];
  if (!a || !b) return null;
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

interface SpectatorMapProps {
  view: SpectatorView;
  selectedRegionId: string | null;
  onSelectRegion: (id: string | null) => void;
  overlayChildren?: ReactNode;
}

export function SpectatorMap({
  view,
  selectedRegionId,
  onSelectRegion,
  overlayChildren = null,
}: SpectatorMapProps) {
  const regionIds = useMemo(() => Object.keys(view.regions), [view]);
  const layout = useMemo(
    () => getSpectatorMapLayout(regionIds),
    [regionIds],
  );

  const {
    svgRef,
    viewBoxStr,
    bounds,
    panning,
    toolbarId,
    zoomAtScreenCenter,
    resetView,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    WHEEL_FACTOR,
  } = useMapPanZoom({
    regionIds,
    layout: layout ?? {},
  });

  const trailEdges = useMemo(() => {
    if (!layout) return [];
    const seen = new Set<string>();
    const edges: {
      a: string;
      b: string;
      key: string;
      baseLengthTicks: number;
    }[] = [];
    for (const t of view.trails) {
      const key = t.a < t.b ? `${t.a}|${t.b}` : `${t.b}|${t.a}`;
      if (seen.has(key)) continue;
      if (!layout[t.a] || !layout[t.b]) continue;
      seen.add(key);
      edges.push({ a: t.a, b: t.b, key, baseLengthTicks: t.baseLengthTicks });
    }
    return edges;
  }, [view.trails, layout]);

  const garrisonByRegion = useMemo(() => {
    const map = new Map<string, SpectatorForce>();
    for (const f of Object.values(view.forces)) {
      if (f.location.kind === "garrison" && f.location.regionId) {
        map.set(f.location.regionId, f);
      }
    }
    return map;
  }, [view.forces]);

  const glyphSvg = useMemo(() => {
    if (!layout) return null;
    const L = layout;
    const out: ReactNode[] = [];

    for (const t of view.transits) {
      const mid = transitMidpoint(t.directionFrom, t.directionTo, L);
      if (!mid) continue;
      const [cx, cy] = mid;
      const label = `${t.owner.slice(0, 2).toUpperCase()} T${t.tier} → ${regionShortName(t.directionTo)} (${t.ticksRemaining})`;
      out.push(
        <g key={`tr-${t.forceId}`}>
          <title>
            {`${tribeStrokeHex(t.owner)} — tier ${t.tier}, ${t.ticksRemaining} ticks to arrival`}
          </title>
          <rect
            x={cx - 34}
            y={cy - 10}
            width={68}
            height={20}
            rx={8}
            fill={tribeStrokeHex(t.owner)}
            stroke="#111"
          />
          <text
            x={cx}
            y={cy + 4}
            fill="#fff"
            fontSize={10}
            fontWeight="bold"
            textAnchor="middle"
          >
            {label.length > 28 ? `${label.slice(0, 26)}…` : label}
          </text>
        </g>,
      );
    }

    for (const s of view.scouts) {
      if (s.location.kind !== "arrived") continue;
      const rid = s.location.regionId;
      const p = L[rid];
      if (!p) continue;
      const cx = p[0] - 30;
      const cy = p[1] + 28;
      out.push(
        <g key={`sc-${s.id}`}>
          <circle cx={cx} cy={cy} r={10} fill="#111" stroke={tribeStrokeHex(s.owner)} strokeWidth={2} />
          <text x={cx} y={cy + 4} fill="#fff" fontSize={9} fontWeight="bold" textAnchor="middle">
            S
          </text>
        </g>,
      );
    }

    for (const c of view.caravans) {
      const idx = Math.min(c.currentIndex, c.path.length - 1);
      const rid = c.path[idx];
      if (!rid) continue;
      const p = L[rid];
      if (!p) continue;
      const cx = p[0] + 30;
      const cy = p[1] - 30;
      out.push(
        <g key={`cv-${c.id}`}>
          <rect
            x={cx - 18}
            y={cy - 10}
            width={36}
            height={20}
            rx={8}
            fill="#d1b254"
            stroke="#111"
          />
          <text x={cx} y={cy + 4} fill="#111" fontSize={9} fontWeight="bold" textAnchor="middle">
            C{c.amountInfluence}
          </text>
        </g>,
      );
    }

    for (const id of regionIds) {
      const p = L[id];
      const r = view.regions[id] as Region | undefined;
      if (!p || !r?.structures?.length) continue;
      const structs = r.structures;
      const widths = structs.map((s) => Math.max(28, 7 * s.length + 14));
      let tw = 0;
      for (let i = 0; i < widths.length; i++) {
        tw += widths[i]! + (i > 0 ? 6 : 0);
      }
      let cursor = p[0] - tw / 2;
      const by = p[1] - 48;
      for (let si = 0; si < structs.length; si++) {
        const structure = structs[si]!;
        const width = widths[si]!;
        out.push(
          <g key={`st-${id}-${si}-${structure}`}>
            <rect
              x={cursor}
              y={by}
              width={width}
              height={16}
              rx={8}
              fill="#e4c36a"
              stroke="#111"
              opacity={0.98}
            />
            <text
              x={cursor + width / 2}
              y={by + 11}
              fill="#111"
              fontSize={9}
              fontWeight="bold"
              textAnchor="middle"
            >
              {structure}
            </text>
          </g>,
        );
        cursor += width + 6;
      }
    }

    if (out.length === 0) return null;
    return <g className="v2-map-glyphs">{out}</g>;
  }, [view, layout, regionIds]);

  if (!regionIds.length || !layout) {
    return (
      <div className="v2-map-stack">
        <p className="muted" style={{ padding: 12 }}>
          {regionIds.length === 0
            ? "No regions in view."
            : "Unknown map layout for these region ids."}
        </p>
      </div>
    );
  }

  const { ox, oy, w, h } = bounds;

  return (
    <div className="v2-map-stack">
      <div className="v2-map-toolbar" role="toolbar" aria-label="Map zoom" id={toolbarId}>
        <button
          type="button"
          className="v2-map-tool"
          aria-label="Zoom in"
          onClick={() => zoomAtScreenCenter(WHEEL_FACTOR)}
        >
          +
        </button>
        <button
          type="button"
          className="v2-map-tool"
          aria-label="Zoom out"
          onClick={() => zoomAtScreenCenter(1 / WHEEL_FACTOR)}
        >
          −
        </button>
        <button type="button" className="v2-map-tool" aria-label="Reset view" onClick={resetView}>
          Fit
        </button>
        <span className="v2-map-hint" aria-hidden="true">
          +/− zoom · drag to pan · double-click Fit
        </span>
      </div>
      <div
        className={`v2-map-wrap ${panning ? "v2-map-panning" : ""}`}
        style={{ touchAction: "none" }}
      >
        <svg
          ref={svgRef}
          className="v2-map-svg"
          viewBox={viewBoxStr}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Spectator map — all regions visible, no fog of war. Garrison tiers are exact. Trail labels show travel time in ticks."
        >
          <rect
            x={ox}
            y={oy}
            width={w}
            height={h}
            className="v2-map-pan-layer"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={(e) => {
              e.preventDefault();
              resetView();
            }}
          />
          {trailEdges.map(({ a, b, key, baseLengthTicks: ticks }) => {
            const pa = layout[a];
            const pb = layout[b];
            if (!pa || !pb) return null;
            const dx = pb[0] - pa[0];
            const dy = pb[1] - pa[1];
            const len = Math.hypot(dx, dy) || 1;
            const lox = (-dy / len) * 20;
            const loy = (dx / len) * 20;
            const mx = (pa[0] + pb[0]) / 2 + lox;
            const my = (pa[1] + pb[1]) / 2 + loy;
            return (
              <g key={key}>
                <line
                  x1={pa[0]}
                  y1={pa[1]}
                  x2={pb[0]}
                  y2={pb[1]}
                  className="v2-trail"
                />
                <g>
                  <title>Trail travel time (ticks), not combat tier</title>
                  <rect x={mx - 12} y={my - 10} width={24} height={18} rx={4} fill="#111" stroke="#777" />
                  <text
                    x={mx}
                    y={my + 3}
                    textAnchor="middle"
                    className="v2-map-trail-time"
                  >
                    {ticks}t
                  </text>
                </g>
              </g>
            );
          })}
          {regionIds.map((id) => {
            const p = layout[id];
            const r = view.regions[id] as Region;
            if (!p || !r) return null;
            const sel = selectedRegionId === id;
            const short = regionShortName(id);
            const tc = TERRAIN_CLASS[r.type] ?? "terrain-plains";
            const garrison = garrisonByRegion.get(id);
            const regionTitle = garrison
              ? `${short} — ${garrison.owner} garrison, tier ${garrison.tier}`
              : short;
            return (
              <g key={id}>
                <title>{regionTitle}</title>
                <circle
                  cx={p[0]}
                  cy={p[1]}
                  r={42}
                  className={`v2-node ${tc} ${tribeClass(r.owner)} ${sel ? "selected" : ""}`}
                  onClick={() => onSelectRegion(sel ? null : id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectRegion(sel ? null : id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-pressed={sel}
                />
                <text
                  x={p[0]}
                  y={p[1] + 58}
                  textAnchor="middle"
                  className="v2-map-label"
                >
                  {short.length > 14 ? `${short.slice(0, 12)}…` : short}
                </text>
              </g>
            );
          })}
          {glyphSvg}
          {overlayChildren}
          {regionIds.map((id) => {
            const p = layout[id];
            if (!p) return null;
            const garrison = garrisonByRegion.get(id);
            if (!garrison) return null;
            return (
              <text
                key={`garrison-tier-${id}`}
                x={p[0]}
                y={p[1] + 6}
                textAnchor="middle"
                className="v2-map-garrison-tier"
                pointerEvents="none"
              >
                T{garrison.tier}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
