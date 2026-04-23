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
import {
  CONTINENT_6P_ADJACENCY,
  CONTINENT_6P_REGION_LAYOUT,
  CONTINENT_6P_TRAILS,
} from "./mapData.js";
import {
  TERRAIN_CLASS,
  WHEEL_FACTOR,
  regionProduction,
} from "./mapConstants.js";
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
} from "./mapSvgHelpers.js";
import type { VictoryProgressData } from "./mapSvgHelpers.js";
import {
  estimateTransitBadgeWidth,
  regionDisplayName,
  tribeLabel,
  transitToDestinationBadge,
} from "./formatV2.js";
import { useMapPanZoom } from "./useMapPanZoom.js";

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

function visibleForceByRegionCheck(
  regionId: string,
  view: ProjectedView,
): boolean {
  return view.visibleForces.some((vf) => vf.regionId === regionId);
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

  const roadEdges = useMemo(() => {
    const set = new Set<string>();
    for (const id of ids) {
      const r = view.visibleRegions[id] as Region | undefined;
      if (!r) continue;
      for (const target of Object.values(r.roadTargets)) {
        set.add(trailEdgeKey(id, target));
      }
    }
    return set;
  }, [ids, view.visibleRegions]);

  const pactSets = useMemo(() => {
    const nap = new Set<Tribe>();
    const sv = new Set<Tribe>();
    const war = new Set<Tribe>();
    for (const p of view.pactsInvolvingMe) {
      const partner = p.parties[0] === view.forTribe ? p.parties[1] : p.parties[0];
      if (p.kind === "nap") nap.add(partner);
      else if (p.kind === "shared_vision") sv.add(partner);
      else if (p.kind === "war") war.add(partner);
    }
    return { napPartners: nap, sharedVisionPartners: sv, warTargets: war };
  }, [view.pactsInvolvingMe, view.forTribe]);

  const visibilitySource = useMemo(() => {
    const src = new Map<string, string>();
    const owned = new Set<string>();
    for (const id of ids) {
      if ((view.visibleRegions[id] as Region)?.owner === view.forTribe) owned.add(id);
    }
    for (const id of owned) src.set(id, "own");
    const adjacentToOwned = new Set<string>();
    for (const id of owned) {
      for (const nb of CONTINENT_6P_ADJACENCY.get(id) ?? []) {
        if (!owned.has(nb) && ids.includes(nb)) adjacentToOwned.add(nb);
      }
    }
    for (const id of adjacentToOwned) src.set(id, "adjacent");
    for (const s of view.myScouts) {
      if (s.location.kind === "arrived" && !src.has(s.location.regionId)) {
        src.set(s.location.regionId, "scout");
      }
    }
    const towerRange = new Set<string>();
    for (const id of owned) {
      const r = view.visibleRegions[id] as Region | undefined;
      if (!r?.structures.includes("watchtower")) continue;
      for (const nb of CONTINENT_6P_ADJACENCY.get(id) ?? []) {
        for (const nb2 of CONTINENT_6P_ADJACENCY.get(nb) ?? []) {
          if (!owned.has(nb2) && !adjacentToOwned.has(nb2) && ids.includes(nb2)) {
            towerRange.add(nb2);
          }
        }
      }
    }
    for (const id of towerRange) src.set(id, "tower");
    if (pactSets.sharedVisionPartners.size > 0) {
      for (const id of ids) {
        if (!src.has(id)) src.set(id, "shared");
      }
    }
    return src;
  }, [ids, view.visibleRegions, view.forTribe, view.myScouts, pactSets.sharedVisionPartners]);

  const watchtowerRangeIds = useMemo(() => {
    const out = new Set<string>();
    for (const id of ids) {
      const r = view.visibleRegions[id] as Region | undefined;
      if (r?.owner !== view.forTribe) continue;
      if (!r.structures.includes("watchtower")) continue;
      for (const nb of CONTINENT_6P_ADJACENCY.get(id) ?? []) {
        for (const nb2 of CONTINENT_6P_ADJACENCY.get(nb) ?? []) {
          if (!ids.includes(nb2)) continue;
          const r2 = view.visibleRegions[nb2] as Region | undefined;
          if (r2?.owner !== view.forTribe) out.add(nb2);
        }
      }
    }
    return out;
  }, [ids, view.visibleRegions, view.forTribe]);

  const victoryProgress: VictoryProgressData = useMemo(() => {
    const totalRegions = Object.keys(CONTINENT_6P_REGION_LAYOUT).length;
    let ownedCount = 0;
    let shrineCount = 0;
    let ownedIncome = 0;
    let totalVisibleIncome = 0;
    for (const id of ids) {
      const r = view.visibleRegions[id] as Region;
      const prod = regionProduction(r);
      totalVisibleIncome += prod;
      if (r.owner === view.forTribe) {
        ownedCount++;
        ownedIncome += prod;
        for (const s of r.structures) {
          if (s === "shrine") shrineCount++;
        }
      }
    }
    const napCount = view.pactsInvolvingMe.filter(p => p.kind === "nap").length;
    const aliveOthers = view.tribesAlive.filter(t => t !== view.forTribe).length;
    return {
      regionsOwned: ownedCount,
      totalRegions,
      income: ownedIncome,
      totalVisibleIncome,
      shrines: shrineCount,
      naps: napCount,
      aliveOthers,
    };
  }, [ids, view.visibleRegions, view.forTribe, view.pactsInvolvingMe, view.tribesAlive]);

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
      const mid = transitMidpoint(f.location.directionFrom, f.location.directionTo, L);
      if (!mid) continue;
      const [cx, cy] = mid;
      const fullTo = regionDisplayName(f.location.directionTo);
      let pillLabel = transitToDestinationBadge(f.location.directionTo, f.tier, f.location.ticksRemaining);
      if (pillLabel.length > 36) {
        pillLabel = `T${f.tier} → ${fullTo.slice(0, 9)}… · ${f.location.ticksRemaining}t`;
      }
      const pillW = estimateTransitBadgeWidth(pillLabel);
      out.push(
        <g key={`ft-${f.id}`}>
          <title>
            {f.owner === view.forTribe
              ? `Your ${tribeLabel(f.owner)} army — tier ${f.tier}, ${f.location.ticksRemaining} ticks to ${fullTo}`
              : `${tribeLabel(f.owner)} army — tier ${f.tier}, ${f.location.ticksRemaining} ticks to ${fullTo}`}
          </title>
          <rect
            x={cx - pillW / 2}
            y={cy - 10}
            width={pillW}
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
            {pillLabel}
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
    for (const s of scoutsSrc) {
      if (s.location.kind !== "arrived") continue;
      const p = L[s.location.regionId];
      if (!p) continue;
      out.push(renderScoutBadge(`sc-${s.id}`, p, s.owner));
    }

    const visibleScouts: VisibleScout[] = glyphState ? [] : [...view.visibleScouts];
    for (const vs of visibleScouts) {
      const p = L[vs.regionId];
      if (!p) continue;
      out.push(renderScoutBadge(`vsc-${vs.regionId}-${vs.owner}`, p, vs.owner, 0.9));
    }

    const caravans: Caravan[] = glyphState ? [...glyphState.caravans] : [...view.myCaravans];
    for (const c of caravans) {
      const idx = Math.min(c.currentIndex, c.path.length - 1);
      const rid = c.path[idx];
      if (!rid) continue;
      const p = L[rid];
      if (!p) continue;
      out.push(renderCaravanBadge(`cv-${c.id}`, p, c.amountInfluence));
    }

    if (showUnitGlyphs || glyphState) {
      for (const id of ids) {
        const p = L[id];
        const r = view.visibleRegions[id] as Region | undefined;
        if (!p || !r?.structures?.length) continue;
        out.push(...renderStructureBadges(id, p, r.structures));
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
            const isRoad = roadEdges.has(edgeKey);
            const tickLabel = trailBaseTicks?.get(edgeKey);
            const rA = view.visibleRegions[a] as Region | undefined;
            const rB = view.visibleRegions[b] as Region | undefined;
            let pactKind: string | null = null;
            if (rA?.owner === view.forTribe && pactSets.warTargets.has(rB?.owner as Tribe)) pactKind = "war";
            else if (rB?.owner === view.forTribe && pactSets.warTargets.has(rA?.owner as Tribe)) pactKind = "war";
            else if (rA?.owner === view.forTribe && pactSets.sharedVisionPartners.has(rB?.owner as Tribe)) pactKind = "sv";
            else if (rB?.owner === view.forTribe && pactSets.sharedVisionPartners.has(rA?.owner as Tribe)) pactKind = "sv";
            else if (rA?.owner === view.forTribe && pactSets.napPartners.has(rB?.owner as Tribe)) pactKind = "nap";
            else if (rB?.owner === view.forTribe && pactSets.napPartners.has(rA?.owner as Tribe)) pactKind = "nap";
            const plox = (-dy / len) * 6;
            const ploy = (dx / len) * 6;
            return (
              <g key={`${a}-${b}-${i}`}>
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
                {tickLabel != null && renderTrailTimeLabel(mx, my, tickLabel)}
              </g>
            );
          })}
          {ids.map((id) => {
            const p = layout[id];
            const r = view.visibleRegions[id] as Region;
            if (!p || !r) return null;
            const sel = selectedRegionId === id;
            const short = regionDisplayName(id);
            const tc = TERRAIN_CLASS[r.type] ?? "terrain-plains";
            const prod = regionProduction(r);
            const visSrc = visibilitySource.get(id);
            const visGlowClass = visSrc && visSrc !== "own" ? `v2-vis-glow-${visSrc}` : "";
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
                {visGlowClass && (
                  <circle
                    cx={p[0]}
                    cy={p[1]}
                    r={48}
                    className={visGlowClass}
                    pointerEvents="none"
                  />
                )}
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
                {showUnitGlyphs && renderProductionLabel(p, prod)}
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
              return renderGarrisonTierText(id, p, myG.tier);
            })}
          {showUnitGlyphs &&
            ids.map((id) => {
              const p = layout[id];
              if (!p) return null;
              const myG = garrisonForceForRegion(id, view, glyphState);
              const hasVisibleEnemy = !myG && visibleForceByRegionCheck(id, view);
              if (myG || hasVisibleEnemy) return null;
              const r = view.visibleRegions[id] as Region | undefined;
              if (!r?.owner) return null;
              return renderEmptyGarrisonCircle(id, p);
            })}
          {showUnitGlyphs &&
            [...watchtowerRangeIds].map((id) => {
              const p = layout[id];
              if (!p) return null;
              return (
                <circle
                  key={`wt-range-${id}`}
                  cx={p[0]}
                  cy={p[1]}
                  r={52}
                  className="v2-map-watchtower-range"
                  pointerEvents="none"
                />
              );
            })}
        </svg>
        {showUnitGlyphs && <VictoryOverlay progress={victoryProgress} />}
      </div>
    </div>
  );
}
