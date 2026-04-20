import { useMemo, useState } from "react";
import type { ReplayPayload } from "./types.js";
import { ReplayMapStub } from "./ReplayMapStub.js";

interface ReplayViewerProps {
  payload: ReplayPayload;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function ReplayViewer({ payload }: ReplayViewerProps) {
  const frames = payload.frames;
  const [frameIdx, setFrameIdx] = useState(0);
  const [perspective, setPerspective] = useState<string>("all");
  const [showStateJson, setShowStateJson] = useState(false);

  const frame = frames[frameIdx] ?? frames[0];
  const meta = payload.meta;

  const perspectiveView = useMemo(() => {
    if (!frame) return null;
    if (perspective === "all") return null;
    const pv = frame.projected_views[perspective];
    return pv ?? null;
  }, [frame, perspective]);

  if (!frame) {
    return <p className="muted">No frames.</p>;
  }

  const warnings = meta.warnings ?? [];

  return (
    <div className="replay-viewer card" style={{ marginTop: 12 }}>
      <h3>Replay / debug</h3>
      {warnings.length > 0 && (
        <div
          className="replay-warnings"
          style={{
            marginBottom: 10,
            padding: 10,
            border: "1px solid #6a4a12",
            borderRadius: 8,
            background: "#3a2a12",
            color: "#ffdca0",
            fontSize: 13,
          }}
        >
          {warnings.map((w, i) => (
            <div key={i}>{escapeHtml(w)}</div>
          ))}
        </div>
      )}

      <div className="row wrap" style={{ gap: 10, alignItems: "center", marginBottom: 12 }}>
        <label className="row" style={{ gap: 8, alignItems: "center" }}>
          Frame
          <input
            type="range"
            min={0}
            max={Math.max(0, frames.length - 1)}
            value={frameIdx}
            onChange={(e) => setFrameIdx(Number(e.target.value))}
            style={{ width: 200 }}
          />
          <span className="mono" style={{ fontSize: 12 }}>
            {frameIdx} / {frames.length - 1} · {frame.label}
          </span>
        </label>
        <button type="button" onClick={() => setFrameIdx((i) => Math.max(0, i - 1))}>
          Prev
        </button>
        <button
          type="button"
          onClick={() => setFrameIdx((i) => Math.min(frames.length - 1, i + 1))}
        >
          Next
        </button>
        <label className="row" style={{ gap: 6 }}>
          Perspective
          <select
            value={perspective}
            onChange={(e) => setPerspective(e.target.value)}
          >
            <option value="all">All (omniscient state map)</option>
            {(meta.roster ?? []).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="muted" style={{ fontSize: 12 }}>
        seed={meta.seed} map={meta.map_kind} tick_final={meta.tick_final}
      </p>

      <div className="replay-viewer-grid" style={{ display: "grid", gap: 12 }}>
        <div>
          <h4 style={{ margin: "0 0 8px", fontSize: 13 }}>Map (schematic)</h4>
          <ReplayMapStub frame={frame} layout={payload.layout} />
          <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
            For full overlays (moves, fails, combat), export HTML from{" "}
            <code className="mono">render_replay.py</code> or load JSON exported with{" "}
            <code className="mono">--json-out</code>.
          </p>
        </div>

        {perspective !== "all" && perspectiveView && (
          <div className="card" style={{ padding: 10 }}>
            <h4 style={{ margin: "0 0 8px", fontSize: 13 }}>
              Fog view ({perspective})
            </h4>
            <pre
              style={{
                fontSize: 10,
                overflow: "auto",
                maxHeight: 200,
                margin: 0,
                whiteSpace: "pre-wrap",
              }}
            >
              {JSON.stringify(perspectiveView, null, 2)}
            </pre>
          </div>
        )}

        <div>
          <h4 style={{ margin: "0 0 8px", fontSize: 13 }}>Orders</h4>
          <div className="replay-orders" style={{ fontSize: 12 }}>
            {Object.keys(frame.orders_by_tribe)
              .sort()
              .map((tribe) => {
                const pkt = frame.orders_by_tribe[tribe]!;
                const orders = pkt.orders ?? [];
                return (
                  <div key={tribe} style={{ marginBottom: 8 }}>
                    <strong style={{ color: `var(--tribe-${tribe}, #ccc)` }}>{tribe}</strong>
                    {orders.length === 0 ? (
                      <span className="muted"> pass</span>
                    ) : (
                      <ul style={{ margin: "4px 0 0 16px" }}>
                        {orders.map((o, i) => (
                          <li key={i}>
                            <span className="mono">{o.kind}</span>{" "}
                            <span className="muted">
                              {JSON.stringify(o.payload ?? {})}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        <div>
          <h4 style={{ margin: "0 0 8px", fontSize: 13 }}>Resolution events</h4>
          <ul className="replay-events" style={{ fontSize: 12, maxHeight: 220, overflow: "auto" }}>
            {(frame.resolution_events as { kind?: string }[]).map((ev, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                <span className="mono">{String(ev.kind ?? "?")}</span>
                <div className="muted" style={{ fontSize: 11 }}>
                  {JSON.stringify(ev)}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 style={{ margin: "0 0 8px", fontSize: 13 }}>Messages &amp; diplomacy</h4>
          <pre style={{ fontSize: 11, maxHeight: 160, overflow: "auto", margin: 0 }}>
            {JSON.stringify(frame.tick_summary, null, 2)}
          </pre>
        </div>

        <div>
          <label className="row" style={{ gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={showStateJson}
              onChange={(e) => setShowStateJson(e.target.checked)}
            />
            Show full state JSON (omniscient)
          </label>
          {showStateJson && (
            <pre
              style={{
                fontSize: 10,
                maxHeight: 320,
                overflow: "auto",
                marginTop: 8,
                whiteSpace: "pre-wrap",
              }}
            >
              {JSON.stringify(frame.state, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
