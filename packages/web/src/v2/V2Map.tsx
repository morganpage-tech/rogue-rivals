import type {
  Caravan,
  Force,
  ProjectedView,
  Region,
  Scout,
  Tribe,
  VisibleScout,
  VisibleTransit,
} from "@rr/shared";
import type { ReactNode } from "react";
import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { REPLAY_TRIBE_STROKE } from "../replay/replayTheme.js";
import { CONTINENT_6P_REGION_LAYOUT, CONTINENT_6P_TRAILS } from "./mapData.js";
import { regionShortName } from "./formatV2.js";

const TERRAIN_CLASS: Record<string, string> = {
  plains: "terrain-plains",
  mountains: "terrain-mountains",
  swamps: "terrain-swamps",
  desert: "terrain-desert",
  ruins: "terrain-ruins",
  forest: "terrain-forest",
  river_crossing: "terrain-river",
};

const MIN_ZOOM = 0.45;
const MAX_ZOOM = 8;
const WHEEL_FACTOR = 1.12;

/** Match SVG circles (`r={42}`) and labels (`y = cy + 58`, ~11px font). */
const NODE_R = 42;
const LABEL_BELOW_CENTER = 58 + 18;

function tribeClass(owner: Tribe | null): string {
  if (!owner) return "";
  return `owner-${owner}`;
}

function trailEdgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
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

export interface V2MapGlyphState {
  readonly forces: readonly Force[];
  readonly scouts: readonly Scout[];
  readonly caravans: readonly Caravan[];
}

/** Garrison tier labels: live/fog uses `view.myForces`; omniscient replay uses full `glyphState.forces`. */
function garrisonForceForRegion(
  regionId: string,
  view: ProjectedView,
  glyphState: V2MapGlyphState | null,
): Force | undefined {
  if (glyphState) {
    return glyphState.forces.find(
      (f) => f.location.kind === "garrison" && f.location.regionId === regionId,
    );
  }
  return view.myForces.find(
    (f) => f.location.kind === "garrison" && f.location.regionId === regionId,
  );
}

interface V2MapProps {
  view: ProjectedView;
  selectedRegionId: string | null;
  onSelectRegion: (id: string | null) => void;
  /** `${regionA}|${regionB}` sorted lexicographically → base trail length in ticks */
  trailBaseTicks?: ReadonlyMap<string, number>;
  /** Draw scouts, transits, caravans, and structure/garrison badges (live + replay). */
  showUnitGlyphs?: boolean;
  /** When set (e.g. omniscient replay), draw glyphs from full state instead of fog view. */
  glyphState?: V2MapGlyphState | null;
  /** Extra SVG content (e.g. replay resolution overlays). Rendered above regions, below glyphs. */
  overlayChildren?: ReactNode;
}

/** Clamp view center so the viewBox stays near the authored bounds (with slack for labels). */
function clampCenter(
  cx: number,
  cy: number,
  zoom: number,
  ox: number,
  oy: number,
  bw: number,
  bh: number,
): { cx: number; cy: number } {
  const vw = bw / zoom;
  const vh = bh / zoom;
  const slack = 140;
  let ncx = cx;
  let ncy = cy;
  if (vw <= bw + 1e-6) {
    const minCx = ox + vw / 2 - slack;
    const maxCx = ox + bw - vw / 2 + slack;
    ncx = Math.min(maxCx, Math.max(minCx, cx));
  } else {
    ncx = ox + bw / 2;
  }
  if (vh <= bh + 1e-6) {
    const minCy = oy + vh / 2 - slack;
    const maxCy = oy + bh - vh / 2 + slack;
    ncy = Math.min(maxCy, Math.max(minCy, cy));
  } else {
    ncy = oy + bh / 2;
  }
  return { cx: ncx, cy: ncy };
}

