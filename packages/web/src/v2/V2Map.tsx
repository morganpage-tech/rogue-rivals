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
import { useMemo } from "react";
import { REPLAY_TRIBE_STROKE } from "../replay/replayTheme.js";
import { CONTINENT_6P_REGION_LAYOUT, CONTINENT_6P_TRAILS } from "./mapData.js";
import { regionShortName } from "./formatV2.js";
import { useMapPanZoom } from "./useMapPanZoom.js";

const TERRAIN_CLASS: Record<string, string> = {
  plains: "terrain-plains",
  mountains: "terrain-mountains",
  swamps: "terrain-swamps",
  desert: "terrain-desert",
  ruins: "terrain-ruins",
  forest: "terrain-forest",
  river_crossing: "terrain-river",
};

const WHEEL_FACTOR = 1.12;

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
  trailBaseTicks?: ReadonlyMap<string, number>;
  showUnitGlyphs?: boolean;
  glyphState?: V2MapGlyphState | null;
  overlayChildren?: ReactNode;
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
  } = useMapPanZoom({ regionIds: ids, layout });

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
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
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
            const lox = (-dy / len) * 20;
            const loy = (dx / len) * 20;
            const mx = (pa[0] + pb[0]) / 2 + lox;
            const my = (pa[1] + pb[1]) / 2 + loy;
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
