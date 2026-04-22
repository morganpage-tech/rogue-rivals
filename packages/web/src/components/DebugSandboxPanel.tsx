import type { OrderPacket, Tribe } from "@rr/shared";
import { useCallback, useMemo, useState } from "react";

import { tribeLabel } from "../v2/formatV2.js";
import { useDebugSandboxStore, useSandboxCurrentView } from "../state/debugSandboxStore.js";

interface DebugSandboxPanelProps {
  matchId: string;
  currentTickIndex: number;
}

export function DebugSandboxPanel({ matchId, currentTickIndex }: DebugSandboxPanelProps) {
  const sandboxId = useDebugSandboxStore((s) => s.sandboxId);
  const forkedAtTick = useDebugSandboxStore((s) => s.forkedAtTick);
  const frames = useDebugSandboxStore((s) => s.frames);
  const currentFrameIndex = useDebugSandboxStore((s) => s.currentFrameIndex);
  const loading = useDebugSandboxStore((s) => s.loading);
  const error = useDebugSandboxStore((s) => s.error);
  const fork = useDebugSandboxStore((s) => s.fork);
  const step = useDebugSandboxStore((s) => s.step);
  const resimulate = useDebugSandboxStore((s) => s.resimulate);
  const goToFrame = useDebugSandboxStore((s) => s.goToFrame);
  const stepForward = useDebugSandboxStore((s) => s.stepForward);
  const stepBack = useDebugSandboxStore((s) => s.stepBack);
  const discard = useDebugSandboxStore((s) => s.discard);
  const sandboxView = useSandboxCurrentView();

  const [ordersJson, setOrdersJson] = useState("{}");
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const forkTick = currentTickIndex + 1;

  const handleFork = useCallback(() => {
    void fork(matchId, forkTick);
  }, [fork, matchId, forkTick]);

  const handleDiscard = useCallback(() => {
    void discard();
  }, [discard]);

  const parseOrders = useCallback((): Record<Tribe, OrderPacket> | null => {
    try {
      const parsed = JSON.parse(ordersJson) as Record<string, unknown>;
      const result: Record<string, OrderPacket> = {};
      for (const [tribe, val] of Object.entries(parsed)) {
        if (typeof val === "object" && val !== null && "orders" in (val as object)) {
          result[tribe] = val as OrderPacket;
        } else if (Array.isArray(val)) {
          result[tribe] = { tribe: tribe as Tribe, tick: -1, orders: val } as OrderPacket;
        }
      }
      setOrdersError(null);
      return result as Record<Tribe, OrderPacket>;
    } catch (e) {
      setOrdersError(String(e));
      return null;
    }
  }, [ordersJson]);

  const handleStep = useCallback(() => {
    const packets = parseOrders();
    if (packets) void step(packets);
  }, [parseOrders, step]);

  const handleResimulate = useCallback(() => {
    const packets = parseOrders();
    if (packets && sandboxId) {
      const altOrders: Record<number, Record<Tribe, OrderPacket>> = {};
      altOrders[forkedAtTick] = packets;
      void resimulate(altOrders, forkedAtTick + 20);
    }
  }, [parseOrders, sandboxId, forkedAtTick, resimulate]);

  const sandboxInfo = useMemo(() => {
    if (!sandboxId) return null;
    return {
      tick: sandboxView?.tick ?? forkedAtTick,
      tribesAlive: sandboxView?.tribesAlive ?? [],
      winner: sandboxView?.winner ?? null,
      frameCount: frames.length,
      currentFrame: currentFrameIndex + 1,
    };
  }, [sandboxId, sandboxView, forkedAtTick, frames.length, currentFrameIndex]);

  const events = useMemo<Array<{ text: string }>>(() => {
    if (!sandboxView) return [];
    return (sandboxView.resolutionEvents ?? []).map((ev) => ({
      text: JSON.stringify(ev),
    }));
  }, [sandboxView]);

  if (!sandboxId) {
    return (
      <div className="dsp-panel">
        <h3 className="dsp-title">Debug Sandbox</h3>
        <p className="dsp-desc">
          Fork the match at tick {forkTick} to try different orders.
          The original match is not affected.
        </p>
        <button
          type="button"
          className="dsp-btn dsp-btn-primary"
          onClick={handleFork}
          disabled={loading}
        >
          Fork at Tick {forkTick}
        </button>
        {error && <p className="dsp-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="dsp-panel">
      <div className="dsp-header">
        <h3 className="dsp-title">Sandbox</h3>
        <button type="button" className="dsp-btn dsp-btn-small" onClick={handleDiscard}>
          Discard
        </button>
      </div>

      <div className="dsp-info">
        <div>Forked at tick {forkedAtTick}</div>
        <div>Current tick: {sandboxInfo?.tick}</div>
        <div>
          Frame {sandboxInfo?.currentFrame} / {sandboxInfo?.frameCount}
        </div>
        {sandboxInfo?.winner && (
          <div className="dsp-winner">
            Winner: {Array.isArray(sandboxInfo.winner) ? sandboxInfo.winner.map(tribeLabel).join(", ") : tribeLabel(sandboxInfo.winner)}
          </div>
        )}
      </div>

      {sandboxInfo && frames.length > 0 && (
        <div className="dsp-scrubber">
          <input
            type="range"
            min={-1}
            max={frames.length - 1}
            value={currentFrameIndex}
            onChange={(e) => goToFrame(Number(e.target.value))}
            className="dsp-slider"
          />
          <div className="dsp-scrub-btns">
            <button type="button" className="dsp-btn dsp-btn-small" onClick={stepBack} disabled={currentFrameIndex <= -1}>
              Back
            </button>
            <span className="dsp-frame-label">
              {currentFrameIndex === -1 ? "(fork point)" : `Frame ${currentFrameIndex + 1}`}
            </span>
            <button type="button" className="dsp-btn dsp-btn-small" onClick={stepForward} disabled={currentFrameIndex >= frames.length - 1}>
              Fwd
            </button>
          </div>
        </div>
      )}

      <div className="dsp-orders">
        <label className="dsp-label">
          Orders JSON (per tribe):
          <span className="muted" style={{ fontSize: 11, marginLeft: 4 }}>
            {`{ "orange": { "tribe": "orange", "tick": N, "orders": [...] } }`}
          </span>
        </label>
        <textarea
          className="dsp-textarea"
          value={ordersJson}
          onChange={(e) => setOrdersJson(e.target.value)}
          rows={6}
          spellCheck={false}
        />
        {ordersError && <p className="dsp-error">JSON parse error: {ordersError}</p>}
      </div>

      <div className="dsp-actions">
        <button
          type="button"
          className="dsp-btn dsp-btn-primary"
          onClick={handleStep}
          disabled={loading}
        >
          Submit & Step
        </button>
        <button
          type="button"
          className="dsp-btn"
          onClick={handleResimulate}
          disabled={loading}
        >
          Resimulate from fork
        </button>
      </div>

      {error && <p className="dsp-error">{error}</p>}

      {events.length > 0 && (
        <div className="dsp-events">
          <h4 className="dsp-events-title">Events</h4>
          <ul className="dsp-events-list">
            {events.map((ev, i) => (
              <li key={i} className="dsp-event-item">{ev.text}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
