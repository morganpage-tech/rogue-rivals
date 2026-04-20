/**
 * Minimal schematic map: region nodes by layout, colored by owner from replay state.
 * Full overlay parity lives in tools/v2/replay HTML.
 */

import type { ReplayFrame } from "./types.js";
import { REPLAY_TRIBE_STROKE } from "./replayTheme.js";

interface ReplayMapStubProps {
  frame: ReplayFrame;
  layout: Record<string, readonly [number, number]>;
}

function tribeColor(tribe: string | null | undefined): string {
  if (!tribe) return "#444";
  return REPLAY_TRIBE_STROKE[tribe] ?? "#888";
}

export function ReplayMapStub({ frame, layout }: ReplayMapStubProps) {
  const state = frame.state as Record<string, unknown> | null;
  const regions = (state?.regions as Record<string, { owner?: string | null }> | undefined) ?? {};
  const ids = Object.keys(layout);
  if (ids.length === 0) {
    return <p className="muted">No layout in payload.</p>;
  }

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
  const pad = 80;
  const w = maxX - minX + pad * 2;
  const h = maxY - minY + pad * 2;
  const tx = (x: number) => x - minX + pad;
  const ty = (y: number) => y - minY + pad;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="replay-map-stub"
      style={{ width: "100%", maxHeight: 420, background: "#1a1a1a" }}
    >
      {ids.map((id) => {
        const p = layout[id];
        if (!p) return null;
        const r = regions[id];
        const owner = r?.owner ?? null;
        const cx = tx(p[0]);
        const cy = ty(p[1]);
        return (
          <g key={id}>
            <circle
              cx={cx}
              cy={cy}
              r={28}
              fill="#2a2a2a"
              stroke={tribeColor(owner)}
              strokeWidth={3}
            />
            <text
              x={cx}
              y={cy + 4}
              textAnchor="middle"
              fill="#ccc"
              fontSize={8}
              fontFamily="monospace"
            >
              {id.replace(/^r_[a-z]{2,3}_/, "").slice(0, 10)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
