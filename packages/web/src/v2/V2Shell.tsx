import {
  CONTINENT_6P_DEFAULT_TRIBES,
  DEFAULT_MATCH_CONFIG,
  initMatch,
  projectForPlayer,
  tick,
  wouldClipOrders,
  type GameState,
  type MatchConfig,
  type Order,
  type ProjectedView,
  type Tribe,
} from "@rr/engine2";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  buildInitialReplayFrame,
  buildReplayFrameFromTs,
  makeLiveReplayPayload,
  ReplayFileLoader,
  ReplayViewer,
  type ReplayFrame,
  type ReplayPayload,
} from "../replay/index.js";
import { CONTINENT_6P_REGION_LAYOUT } from "./mapData.js";
import { DiplomacyPanel } from "./DiplomacyPanel.js";
import { assembleTickPackets } from "./llm/assembleTickPackets.js";
import { OrderQueue } from "./OrderQueue.js";
import { tribeLabel } from "./formatV2.js";
import { orderFromLegalOption } from "./ordersFromLegal.js";
import { V2Map } from "./V2Map.js";

function createMatch(): GameState {
  const config: MatchConfig = {
    ...DEFAULT_MATCH_CONFIG,
    seed: 2026041,
    tribes: [...CONTINENT_6P_DEFAULT_TRIBES],
    mapPreset: "continent6p",
  };
  return initMatch(config);
}