export function V2Map({
  view,
  selectedRegionId,
  onSelectRegion,
  trailBaseTicks,
  showUnitGlyphs = false,
  glyphState = null,
  overlayChildren = null,
}: V2MapProps) {
  const ids = Object.keys(view.visibleRegions);
  const layout = CONTINENT_6P_REGION_LAYOUT;
  const toolbarId = useId();

  const bounds = useMemo(() => {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const id of ids) {
      const p = layout[id];
      if (!p) continue;
      minX = Math.min(minX, p[0]);
      minY = Math.min(minY, p[1]);
      maxX = Math.max(maxX, p[0]);
      maxY = Math.max(maxY, p[1]);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
      return { ox: 0, oy: 0, w: 400, h: 400 };
    }
    // Bounds from full ink: circles + labels, not just node centers (prevents Fit from
    // framing tight on centers and clipping names at the bottom).
    const minXe = minX - NODE_R;
    const maxXe = maxX + NODE_R;
    const minYe = minY - NODE_R;
    const maxYe = maxY + LABEL_BELOW_CENTER;
    const padX = 48;
    const padTop = 32;
    const padBottom = 32;
    const w = maxXe - minXe + padX * 2;
    const h = maxYe - minYe + padTop + padBottom;
    const ox = minXe - padX;
    const oy = minYe - padTop;
    return { ox, oy, w, h };
  }, [ids, layout]);

  const idsKey = useMemo(() => [...ids].sort().join(","), [ids]);

  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState(() => ({
    cx: bounds.ox + bounds.w / 2,
    cy: bounds.oy + bounds.h / 2,
  }));
  const [panning, setPanning] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef(zoom);
  const centerRef = useRef(center);
  const boundsRef = useRef(bounds);
  zoomRef.current = zoom;
  centerRef.current = center;
  boundsRef.current = bounds;

  const panDragRef = useRef<{
    lastX: number;
    lastY: number;
  } | null>(null);

  useEffect(() => {
    const { ox, oy, w, h } = bounds;
    const c = clampCenter(ox + w / 2, oy + h / 2, 1, ox, oy, w, h);
    setZoom(1);
    setCenter(c);
  }, [idsKey, bounds.ox, bounds.oy, bounds.w, bounds.h]);

  const viewW = bounds.w / zoom;
  const viewH = bounds.h / zoom;
  const vx = center.cx - viewW / 2;
  const vy = center.cy - viewH / 2;
  const viewBoxStr = `${vx} ${vy} ${viewW} ${viewH}`;

  const clientToContent = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const x = vb.x + ((clientX - rect.left) / rect.width) * vb.width;
      const y = vb.y + ((clientY - rect.top) / rect.height) * vb.height;
      return { x, y };
    },
    [],
  );

  const zoomAtScreenCenter = useCallback(
    (factor: number) => {
      const b = boundsRef.current;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const pt = clientToContent(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      if (!pt) return;

      let newZoom = zoomRef.current * factor;
      newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));

      const oldVw = b.w / zoomRef.current;
      const oldVh = b.h / zoomRef.current;
      const oldVx = centerRef.current.cx - oldVw / 2;
      const oldVy = centerRef.current.cy - oldVh / 2;

      const newVw = b.w / newZoom;
      const newVh = b.h / newZoom;
      const newVx = pt.x - (pt.x - oldVx) * (newVw / oldVw);
      const newVy = pt.y - (pt.y - oldVy) * (newVh / oldVh);
      let ncx = newVx + newVw / 2;
      let ncy = newVy + newVh / 2;
      const c = clampCenter(ncx, ncy, newZoom, b.ox, b.oy, b.w, b.h);
      setZoom(newZoom);
      setCenter({ cx: c.cx, cy: c.cy });
    },
    [clientToContent],
  );

  const resetView = useCallback(() => {
    const b = boundsRef.current;
    const c = clampCenter(b.ox + b.w / 2, b.oy + b.h / 2, 1, b.ox, b.oy, b.w, b.h);
    setZoom(1);
    setCenter(c);
  }, []);

  const onPointerDownPan = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
      panDragRef.current = { lastX: e.clientX, lastY: e.clientY };
      setPanning(true);
    },
    [],
  );

  const onPointerMovePan = useCallback(
    (e: React.PointerEvent) => {
      const drag = panDragRef.current;
      if (!drag) return;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const dx = e.clientX - drag.lastX;
      const dy = e.clientY - drag.lastY;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      const dcx = -(dx / rect.width) * vb.width;
      const dcy = -(dy / rect.height) * vb.height;
      const b = boundsRef.current;
      const c = clampCenter(
        centerRef.current.cx + dcx,
        centerRef.current.cy + dcy,
        zoomRef.current,
        b.ox,
        b.oy,
        b.w,
        b.h,
      );
      setCenter(c);
    },
    [],
  );

  const onPointerUpPan = useCallback((e: React.PointerEvent) => {
    try {
      (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    panDragRef.current = null;
    setPanning(false);
  }, []);

  const trails = CONTINENT_6P_TRAILS.filter(
    ([a, b]) => ids.includes(a) && ids.includes(b),
  );

  const glyphSvg = useMemo(() => {
    if (!showUnitGlyphs && !glyphState) return null;
    const L = CONTINENT_6P_REGION_LAYOUT;
    const out: ReactNode[] = [];

    const visibleForceByRegion = new Map<string, (typeof view.visibleForces)[0]>();
    for (const vf of view.visibleForces) {
      visibleForceByRegion.set(vf.regionId, vf);
    }

    const forces = glyphState
      ? [...glyphState.forces]
      : view.myForces.filter((f) => f.location.kind === "transit");
    for (const f of forces) {
      if (f.location.kind !== "transit") continue;
      const mid = transitMidpoint(
        f.location.directionFrom,
        f.location.directionTo,
        L,
      );
      if (!mid) continue;
      const [cx, cy] = mid;
      const label = `${f.owner.slice(0, 2).toUpperCase()} T${f.tier} → ${regionShortName(f.location.directionTo)} (${f.location.ticksRemaining})`;
      out.push(
        <g key={`ft-${f.id}`}>
          <title>
            {f.owner === view.forTribe
              ? `Your army — tier ${f.tier}, ${f.location.ticksRemaining} ticks to arrival`
              : `Enemy transit — ${f.owner}`}
          </title>
          <rect
            x={cx - 34}
            y={cy - 10}
            width={68}
            height={20}
            rx={8}
            fill={tribeStrokeHex(f.owner)}
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

    const transits: VisibleTransit[] = glyphState ? [] : [...view.visibleTransits];
    for (const vt of transits) {
      const mid = transitMidpoint(vt.directionFrom, vt.directionTo, L);
      if (!mid) continue;
      const [cx, cy] = mid;
      const ft = vt.fuzzyTier.replace(/_/g, " ");
      out.push(
        <g key={`vt-${vt.trailIndex}-${vt.directionFrom}-${vt.directionTo}`}>
          <rect
            x={cx - 38}
            y={cy - 10}
            width={76}
            height={20}
            rx={8}
            fill={tribeStrokeHex(vt.owner)}
            stroke="#111"
            opacity={0.9}
          />
          <text
            x={cx}
            y={cy + 4}
            fill="#fff"
            fontSize={8}
            fontWeight="bold"
            textAnchor="middle"
          >
            {`${vt.owner.slice(0, 2).toUpperCase()} ${ft}`}
          </text>
        </g>,
      );
    }

    const scoutsSrc: Scout[] = glyphState
      ? glyphState.scouts.filter((s) => s.location.kind === "arrived")
      : view.myScouts.filter((s) => s.location.kind === "arrived");
    const visibleScouts: VisibleScout[] = glyphState ? [] : [...view.visibleScouts];
    for (const s of scoutsSrc) {
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
    for (const vs of visibleScouts) {
      const p = L[vs.regionId];
      if (!p) continue;
      const cx = p[0] - 30;
      const cy = p[1] + 28;
      out.push(
        <g key={`vsc-${vs.regionId}-${vs.owner}`}>
          <circle
            cx={cx}
            cy={cy}
            r={10}
            fill="#111"
            stroke={tribeStrokeHex(vs.owner)}
            strokeWidth={2}
            opacity={0.9}
          />
          <text x={cx} y={cy + 4} fill="#fff" fontSize={9} fontWeight="bold" textAnchor="middle">
            S
          </text>
        </g>,
      );
    }

    const caravans: Caravan[] = glyphState ? [...glyphState.caravans] : [...view.myCaravans];
    for (const c of caravans) {
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

    if (showUnitGlyphs || glyphState) {
      for (const id of ids) {
        const p = L[id];
        const r = view.visibleRegions[id] as Region | undefined;
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
    }

    if (showUnitGlyphs || glyphState) {
      for (const id of ids) {
        const p = L[id];
        const r = view.visibleRegions[id] as Region | undefined;
        if (!p || !r) continue;
        const cx = p[0];
        const cy = p[1];
        const myG = garrisonForceForRegion(id, view, glyphState);
        if (!myG) {
          const vf = visibleForceByRegion.get(id);
          if (vf) {
            const ft = vf.fuzzyTier.replace(/_/g, " ");
            out.push(
              <g key={`vf-${id}`}>
                <rect
                  x={cx + 8}
                  y={cy + 18}
                  width={40}
                  height={18}
                  rx={6}
                  fill={tribeStrokeHex(vf.owner)}
                  stroke="#111"
                />
                <text
                  x={cx + 28}
                  y={cy + 31}
                  fill="#fff"
                  fontSize={8}
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {ft.length > 12 ? `${ft.slice(0, 10)}…` : ft}
                </text>
              </g>,
            );
          }
        }
      }
    }

    if (out.length === 0) return null;
    return <g className="v2-map-glyphs">{out}</g>;
  }, [showUnitGlyphs, glyphState, view, ids]);

  const { ox, oy, w, h } = bounds;

  if (!ids.length) {
    return (
      <div className="v2-map-stack">
        <p className="muted" style={{ padding: 12 }}>
          No visible regions.
        </p>
      </div>
    );
  }

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
          aria-label="Territory map. Your garrison tier appears as T1–T4 in the center of regions you hold. Trail edge labels show travel time in ticks."
        >
          <rect
            x={ox}
            y={oy}
            width={w}
            height={h}
            className="v2-map-pan-layer"
            onPointerDown={onPointerDownPan}
            onPointerMove={onPointerMovePan}
            onPointerUp={onPointerUpPan}
            onPointerCancel={onPointerUpPan}
            onDoubleClick={(e) => {
              e.preventDefault();
              resetView();
            }}
          />
          {trails.map(([a, b], i) => {
            const pa = layout[a];
            const pb = layout[b];
            if (!pa || !pb) return null;
            const dx = pb[0] - pa[0];
            const dy = pb[1] - pa[1];
            const len = Math.hypot(dx, dy) || 1;
            const ox = (-dy / len) * 20;
            const oy = (dx / len) * 20;
            const mx = (pa[0] + pb[0]) / 2 + ox;
            const my = (pa[1] + pb[1]) / 2 + oy;
            const edgeKey = trailEdgeKey(a, b);
            const tickLabel = trailBaseTicks?.get(edgeKey);
            return (
              <g key={`${a}-${b}-${i}`}>
                <line
                  x1={pa[0]}
                  y1={pa[1]}
                  x2={pb[0]}
                  y2={pb[1]}
                  className="v2-trail"
                />
                {tickLabel != null && (
                  <g>
                    <title>Trail travel time (ticks), not combat tier</title>
                    <rect x={mx - 12} y={my - 10} width={24} height={18} rx={4} fill="#111" stroke="#777" />
                    <text
                      x={mx}
                      y={my + 3}
                      textAnchor="middle"
                      className="v2-map-trail-time"
                    >
                      {tickLabel}t
                    </text>
                  </g>
                )}
              </g>
            );
          })}
          {ids.map((id) => {
            const p = layout[id];
            const r = view.visibleRegions[id] as Region;
            if (!p || !r) return null;
            const sel = selectedRegionId === id;
            const short = regionShortName(id);
            const tc = TERRAIN_CLASS[r.type] ?? "terrain-plains";
            const myGarrison = showUnitGlyphs
              ? garrisonForceForRegion(id, view, glyphState)
              : undefined;
            const regionTitle =
              myGarrison && myGarrison.owner === view.forTribe
                ? `${short} — your garrison, tier ${myGarrison.tier}`
                : myGarrison
                  ? `${short} — ${myGarrison.owner} garrison, tier ${myGarrison.tier}`
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
          {/* Garrison tier last so transit/scout/structure glyphs never paint over it */}
          {showUnitGlyphs &&
            ids.map((id) => {
              const p = layout[id];
              if (!p) return null;
              const myG = garrisonForceForRegion(id, view, glyphState);
              if (!myG) return null;
              return (
                <text
                  key={`garrison-tier-${id}`}
                  x={p[0]}
                  y={p[1] + 6}
                  textAnchor="middle"
                  className="v2-map-garrison-tier"
                  pointerEvents="none"
                >
                  T{myG.tier}
                </text>
              );
            })}
        </svg>
      </div>
    </div>
  );
}
