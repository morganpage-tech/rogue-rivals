import type {
  Region,
  SpectatorForce,
  SpectatorView,
} from "@rr/shared";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { getSpectatorMapLayout } from "../replay/spectatorMapLayout.js";
import {
  TERRAIN_CLASS,
  regionProduction,
} from "../v2/mapConstants.js";
import {
  VictoryOverlay,
  renderCaravanBadge,
  renderEmptyGarrisonCircle,
  renderGarrisonTierText,
  renderProductionLabel,
  renderScoutBadge,
  renderStructureBadges,
  renderTerrainLabel,
  renderTrailTimeLabel,
  renderTribeNameLabel,
  trailEdgeKey,
  transitMidpoint,
  tribeClass,
  tribeStrokeHex,
} from "../v2/mapSvgHelpers.js";
import type { VictoryProgressData } from "../v2/mapSvgHelpers.js";
import {
  estimateTransitBadgeWidth,
  regionDisplayName,
  tribeLabel,
  transitToDestinationBadge,
} from "../v2/formatV2.js";
import { useMapPanZoom } from "../v2/useMapPanZoom.js";

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
    WHEEL_FACTOR: wheelFactor,
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
      const key = trailEdgeKey(t.a, t.b);
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

  const roadEdges = useMemo(() => {
    if (!layout) return new Set<string>();
    const set = new Set<string>();
    for (const id of regionIds) {
      const r = view.regions[id] as Region | undefined;
      if (!r) continue;
      for (const target of Object.values(r.roadTargets)) {
        set.add(trailEdgeKey(id, target));
      }
    }
    return set;
  }, [regionIds, view.regions, layout]);

  const pactSets = useMemo(() => {
    const napPairs = new Map<string, string>();
    const svPairs = new Map<string, string>();
    const warPairs = new Map<string, string>();
    for (const p of view.pacts) {
      const key = trailEdgeKey(p.parties[0], p.parties[1]);
      if (p.kind === "nap") napPairs.set(key, "nap");
      else if (p.kind === "shared_vision") svPairs.set(key, "sv");
      else if (p.kind === "war") warPairs.set(key, "war");
    }
    return { napPairs, svPairs, warPairs };
  }, [view.pacts]);

  const totalIncome = useMemo(() => {
    let total = 0;
    for (const id of regionIds) {
      const r = view.regions[id];
      if (r) total += regionProduction(r);
    }
    return total;
  }, [regionIds, view.regions]);

  const victoryProgress: VictoryProgressData = useMemo(() => {
    const totalRegions = regionIds.length;
    let ownedCount = 0;
    let shrineCount = 0;
    let ownedIncome = 0;
    for (const id of regionIds) {
      const r = view.regions[id] as Region;
      if (r.owner) {
        ownedCount++;
        ownedIncome += regionProduction(r);
        for (const s of r.structures) {
          if (s === "shrine") shrineCount++;
        }
      }
    }
    const napCount = view.pacts.filter(p => p.kind === "nap").length;
    const aliveOthers = view.tribesAlive.length;
    return {
      regionsOwned: ownedCount,
      totalRegions,
      income: ownedIncome,
      totalVisibleIncome: totalIncome,
      shrines: shrineCount,
      naps: napCount,
      aliveOthers,
    };
  }, [regionIds, view.regions, view.pacts, view.tribesAlive, totalIncome]);

  const glyphSvg = useMemo(() => {
    if (!layout) return null;
    const L = layout;
    const out: ReactNode[] = [];

    for (const t of view.transits) {
      const mid = transitMidpoint(t.directionFrom, t.directionTo, L);
      if (!mid) continue;
      const [cx, cy] = mid;
      const fullTo = regionDisplayName(t.directionTo);
      let pillLabel = transitToDestinationBadge(t.directionTo, t.tier, t.ticksRemaining);
      if (pillLabel.length > 36) {
        pillLabel = `T${t.tier} → ${fullTo.slice(0, 9)}… · ${t.ticksRemaining}t`;
      }
      const pillW = estimateTransitBadgeWidth(pillLabel);
      out.push(
        <g key={`tr-${t.forceId}`}>
          <title>
            {`${tribeLabel(t.owner)} — tier ${t.tier}, ${t.ticksRemaining} ticks to ${fullTo}`}
          </title>
          <rect
            x={cx - pillW / 2}
            y={cy - 10}
            width={pillW}
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
            {pillLabel}
          </text>
        </g>,
      );
    }

    for (const s of view.scouts) {
      if (s.location.kind !== "arrived") continue;
      const p = L[s.location.regionId];
      if (!p) continue;
      out.push(renderScoutBadge(`sc-${s.id}`, p, s.owner));
    }

    for (const c of view.caravans) {
      const idx = Math.min(c.currentIndex, c.path.length - 1);
      const rid = c.path[idx];
      if (!rid) continue;
      const p = L[rid];
      if (!p) continue;
      out.push(renderCaravanBadge(`cv-${c.id}`, p, c.amountInfluence));
    }

    for (const id of regionIds) {
      const p = L[id];
      const r = view.regions[id] as Region | undefined;
      if (!p || !r?.structures?.length) continue;
      out.push(...renderStructureBadges(id, p, r.structures));
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
          onClick={() => zoomAtScreenCenter(wheelFactor)}
        >
          +
        </button>
        <button
          type="button"
          className="v2-map-tool"
          aria-label="Zoom out"
          onClick={() => zoomAtScreenCenter(1 / wheelFactor)}
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
            x={ox - 10000}
            y={oy - 10000}
            width={w + 20000}
            height={h + 20000}
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
            const isRoad = roadEdges.has(key);
            let pactKind: string | null = null;
            if (pactSets.warPairs.has(key)) pactKind = "war";
            else if (pactSets.svPairs.has(key)) pactKind = "sv";
            else if (pactSets.napPairs.has(key)) pactKind = "nap";
            const plox = (-dy / len) * 6;
            const ploy = (dx / len) * 6;
            return (
              <g key={key}>
                <line
                  x1={pa[0]}
                  y1={pa[1]}
                  x2={pb[0]}
                  y2={pb[1]}
                  className={`v2-trail${isRoad ? " v2-trail-road" : ""}`}
                />
                {pactKind && (
                  <line
                    x1={pa[0] + plox}
                    y1={pa[1] + ploy}
                    x2={pb[0] + plox}
                    y2={pb[1] + ploy}
                    className={`v2-trail-pact v2-trail-pact-${pactKind}`}
                    pointerEvents="none"
                  />
                )}
                {renderTrailTimeLabel(mx, my, ticks)}
              </g>
            );
          })}
          {regionIds.map((id) => {
            const p = layout[id];
            const r = view.regions[id] as Region;
            if (!p || !r) return null;
            const sel = selectedRegionId === id;
            const short = regionDisplayName(id);
            const tc = TERRAIN_CLASS[r.type] ?? "terrain-plains";
            const prod = regionProduction(r);
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
                {renderTerrainLabel(p, r)}
                {r.owner && renderTribeNameLabel(p, r.owner)}
                {renderProductionLabel(p, prod)}
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
            return renderGarrisonTierText(id, p, garrison.tier);
          })}
          {regionIds.map((id) => {
            const p = layout[id];
            if (!p) return null;
            if (garrisonByRegion.has(id)) return null;
            const r = view.regions[id] as Region | undefined;
            if (!r?.owner) return null;
            return renderEmptyGarrisonCircle(id, p);
          })}
        </svg>
        <VictoryOverlay progress={victoryProgress} />
      </div>
    </div>
  );
}
