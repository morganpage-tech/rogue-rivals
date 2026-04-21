import type { MatchLogStatusResponse, Tribe } from "@rr/shared";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { SpectatorScoreboard } from "../components/SpectatorScoreboard.js";
import { SpectatorTimeline } from "../components/SpectatorTimeline.js";
import { apiUrl } from "../config.js";

import {
  buildOmniscientProjectedViewFromState,
} from "../replay/parseReplayStateSnapshot.js";
import { ReplayMapStub } from "../replay/ReplayMapStub.js";
import {
  getSpectatorMapKind,
  getSpectatorMapLayout,
  type SpectatorMapKind,
} from "../replay/spectatorMapLayout.js";
import { spectatorViewToParsedReplayState } from "../replay/spectatorViewToParsedReplayState.js";
import { trailBaseTicksMap } from "../replay/trailBaseTicksMap.js";
import type { ReplayFrame } from "../replay/types.js";
import { useSpectatorCurrentView, useSpectatorStore } from "../state/spectatorStore.js";
import { V2Map } from "../v2/V2Map.js";

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

  useEffect(() => {
    if (!matchId) return;
    connect(matchId);
    return () => disconnect();
  }, [matchId, connect, disconnect]);

  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);

  const [lockedMapKind, setLockedMapKind] = useState<SpectatorMapKind | null>(null);

  useEffect(() => {
    setLockedMapKind(null);
  }, [matchId]);

  useEffect(() => {
    if (!v || Object.keys(v.regions).length === 0) return;
    if (lockedMapKind !== null) return;
    const k = getSpectatorMapKind(Object.keys(v.regions));
    if (k !== "unknown") setLockedMapKind(k);
  }, [v, lockedMapKind]);

  const regionIds = useMemo(() => (v ? Object.keys(v.regions) : []), [v, tickIndex]);
  const mapKind = lockedMapKind ?? getSpectatorMapKind(regionIds);
  const mapLayout = useMemo(() => getSpectatorMapLayout(regionIds), [regionIds]);
  const is6p = mapKind === "continent6p";

  const parsedForV2 = useMemo(() => {
    if (!v || !is6p) return null;
    return spectatorViewToParsedReplayState(v);
  }, [v, is6p, tickIndex]);

  const mapView = useMemo(() => {
    if (!parsedForV2) return null;
    const roster = (parsedForV2.tribesAlive[0] ?? "orange") as Tribe;
    return buildOmniscientProjectedViewFromState(parsedForV2, roster);
  }, [parsedForV2, tickIndex]);

  const trailTicks = useMemo(
    () => (parsedForV2 ? trailBaseTicksMap(parsedForV2) : new Map<string, number>()),
    [parsedForV2, tickIndex],
  );

  const glyphState = useMemo(() => {
    if (!parsedForV2) return null;
    return {
      forces: Object.values(parsedForV2.forces),
      scouts: Object.values(parsedForV2.scouts),
      caravans: Object.values(parsedForV2.caravans),
    };
  }, [parsedForV2, tickIndex]);

  const stubFrame = useMemo((): ReplayFrame | null => {
    if (!v) return null;
    return { state: { regions: v.regions } } as ReplayFrame;
  }, [v, tickIndex]);

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
        <h1>Rogue Rivals — Spectating</h1>
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
            is6p && mapView && glyphState ? (
              <V2Map
                view={mapView}
                selectedRegionId={selectedRegionId}
                onSelectRegion={setSelectedRegionId}
                trailBaseTicks={trailTicks}
                showUnitGlyphs
                glyphState={glyphState}
              />
            ) : mapLayout && stubFrame ? (
              <ReplayMapStub frame={stubFrame} layout={mapLayout} />
            ) : (
              <p className="muted">
                Unknown map layout for these region ids — cannot draw schematic. (Regions:{" "}
                {regionIds.slice(0, 8).join(", ")}
                {regionIds.length > 8 ? "…" : ""})
              </p>
            )
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