export function V2Shell() {
  const stateRef = useRef<GameState | null>(null);
  if (stateRef.current === null) {
    stateRef.current = createMatch();
  }

  const [playTribe, setPlayTribe] = useState<Tribe>("orange");
  const [bump, setBump] = useState(0);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [chosenIds, setChosenIds] = useState<string[]>([]);
  const [messageTo, setMessageTo] = useState<Tribe>("grey");
  const [messageText, setMessageText] = useState("");
  const [opponentMode, setOpponentMode] = useState<"pass" | "llm">("llm");
  const [llmUrl, setLlmUrl] = useState(
    () => import.meta.env.VITE_V2_LLM_URL ?? "http://127.0.0.1:8787/v2/llm",
  );
  const [llmToken, setLlmToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [tickError, setTickError] = useState<string | null>(null);
  const [replayFrames, setReplayFrames] = useState<ReplayFrame[]>(() => {
    const s = stateRef.current!;
    const pv = Object.fromEntries(
      s.tribesAlive.map((t) => [t, projectForPlayer(s, t)]),
    ) as Record<Tribe, ProjectedView>;
    return [buildInitialReplayFrame(s, pv)];
  });
  const [importedReplay, setImportedReplay] = useState<ReplayPayload | null>(null);

  const state = stateRef.current;
  const view = useMemo(
    () => projectForPlayer(state, playTribe),
    [state, playTribe, bump],
  );

  const ps = view.myPlayerState;

  const liveReplayPayload = useMemo(
    () =>
      makeLiveReplayPayload(replayFrames, {
        seed: state.seed,
        mapKind: "6p-continent",
        roster: [...state.tribesAlive],
        layout: CONTINENT_6P_REGION_LAYOUT,
      }),
    [replayFrames, state.seed, state.tribesAlive],
  );

  const displayReplayPayload = importedReplay ?? liveReplayPayload;

  const ordersForIds = useCallback(
    (ids: readonly string[]): Order[] => {
      const orders: Order[] = [];
      for (const id of ids) {
        const opt = view.legalOrderOptions.find((o) => o.id === id);
        if (opt) {
          orders.push(orderFromLegalOption(opt));
        }
      }
      if (messageText.trim()) {
        orders.push({
          kind: "message",
          to: messageTo,
          text: messageText.trim(),
        });
      }
      return orders;
    },
    [view.legalOrderOptions, messageText, messageTo],
  );

  const canAddLegalId = useCallback(
    (id: string) => {
      if (chosenIds.includes(id)) return true;
      return !wouldClipOrders(ps.influence, ordersForIds([...chosenIds, id]));
    },
    [chosenIds, ordersForIds, ps.influence],
  );

  const toggle = useCallback((id: string) => {
    setChosenIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      const next = [...prev, id];
      if (wouldClipOrders(ps.influence, ordersForIds(next))) {
        return prev;
      }
      return next;
    });
  }, [ordersForIds, ps.influence]);

  const resetMatch = useCallback(() => {
    stateRef.current = createMatch();
    setChosenIds([]);
    setMessageText("");
    setTickError(null);
    setImportedReplay(null);
    const s = stateRef.current;
    const pv = Object.fromEntries(
      s.tribesAlive.map((t) => [t, projectForPlayer(s, t)]),
    ) as Record<Tribe, ProjectedView>;
    setReplayFrames([buildInitialReplayFrame(s, pv)]);
    setBump((x) => x + 1);
  }, []);

  const submitTick = useCallback(async () => {
    setTickError(null);
    const orders = ordersForIds(chosenIds);
    setBusy(true);
    try {
      const packets = await assembleTickPackets(state, playTribe, orders, {
        opponents: opponentMode === "llm" ? "llm_http" : "pass",
        llmUrl: opponentMode === "llm" ? llmUrl : undefined,
        bearerToken: llmToken.trim() || undefined,
      });
      const result = tick(state, packets);
      const frame = buildReplayFrameFromTs({
        label: `Tick ${state.tick}`,
        state: result.state,
        stateHash: result.stateHash,
        packets,
        events: result.events,
        projectedViews: result.projectedViews,
      });
      setReplayFrames((prev) => [...prev, frame].slice(-120));
      setChosenIds([]);
      setMessageText("");
      setBump((x) => x + 1);
    } catch (e) {
      setTickError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [
    chosenIds,
    opponentMode,
    llmUrl,
    llmToken,
    playTribe,
    state,
    ordersForIds,
  ]);

  const winner = state.winner;

  const downloadLiveReplayJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(liveReplayPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `replay-live-${state.seed}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [liveReplayPayload, state.seed]);

  return (
    <>
      <div className="header">
        <div>
          <h1>Rogue Rivals</h1>
          <div className="sub">
            v2 · tick {view.tick} / {view.tickLimit} ·{" "}
            <span className={`tribe-chip tribe-${view.forTribe}`} />
            {tribeLabel(view.forTribe)} · Influence <b>{ps.influence}</b>
          </div>
          <div className="sub" style={{ marginTop: 4 }}>
            <span className="accent">@rr/engine2</span> — you are <b>{tribeLabel(playTribe)}</b>;
            opponents: {opponentMode === "llm" ? "HTTP LLM (parallel)" : "pass"}.
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <label className="row" style={{ gap: 6, alignItems: "center" }}>
            Playing as
            <select
              value={playTribe}
              onChange={(e) => {
                const t = e.target.value as Tribe;
                setPlayTribe(t);
                setChosenIds([]);
                const others = state.tribesAlive.filter((x: Tribe) => x !== t);
                setMessageTo((prev: Tribe) =>
                  others.includes(prev) ? prev : others[0] ?? prev,
                );
              }}
            >
              {state.tribesAlive.map((t: Tribe) => (
                <option key={t} value={t}>
                  {tribeLabel(t)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={resetMatch}>
            New match
          </button>
        </div>
      </div>

      {winner !== null && (
        <div className="card" style={{ marginBottom: 12, borderColor: "var(--accent, #6cf)" }}>
          <strong>Match over.</strong>{" "}
          <span className="mono">{Array.isArray(winner) ? winner.join(", ") : String(winner)}</span>
        </div>
      )}

      {tickError && (
        <div className="card" style={{ marginBottom: 12, borderColor: "#c66" }}>
          <strong>Tick error.</strong> {tickError}
        </div>
      )}

      <div className="layout v2-layout">
        <div className="col">
          <div className="card">
            <h3>Opponents</h3>
            <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
              Non-human tribes resolve in parallel. LLM mode POSTs each tribe&apos;s{" "}
              <code className="mono">projectForPlayer</code> view to your proxy; see{" "}
              <code className="mono">tools/v2/llm_agent.py</code> for the expected{" "}
              <code className="mono">choose</code> / <code className="mono">messages</code> JSON.
            </p>
            <div className="col" style={{ gap: 8 }}>
              <label className="row" style={{ gap: 8, alignItems: "center" }}>
                <input
                  type="radio"
                  name="opp"
                  checked={opponentMode === "pass"}
                  onChange={() => setOpponentMode("pass")}
                />
                All opponents pass (empty orders)
              </label>
              <label className="row" style={{ gap: 8, alignItems: "center" }}>
                <input
                  type="radio"
                  name="opp"
                  checked={opponentMode === "llm"}
                  onChange={() => setOpponentMode("llm")}
                />
                HTTP LLM slot (one POST per opponent tribe per tick)
              </label>
            </div>
            {opponentMode === "llm" && (
              <div className="col" style={{ gap: 8, marginTop: 12 }}>
                <label className="col" style={{ gap: 4 }}>
                  <span className="muted" style={{ fontSize: 11 }}>
                    Proxy URL (must allow CORS from this origin)
                  </span>
                  <input
                    type="url"
                    value={llmUrl}
                    onChange={(e) => setLlmUrl(e.target.value)}
                    placeholder="http://127.0.0.1:8787/v2/llm"
                    style={{ width: "100%" }}
                    autoComplete="off"
                  />
                </label>
                <label className="col" style={{ gap: 4 }}>
                  <span className="muted" style={{ fontSize: 11 }}>
                    Bearer token (optional)
                  </span>
                  <input
                    type="password"
                    value={llmToken}
                    onChange={(e) => setLlmToken(e.target.value)}
                    placeholder="Optional Authorization bearer"
                    style={{ width: "100%" }}
                    autoComplete="off"
                  />
                </label>
              </div>
            )}
          </div>

          <div className="card">
            <h3>Map</h3>
            <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              Fog of war: only your visible regions are drawn. Select a region for context (orders
              use the legal list below). Use +/− to zoom; drag the dark map background to pan; Fit
              resets the view.
            </p>
            <V2Map
              view={view}
              selectedRegionId={selectedRegionId}
              onSelectRegion={setSelectedRegionId}
            />
            {selectedRegionId && (
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                Selected: <span className="mono">{selectedRegionId}</span>
              </p>
            )}
          </div>

          <div className="card">
            <OrderQueue
              view={view}
              chosenIds={chosenIds}
              canAdd={canAddLegalId}
              onToggle={toggle}
              onClear={() => setChosenIds([])}
            />
            <div className="row" style={{ marginTop: 14, gap: 8 }}>
              <button
                type="button"
                className="primary"
                onClick={() => void submitTick()}
                disabled={
                  winner !== null ||
                  busy ||
                  (opponentMode === "llm" && !llmUrl.trim())
                }
              >
                {busy ? "Running tick…" : "Submit tick"}
              </button>
            </div>
          </div>
        </div>

        <div className="col">
          <div className="card">
            <h3>Forces &amp; sightings</h3>
            <ul className="v2-force-list">
              {view.myForces.map((f) => (
                <li key={f.id}>
                  <span className="mono">{f.id}</span> · Tier {f.tier} ·{" "}
                  {f.location.kind === "garrison"
                    ? `garrison ${f.location.regionId}`
                    : "in transit"}
                </li>
              ))}
            </ul>
            {view.visibleForces.length > 0 && (
              <>
                <h4 style={{ marginTop: 10, fontSize: 13 }}>Visible foreign forces</h4>
                <ul className="v2-force-list muted">
                  {view.visibleForces.map((vf, i) => (
                    <li key={i}>
                      {tribeLabel(vf.owner)} · {vf.fuzzyTier.replace(/_/g, " ")} · {vf.regionId}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="card">
            <DiplomacyPanel
              view={view}
              messageTo={messageTo}
              messageText={messageText}
              onMessageTo={setMessageTo}
              onMessageText={setMessageText}
            />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="row wrap" style={{ gap: 12, alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Replay debugger</h3>
          <ReplayFileLoader onLoad={(p) => setImportedReplay(p)} />
          <button type="button" onClick={downloadLiveReplayJson}>
            Download live session JSON
          </button>
          {importedReplay && (
            <button type="button" onClick={() => setImportedReplay(null)}>
              Clear imported replay
            </button>
          )}
        </div>
        {importedReplay && (
          <p className="muted" style={{ fontSize: 12 }}>
            Showing imported file. Clear to return to the live session recording.
          </p>
        )}
        <ReplayViewer payload={displayReplayPayload} />
      </div>
    </>
  );
}
