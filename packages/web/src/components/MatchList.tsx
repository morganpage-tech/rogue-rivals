import type { SharedMatchSummary, Tribe } from "@rr/shared";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiUrl } from "../config.js";
import { REPLAY_TRIBE_STROKE } from "../replay/replayTheme.js";

function tribeDot(t: Tribe): React.ReactElement {
  return (
    <span
      key={t}
      className="ml-tribe-dot"
      style={{ background: REPLAY_TRIBE_STROKE[t] ?? "#888" }}
      title={t}
    />
  );
}

function statusBadge(status: string, tick: number, tickLimit: number): React.ReactElement {
  if (status === "finished") {
    return <span className="ml-badge ml-badge-finished">Finished</span>;
  }
  if (status === "lobby") {
    return <span className="ml-badge ml-badge-lobby">Lobby</span>;
  }
  const pct = tickLimit > 0 ? Math.round((tick / tickLimit) * 100) : 0;
  return (
    <span className="ml-badge ml-badge-running">
      Running · {pct}%
    </span>
  );
}

export function MatchList(): React.ReactElement {
  const nav = useNavigate();
  const [matches, setMatches] = useState<SharedMatchSummary[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/matches"));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMatches((await res.json()) as SharedMatchSummary[]);
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const stopMatch = useCallback(
    async (matchId: string) => {
      try {
        const res = await fetch(apiUrl(`/api/matches/${encodeURIComponent(matchId)}`), {
          method: "DELETE",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await refresh();
      } catch (e) {
        setErr(String(e));
      }
    },
    [refresh],
  );

  if (matches.length === 0 && !err) {
    return (
      <div className="ml-empty">
        <p className="muted">No matches yet. Create one to get started.</p>
      </div>
    );
  }

  const running = matches.filter((m) => m.status === "running" || m.status === "lobby");
  const finished = matches.filter((m) => m.status === "finished");

  return (
    <div className="match-list">
      {err && <p className="ml-error">{err}</p>}

      {running.length > 0 && (
        <section className="ml-section">
          <h2 className="ml-section-title">Live Matches</h2>
          <div className="ml-grid">
            {running.map((m) => (
              <div key={m.matchId} className="ml-card">
                <div className="ml-card-header">
                  {statusBadge(m.status, m.tick, m.tickLimit)}
                  <span className="ml-map-preset">{m.mapPreset}</span>
                </div>
                <div className="ml-card-body">
                  <div className="ml-tick-line">
                    Tick <span className="mono">{m.tick}</span> / <span className="mono">{m.tickLimit}</span>
                  </div>
                  <div className="ml-tribes-row">
                    {m.tribesAlive.map(tribeDot)}
                    {m.tribesAlive.length > 0 && (
                      <span className="muted" style={{ fontSize: 11, marginLeft: 4 }}>
                        {m.tribesAlive.length} alive
                      </span>
                    )}
                  </div>
                  {m.winner && (
                    <div className="ml-winner">
                      Winner: {Array.isArray(m.winner) ? m.winner.join(", ") : m.winner}
                    </div>
                  )}
                </div>
                <div className="ml-card-actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => nav(`/watch/${m.matchId}`)}
                  >
                    Watch
                  </button>
                  {m.status === "running" && (
                    <button
                      type="button"
                      className="danger"
                      onClick={() => void stopMatch(m.matchId)}
                    >
                      Stop
                    </button>
                  )}
                </div>
                <div className="ml-card-id muted" title={m.matchId}>
                  {m.matchId.slice(0, 8)}…
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {finished.length > 0 && (
        <section className="ml-section">
          <h2 className="ml-section-title">Finished</h2>
          <div className="ml-grid">
            {finished.map((m) => (
              <div key={m.matchId} className="ml-card ml-card-finished">
                <div className="ml-card-header">
                  {statusBadge(m.status, m.tick, m.tickLimit)}
                  <span className="ml-map-preset">{m.mapPreset}</span>
                </div>
                <div className="ml-card-body">
                  <div className="ml-tick-line">
                    <span className="mono">{m.tick}</span> / <span className="mono">{m.tickLimit}</span> ticks
                  </div>
                  {m.winner && (
                    <div className="ml-winner">
                      Winner: {Array.isArray(m.winner) ? m.winner.join(", ") : m.winner}
                    </div>
                  )}
                </div>
                <div className="ml-card-actions">
                  <button
                    type="button"
                    onClick={() => nav(`/watch/${m.matchId}`)}
                  >
                    Replay
                  </button>
                </div>
                <div className="ml-card-id muted" title={m.matchId}>
                  {m.matchId.slice(0, 8)}…
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
