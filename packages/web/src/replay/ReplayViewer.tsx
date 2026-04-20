import { useCallback, useEffect, useMemo, useState } from "react";
import type { Tribe } from "@rr/engine2";
import { V2Map } from "../v2/V2Map.js";
import { describeReplayEvent } from "./describeReplayEvent.js";
import { formatTickComms } from "./formatTickComms.js";
import {
  buildOmniscientProjectedViewFromState,
  parseReplayStateSnapshot,
} from "./parseReplayStateSnapshot.js";
import { parseProjectedViewJson } from "./parseProjectedViewJson.js";
import { buildReplayMapOverlays } from "./ReplayMapOverlays.js";
import { ReplayMapStub } from "./ReplayMapStub.js";
import { ReplayPerspectivePanel } from "./ReplayPerspectivePanel.js";
import { ReplayScoreboard } from "./ReplayScoreboard.js";
import { trailBaseTicksMap } from "./trailBaseTicksMap.js";
import type { ReplayPayload } from "./types.js";

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
  const [showOverlays, setShowOverlays] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(900);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);

  const frame = frames[frameIdx] ?? frames[0];
  const prevFrame = frameIdx > 0 ? frames[frameIdx - 1]! : null;
  const meta = payload.meta;

  const parsedState = useMemo(
    () => (frame ? parseReplayStateSnapshot(frame.state) : null),
    [frame],
  );

  const trailTicks = useMemo(
    () => (parsedState ? trailBaseTicksMap(parsedState) : new Map<string, number>()),
    [parsedState],
  );

  const roster = meta.roster ?? [];

  const perspectiveView = useMemo(() => {
    if (!frame || perspective === "all") return null;
    const raw = frame.projected_views[perspective];
    return parseProjectedViewJson(raw);
  }, [frame, perspective]);

  const mapView = useMemo(() => {
    if (!parsedState) return null;
    if (perspective === "all") {
      const ft = (roster[0] ?? "orange") as Tribe;
      return buildOmniscientProjectedViewFromState(parsedState, ft);
    }
    return perspectiveView;
  }, [parsedState, perspective, perspectiveView, roster]);

  const glyphState = useMemo(() => {
    if (!parsedState || perspective !== "all") return null;
    return {
      forces: Object.values(parsedState.forces),
      scouts: Object.values(parsedState.scouts),
      caravans: Object.values(parsedState.caravans),
    };
  }, [parsedState, perspective]);

  const overlayChildren = useMemo(() => {
    if (!frame || !parsedState) return null;
    return buildReplayMapOverlays({
      frame,
      prevFrame,
      showOverlays,
      layout: payload.layout as Record<string, readonly [number, number]>,
      tribeStroke: payload.tribe_stroke,
    });
  }, [frame, prevFrame, showOverlays, payload.layout, payload.tribe_stroke, parsedState]);

  useEffect(() => {
    if (!playing) return;
    if (frames.length <= 1) {
      setPlaying(false);
      return;
    }
    const id = window.setInterval(() => {
      setFrameIdx((i) => {
        if (i >= frames.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, speedMs);
    return () => clearInterval(id);
  }, [playing, speedMs, frames.length]);

  const onSliderChange = useCallback((next: number) => {
    setPlaying(false);
    setFrameIdx(next);
  }, []);

  const warnings = meta.warnings ?? [];

  const comms = useMemo(
    () => (frame ? formatTickComms(frame.tick_summary) : { messages: [], diplomacy: [] }),
    [frame],
  );

  const isContinent6p = meta.map_kind === "6p-continent";

  if (!frame) {
    return <p className="muted">No frames.</p>;
  }

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

      <div className="row wrap" style={{ gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <button type="button" onClick={() => setPlaying((p) => !p)}>
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={() => onSliderChange(Math.max(0, frameIdx - 1))}>
          Prev
        </button>
        <button type="button" onClick={() => onSliderChange(Math.min(frames.length - 1, frameIdx + 1))}>
          Next
        </button>
        <label className="row" style={{ gap: 8, alignItems: "center" }}>
          Frame
          <input
            type="range"
            min={0}
            max={Math.max(0, frames.length - 1)}
            value={frameIdx}
            onChange={(e) => onSliderChange(Number(e.target.value))}
            style={{ width: 200 }}
          />
          <span className="mono" style={{ fontSize: 12 }}>
            {frameIdx} / {frames.length - 1} · {frame.label}
          </span>
        </label>
        <label className="row" style={{ gap: 6 }}>
          Perspective
          <select value={perspective} onChange={(e) => setPerspective(e.target.value)}>
            <option value="all">All (omniscient state map)</option>
            {roster.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="row" style={{ gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={showOverlays}
            onChange={(e) => setShowOverlays(e.target.checked)}
          />
          Map overlays
        </label>
        <label className="row" style={{ gap: 6 }}>
          Speed
          <select value={speedMs} onChange={(e) => setSpeedMs(Number(e.target.value))}>
            <option value={1400}>0.7x</option>
            <option value={900}>1x</option>
            <option value={500}>2x</option>
            <option value={250}>4x</option>
          </select>
        </label>
      </div>

      <p className="muted" style={{ fontSize: 12 }}>
        seed={meta.seed} map={meta.map_kind} tick_final={meta.tick_final}
        {parsedState?.winner != null && <> winner={JSON.stringify(parsedState.winner)}</>}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(320px, 1.4fr) minmax(280px, 1fr)",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div>
          <h4 style={{ margin: "0 0 8px", fontSize: 13 }}>Map</h4>
          {mapView && isContinent6p ? (
            <V2Map
              view={mapView}
              selectedRegionId={selectedRegionId}
              onSelectRegion={setSelectedRegionId}
              trailBaseTicks={trailTicks}
              showUnitGlyphs
              glyphState={glyphState}
              overlayChildren={overlayChildren}
            />
          ) : (
            <>
              <ReplayMapStub frame={frame} layout={payload.layout} />
              <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                Full V2 map (trails, glyphs, overlays) is available for 6p-continent replays. Other map
                kinds show a schematic.
              </p>
            </>
          )}
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <div className="card" style={{ padding: 12 }}>
            <h4 style={{ margin: "0 0 8px", fontSize: 13 }}>Scoreboard</h4>
            {parsedState ? (
              <ReplayScoreboard state={parsedState} />
            ) : (
              <p className="muted">No state.</p>
            )}
          </div>

          <div className="card" style={{ padding: 12 }}>
            <h4 style={{ margin: "0 0 8px", fontSize: 13 }}>Selected perspective</h4>
            <ReplayPerspectivePanel view={perspective === "all" ? null : perspectiveView} />
          </div>

          <div className="card" style={{ padding: 12 }}>
            <h4 style={{ margin: "0 0 8px", fontSize: 13 }}>Messages &amp; diplomacy</h4>
            {comms.messages.length === 0 && comms.diplomacy.length === 0 ? (
              <p className="muted" style={{ fontSize: 12 }}>
                No communication or diplomacy this tick.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
                {comms.messages.map((line, i) => (
                  <div
                    key={`m-${i}`}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: 8,
                      background: "#191919",
                    }}
                  >
                    {line}
                  </div>
                ))}
                {comms.diplomacy.map((line, i) => (
                  <div
                    key={`d-${i}`}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: 8,
                      background: "#191919",
                    }}
                  >
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 12 }}>
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
                              <span className="muted">{JSON.stringify(o.payload ?? {})}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          <div className="card" style={{ padding: 12 }}>
            <h4 style={{ margin: "0 0 8px", fontSize: 13 }}>Resolution events</h4>
            <ul className="replay-events" style={{ fontSize: 12, maxHeight: 220, overflow: "auto", margin: 0 }}>
              {(frame.resolution_events as Record<string, unknown>[]).map((ev, i) => (
                <li key={i} style={{ marginBottom: 6 }}>
                  <span className="mono">{String(ev.kind ?? "?")}</span>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {describeReplayEvent(ev)}
                  </div>
                </li>
              ))}
            </ul>
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
    </div>
  );
}
