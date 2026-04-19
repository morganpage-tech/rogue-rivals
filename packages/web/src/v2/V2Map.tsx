import type { ProjectedView, Region, Tribe } from "@rr/engine2";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
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

interface V2MapProps {
  view: ProjectedView;
  selectedRegionId: string | null;
  onSelectRegion: (id: string | null) => void;
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

export function V2Map({ view, selectedRegionId, onSelectRegion }: V2MapProps) {
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
          +/− zoom · drag background to pan
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
          aria-label="Territory map (fog of war). Use the toolbar +/− buttons to zoom; drag the map background to pan."
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
          />
          {trails.map(([a, b], i) => {
            const pa = layout[a];
            const pb = layout[b];
            if (!pa || !pb) return null;
            return (
              <line
                key={`${a}-${b}-${i}`}
                x1={pa[0]}
                y1={pa[1]}
                x2={pb[0]}
                y2={pb[1]}
                className="v2-trail"
              />
            );
          })}
          {ids.map((id) => {
            const p = layout[id];
            const r = view.visibleRegions[id] as Region;
            if (!p || !r) return null;
            const sel = selectedRegionId === id;
            const short = regionShortName(id);
            const tc = TERRAIN_CLASS[r.type] ?? "terrain-plains";
            return (
              <g key={id}>
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
        </svg>
      </div>
    </div>
  );
}
