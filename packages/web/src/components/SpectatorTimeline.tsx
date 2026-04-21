import type { ResolutionEvent, SpectatorView, Tribe } from "@rr/shared";
import { useCallback, useMemo } from "react";

import { describeReplayEvent } from "../replay/describeReplayEvent.js";
import { tribeLabel } from "../v2/formatV2.js";

interface SpectatorTimelineProps {
  ticks: SpectatorView[];
  currentTickIndex: number;
  isLive: boolean;
  isPaused: boolean;
  connection: "disconnected" | "connecting" | "connected";
  winner: Tribe | Tribe[] | null;
  goToTick: (index: number) => void;
  pause: () => void;
  play: () => void;
  stepForward: () => void;
  stepBack: () => void;
}

export function SpectatorTimeline({
  ticks,
  currentTickIndex,
  isLive,
  isPaused,
  connection,
  winner,
  goToTick,
  pause,
  play,
  stepForward,
  stepBack,
}: SpectatorTimelineProps) {
  const total = ticks.length;
  const current = ticks[currentTickIndex];
  const tick = current?.tick ?? 0;
  const tickLimit = current?.tickLimit ?? 0;

  const events = useMemo<ResolutionEvent[]>(
    () => current?.resolutionEvents ?? [],
    [current],
  );

  const onSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      pause();
      goToTick(Number(e.target.value));
    },
    [goToTick, pause],
  );

  const jumpStart = useCallback(() => goToTick(0), [goToTick]);
  const jumpEnd = useCallback(
    () => goToTick(Math.max(0, total - 1)),
    [goToTick, total],
  );

  const connectionLabel =
    connection === "connected"
      ? "Live"
      : connection === "connecting"
        ? "Connecting…"
        : "Disconnected";

  return (
    <div className="spectator-timeline">
      <div className="st-header">
        <div className="st-status">
          <span className={`st-dot ${connection}`} />
          <span>{connectionLabel}</span>
          {isLive && !isPaused && <span className="st-live-badge">LIVE</span>}
          {isPaused && <span className="st-paused-badge">PAUSED</span>}
          {winner && (
            <span className="st-winner-badge">
              Winner: {Array.isArray(winner) ? winner.map(tribeLabel).join(", ") : tribeLabel(winner)}
            </span>
          )}
        </div>
        <span className="st-tick-counter">
          Tick {tick} / {tickLimit}
          <span className="muted" style={{ marginLeft: 8 }}>
            Frame {currentTickIndex + 1} / {total || "—"}
          </span>
        </span>
      </div>

      <div className="st-controls">
        <button
          type="button"
          className="st-btn"
          onClick={jumpStart}
          disabled={currentTickIndex <= 0}
          title="Jump to start"
        >
          ⏮
        </button>
        <button
          type="button"
          className="st-btn"
          onClick={stepBack}
          disabled={currentTickIndex <= 0}
          title="Step back"
        >
          ⏪
        </button>
        {isPaused || !isLive ? (
          <button
            type="button"
            className="st-btn st-btn-play"
            onClick={play}
            title="Play / go live"
          >
            ▶
          </button>
        ) : (
          <button
            type="button"
            className="st-btn st-btn-pause"
            onClick={pause}
            title="Pause"
          >
            ⏸
          </button>
        )}
        <button
          type="button"
          className="st-btn"
          onClick={stepForward}
          disabled={currentTickIndex >= total - 1}
          title="Step forward"
        >
          ⏩
        </button>
        <button
          type="button"
          className="st-btn"
          onClick={jumpEnd}
          disabled={currentTickIndex >= total - 1}
          title="Jump to latest"
        >
          ⏭
        </button>

        <input
          type="range"
          className="st-slider"
          min={0}
          max={Math.max(0, total - 1)}
          value={currentTickIndex}
          onChange={onSliderChange}
          disabled={total <= 1}
          title="Scrub match history"
        />
      </div>

      {events.length > 0 && (
        <div className="st-events">
          <h4 className="st-events-title">Events this tick</h4>
          <ul className="st-events-list">
            {events.map((ev, i) => (
              <li key={i} className="st-event-item">
                {describeReplayEvent(ev as Record<string, unknown>)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
