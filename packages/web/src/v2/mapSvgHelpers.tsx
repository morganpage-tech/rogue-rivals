import type { Region, Tribe } from "@rr/shared";
import type { ReactNode } from "react";
import { REPLAY_TRIBE_STROKE } from "../replay/replayTheme.js";
import {
  CULTURAL_SHRINE_REQUIREMENT,
  TERRAIN_DISPLAY,
  TERRITORIAL_DOMINANCE_FRACTION,
  ECONOMIC_SUPREMACY_FRACTION,
} from "./mapConstants.js";
import { tribeLabel } from "./formatV2.js";

export function tribeClass(owner: Tribe | null): string {
  if (!owner) return "";
  return `owner-${owner}`;
}

export function trailEdgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function tribeStrokeHex(tribe: Tribe): string {
  return REPLAY_TRIBE_STROKE[tribe] ?? "#888";
}

export function transitMidpoint(
  from: string,
  to: string,
  layout: Record<string, readonly [number, number]>,
): [number, number] | null {
  const a = layout[from];
  const b = layout[to];
  if (!a || !b) return null;
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

export function renderStructureBadges(
  regionId: string,
  p: readonly [number, number],
  structures: readonly string[],
): ReactNode[] {
  if (!structures.length) return [];
  const out: ReactNode[] = [];
  const widths = structures.map((s) => Math.max(28, 7 * s.length + 14));
  let tw = 0;
  for (let i = 0; i < widths.length; i++) {
    tw += widths[i]! + (i > 0 ? 6 : 0);
  }
  let cursor = p[0] - tw / 2;
  const by = p[1] - 48;
  for (let si = 0; si < structures.length; si++) {
    const structure = structures[si]!;
    const width = widths[si]!;
    out.push(
      <g key={`st-${regionId}-${si}-${structure}`}>
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
  return out;
}

export function renderScoutBadge(
  key: string,
  p: readonly [number, number],
  owner: Tribe,
  opacity = 1,
): ReactNode {
  const cx = p[0] - 30;
  const cy = p[1] + 28;
  return (
    <g key={key}>
      <circle
        cx={cx}
        cy={cy}
        r={10}
        fill="#111"
        stroke={tribeStrokeHex(owner)}
        strokeWidth={2}
        opacity={opacity < 1 ? opacity : undefined}
      />
      <text x={cx} y={cy + 4} fill="#fff" fontSize={9} fontWeight="bold" textAnchor="middle">
        S
      </text>
    </g>
  );
}

export function renderCaravanBadge(
  key: string,
  p: readonly [number, number],
  amount: number,
): ReactNode {
  const cx = p[0] + 30;
  const cy = p[1] - 30;
  return (
    <g key={key}>
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
        C{amount}
      </text>
    </g>
  );
}

export function renderGarrisonTierText(
  regionId: string,
  p: readonly [number, number],
  tier: number,
): ReactNode {
  return (
    <text
      key={`garrison-tier-${regionId}`}
      x={p[0]}
      y={p[1] + 6}
      textAnchor="middle"
      className="v2-map-garrison-tier"
      pointerEvents="none"
    >
      T{tier}
    </text>
  );
}

export function renderEmptyGarrisonCircle(
  regionId: string,
  p: readonly [number, number],
): ReactNode {
  return (
    <circle
      key={`garrison-empty-${regionId}`}
      cx={p[0]}
      cy={p[1]}
      r={8}
      className="v2-map-garrison-empty"
      pointerEvents="none"
    />
  );
}

export function renderTrailTimeLabel(mx: number, my: number, ticks: number): ReactNode {
  return (
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
  );
}

export function renderProductionLabel(
  p: readonly [number, number],
  production: number,
): ReactNode {
  return (
    <text
      x={p[0] + 32}
      y={p[1] - 32}
      textAnchor="middle"
      className="v2-map-production-label"
      pointerEvents="none"
    >
      +{production}
    </text>
  );
}

export function renderTerrainLabel(
  p: readonly [number, number],
  r: Region,
): ReactNode {
  return (
    <text
      x={p[0]}
      y={p[1] + 70}
      textAnchor="middle"
      className="v2-map-terrain-label"
    >
      {TERRAIN_DISPLAY[r.type] ?? r.type}
    </text>
  );
}

export function renderTribeNameLabel(
  p: readonly [number, number],
  owner: Tribe,
): ReactNode {
  return (
    <text
      x={p[0]}
      y={p[1] - 18}
      textAnchor="middle"
      className="v2-map-tribe-name"
    >
      {tribeLabel(owner)}
    </text>
  );
}

export interface VictoryProgressData {
  regionsOwned: number;
  totalRegions: number;
  income: number;
  totalVisibleIncome: number;
  shrines: number;
  naps: number;
  aliveOthers: number;
}

export function VictoryOverlay({ progress }: { progress: VictoryProgressData }): ReactNode {
  return (
    <div className="v2-map-victory-overlay">
      <div className="v2-victory-title">Victory Progress</div>
      <div className="v2-victory-row">
        <span className="v2-victory-label">Territory</span>
        <span className="v2-victory-bar">
          <span
            className="v2-victory-fill v2-victory-fill-territory"
            style={{ width: `${(progress.regionsOwned / progress.totalRegions) * 100}%` }}
          />
        </span>
        <span className="v2-victory-value">
          {progress.regionsOwned}/{progress.totalRegions} ({TERRITORIAL_DOMINANCE_FRACTION * 100}%)
        </span>
      </div>
      <div className="v2-victory-row">
        <span className="v2-victory-label">Economy</span>
        <span className="v2-victory-bar">
          <span
            className="v2-victory-fill v2-victory-fill-economy"
            style={{ width: `${progress.totalVisibleIncome > 0 ? (progress.income / progress.totalVisibleIncome) * 100 : 0}%` }}
          />
        </span>
        <span className="v2-victory-value">
          +{progress.income} ({ECONOMIC_SUPREMACY_FRACTION * 100}%)
        </span>
      </div>
      <div className="v2-victory-row">
        <span className="v2-victory-label">Shrines</span>
        <span className="v2-victory-bar">
          <span
            className="v2-victory-fill v2-victory-fill-culture"
            style={{ width: `${(progress.shrines / CULTURAL_SHRINE_REQUIREMENT) * 100}%` }}
          />
        </span>
        <span className="v2-victory-value">
          {progress.shrines}/{CULTURAL_SHRINE_REQUIREMENT}
        </span>
      </div>
      <div className="v2-victory-row">
        <span className="v2-victory-label">NAPs</span>
        <span className="v2-victory-bar">
          <span
            className="v2-victory-fill v2-victory-fill-diplo"
            style={{ width: `${progress.aliveOthers > 0 ? (progress.naps / progress.aliveOthers) * 100 : 0}%` }}
          />
        </span>
        <span className="v2-victory-value">
          {progress.naps}/{progress.aliveOthers}
        </span>
      </div>
    </div>
  );
}
