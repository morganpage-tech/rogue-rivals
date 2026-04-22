import type { MatchLogStatusResponse } from "@rr/shared";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { DebugPanel } from "../components/DebugPanel.js";
import { DebugSandboxPanel } from "../components/DebugSandboxPanel.js";
import { SpectatorMap } from "../components/SpectatorMap.js";
import { SpectatorScoreboard } from "../components/SpectatorScoreboard.js";
import { SpectatorTimeline } from "../components/SpectatorTimeline.js";
import { apiUrl } from "../config.js";

import { useSpectatorCurrentView, useSpectatorStore } from "../state/spectatorStore.js";
import { useDebugStore, useDebugTickForIndex } from "../state/debugStore.js";

export function WatchMatch(): React.ReactElement {
  const { matchId } = useParams<{ matchId: string }>();
  const connect = useSpectatorStore((s) => s.connect);
  const disconnect = useSpectatorStore((s) => s.disconnect);
  const v = useSpectatorCurrentView();
  const connection = useSpectatorStore((s) => s.connection);
  const tickIndex = useSpectatorStore((s) => s.currentTickIndex);
  const ticks = useSpectatorStore((s) => s.ticks);
  const isLive = useSpectatorStore((s) => s.isLive);
  const isPaused = useSpectatorStore((s) => s.isPaused);
  const goToTick = useSpectatorStore((s) => s.goToTick);
  const pause = useSpectatorStore((s) => s.pause);
  const play = useSpectatorStore((s) => s.play);
  const stepForward = useSpectatorStore((s) => s.stepForward);
  const stepBack = useSpectatorStore((s) => s.stepBack);

  const [showDebug, setShowDebug] = useState(false);
  const [showSandbox, setShowSandbox] = useState(false);
  const debugConnect = useDebugStore((s) => s.connect);
  const debugDisconnect = useDebugStore((s) => s.disconnect);
  const debugTick = useDebugTickForIndex(tickIndex);

  useEffect(() => {
    if (!matchId) return;
    connect(matchId);
    return () => disconnect();
  }, [matchId, connect, disconnect]);

  useEffect(() => {
    if (!matchId || !showDebug) return;
    debugConnect(matchId);
    return () => debugDisconnect();
  }, [matchId, showDebug, debugConnect, debugDisconnect]);

  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);

  const [logStatus, setLogStatus] = useState<MatchLogStatusResponse | null>(null);
  const [logErr, setLogErr] = useState<string | null>(null);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    const fetchLog = async () => {
      try {
        const res = await fetch(apiUrl(`/api/matches/${encodeURIComponent(matchId)}/match-log`));
        if (!res.ok) {
          if (!cancelled) {
            setLogErr(res.status === 404 ? "Match not on server (ended or unknown id)." : `HTTP ${res.status}`);
            setLogStatus(null);
          }
          return;
        }
        const j = (await res.json()) as MatchLogStatusResponse;
        if (!cancelled) {
          setLogStatus(j);
          setLogErr(null);
        }
      } catch (e) {
        if (!cancelled) {
          setLogErr(String(e));
          setLogStatus(null);
        }
      }
    };
    void fetchLog();
    const id = setInterval(() => void fetchLog(), 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [matchId, ticks.length]);

  const winner = useMemo(() => v?.winner ?? null, [v, tickIndex]);

  return (
    <div className="page-watch">
      <header className="pw-header">
        <div className="pw-header-row">
          <h1>Rogue Rivals — Spectating</h1>
          <button
            type="button"
            className={`dp-toggle-btn ${showSandbox ? "dp-toggle-active" : ""}`}
            onClick={() => setShowSandbox(!showSandbox)}
          >
            Sandbox
          </button>
          <button
            type="button"
            className={`dp-toggle-btn ${showDebug ? "dp-toggle-active" : ""}`}
            onClick={() => setShowDebug(!showDebug)}
          >
            Debug
          </button>
        </div>
        {logStatus ? (
          <details className="pw-debug">
            <summary className="muted" style={{ fontSize: 11, cursor: "pointer" }}>
              Match log debug info
            </summary>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
              <div>File: <code style={{ wordBreak: "break-all" }}>{logStatus.absolutePath}</code></div>
              <div>
                Ticks on disk: {logStatus.tickRecordsOnDisk} · in UI: {ticks.length} · buffer: {logStatus.tickBufferLength}
                {!logStatus.inSync && <span style={{ color: "#f66", marginLeft: 8 }}>(out of sync)</span>}
              </div>
            </div>
          </details>
        ) : logErr ? (
          <p className="muted" style={{ fontSize: 11 }}>{logErr}</p>
        ) : null}
      </header>

      <div className="pw-body">
        <section className="pw-map-area">
          {v ? (
            <SpectatorMap
              view={v}
              selectedRegionId={selectedRegionId}
              onSelectRegion={setSelectedRegionId}
            />
          ) : (
            <div className="pw-loading">
              <p>Waiting for data…</p>
            </div>
          )}
        </section>

        {v && (
          <aside className="pw-sidebar">
            <SpectatorScoreboard view={v} />
          </aside>
        )}

        {showDebug && (
          <aside className="pw-sidebar pw-debug-sidebar">
            <DebugPanel debug={debugTick} />
          </aside>
        )}

        {showSandbox && matchId && (
          <aside className="pw-sidebar pw-debug-sidebar">
            <DebugSandboxPanel matchId={matchId} currentTickIndex={tickIndex} />
          </aside>
        )}
      </div>

      <SpectatorTimeline
        ticks={ticks}
        currentTickIndex={tickIndex}
        isLive={isLive}
        isPaused={isPaused}
        connection={connection}
        winner={winner}
        goToTick={goToTick}
        pause={pause}
        play={play}
        stepForward={stepForward}
        stepBack={stepBack}
      />
    </div>
  );
}
