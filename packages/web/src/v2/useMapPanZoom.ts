import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

const MIN_ZOOM = 0.45;
const MAX_ZOOM = 8;
const WHEEL_FACTOR = 1.12;

/** Match largest decorative radius around a region (vis glow 48, watchtower ring 52). */
const REGION_EXTENT_R = 52;
/** Text / labels + trail-time pills below/above nodes (px beyond region center / extent). */
const LABEL_BELOW_STACK = 72;
const LABEL_TOP_MARGIN = 28;

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
  let ncx = cx;
  let ncy = cy;
  if (vw <= bw + 1e-6) {
    // Tight [ox, ox+bw] so the viewport can never sit "inside" the world and clip an edge
    // (positive slack on max was letting vx > ox when zoomed in, cutting off the left/top).
    const minCx = ox + vw / 2;
    const maxCx = ox + bw - vw / 2;
    ncx = Math.min(maxCx, Math.max(minCx, cx));
  } else {
    ncx = ox + bw / 2;
  }
  if (vh <= bh + 1e-6) {
    const minCy = oy + vh / 2;
    const maxCy = oy + bh - vh / 2;
    ncy = Math.min(maxCy, Math.max(minCy, cy));
  } else {
    ncy = oy + bh / 2;
  }
  return { cx: ncx, cy: ncy };
}

export interface UseMapPanZoomOptions {
  regionIds: string[];
  layout: Record<string, readonly [number, number]>;
}

export interface MapBounds {
  ox: number;
  oy: number;
  w: number;
  h: number;
}

export interface UseMapPanZoomReturn {
  svgRef: React.RefObject<SVGSVGElement>;
  viewBoxStr: string;
  bounds: MapBounds;
  panning: boolean;
  toolbarId: string;
  zoomAtScreenCenter: (factor: number) => void;
  resetView: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  WHEEL_FACTOR: number;
}

export function useMapPanZoom({
  regionIds: ids,
  layout,
}: UseMapPanZoomOptions): UseMapPanZoomReturn {
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
    const minXe = minX - REGION_EXTENT_R;
    const maxXe = maxX + REGION_EXTENT_R;
    const minYe = minY - REGION_EXTENT_R - LABEL_TOP_MARGIN;
    const maxYe = maxY + LABEL_BELOW_STACK;
    const padX = 72;
    const padTop = 36;
    const padBottom = 36;
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

  const svgRef = useRef<SVGSVGElement | null>(null) as React.RefObject<SVGSVGElement>;
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

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
      panDragRef.current = { lastX: e.clientX, lastY: e.clientY };
      setPanning(true);
    },
    [],
  );

  const onPointerMove = useCallback(
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

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    try {
      (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    panDragRef.current = null;
    setPanning(false);
  }, []);

  return {
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
  };
}
