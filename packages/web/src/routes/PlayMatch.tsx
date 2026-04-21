import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import type { Order, Tribe } from "@rr/shared";

import { OrderQueue } from "../v2/OrderQueue.js";
import { V2Map } from "../v2/V2Map.js";
import { DiplomacyPanel } from "../v2/DiplomacyPanel.js";
import { tribeLabel } from "../v2/formatV2.js";
import { usePlayerStore } from "../state/playerStore.js";
import { orderFromLegalOption } from "../v2/legalOrders.js";

function tribeFromToken(token: string | null): Tribe | null {
  if (!token) return null;
  try {
    const p = JSON.parse(atob(token.split(".")[1]!)) as { tribe?: Tribe };
    return p.tribe ?? null;
  } catch {
    return null;
  }
}

export function PlayMatch(): React.ReactElement {
  const { matchId = "" } = useParams<{ matchId: string }>();
  const [sp] = useSearchParams();
  const token = sp.get("token");

  const view = usePlayerStore((s) => s.view);
  const connect = usePlayerStore((s) => s.connect);
  const restoreFromUrl = usePlayerStore((s) => s.restoreFromUrl);
  const submitOrders = usePlayerStore((s) => s.submitOrders);
  const chosenIds = usePlayerStore((s) => s.chosenIds);
  const toggleOrder = usePlayerStore((s) => s.toggleOrder);
  const clearOrders = usePlayerStore((s) => s.clearOrders);
  const busy = usePlayerStore((s) => s.busy);
  const error = usePlayerStore((s) => s.error);
  const waitingFor = usePlayerStore((s) => s.waitingFor);
  const submittedThisTick = usePlayerStore((s) => s.submittedThisTick);
  const connection = usePlayerStore((s) => s.connection);
  const messageTo = usePlayerStore((s) => s.messageTo);
  const messageText = usePlayerStore((s) => s.messageText);
  const setMessageTo = usePlayerStore((s) => s.setMessageTo);
  const setMessageText = usePlayerStore((s) => s.setMessageText);

  const playTribe = useMemo(() => tribeFromToken(token), [token]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [showDiplomacy, setShowDiplomacy] = useState(false);

  useEffect(() => {
    if (!matchId || !token) return;
    restoreFromUrl(matchId, token);
    connect();
  }, [matchId, token, connect, restoreFromUrl]);

  if (!token || !playTribe) {
    return (
      <div className="page-play">
        <p className="pp-error">Missing token or invalid link.</p>
      </div>
    );
  }

  if (!view) {
    const statusText = connection === "connecting" ? "Connecting…" : "Waiting for game state…";
    return (
      <div className="page-play">
        <header className="pp-header">
          <h1>{tribeLabel(playTribe)}</h1>
        </header>
        <div className="pp-loading">
          <p>{statusText}</p>
        </div>
      </div>
    );
  }

  async function onSubmit(): Promise<void> {
    if (!view) return;
    const orders: Order[] = [];
    for (const id of chosenIds) {
      const opt = view.legalOrderOptions.find((o) => o.id === id);
      if (opt) orders.push(orderFromLegalOption(opt));
    }
    await submitOrders(orders);
  }

  const connDot =
    connection === "connected" ? "pp-dot-ok" : connection === "connecting" ? "pp-dot-wait" : "pp-dot-off";

  return (
    <div className="page-play">
      <header className="pp-header">
        <div className="pp-header-left">
          <h1>
            <span style={{ color: `var(--${playTribe})` }}>{tribeLabel(playTribe)}</span>
          </h1>
          <span className="pp-tick">
            Tick {view.tick} / {view.tickLimit}
          </span>
        </div>
        <div className="pp-header-right">
          <span className="pp-influence">
            Influence: <span className="mono">{view.myPlayerState.influence}</span>
          </span>
          <span className={`pp-dot ${connDot}`} />
          {waitingFor.length > 0 && (
            <span className="pp-waiting">
              Waiting for: {waitingFor.map(tribeLabel).join(", ")}
            </span>
          )}
        </div>
      </header>

      <div className="pp-body">
        <div className="pp-main">
          <V2Map
            view={view}
            selectedRegionId={selectedRegionId}
            onSelectRegion={setSelectedRegionId}
            showUnitGlyphs
          />
        </div>

        <aside className="pp-sidebar">
          <div className="pp-submit-row">
            {submittedThisTick ? (
              <div className="pp-locked">
                Orders locked for this tick.
                {waitingFor.length > 0 && (
                  <span className="muted" style={{ marginLeft: 8 }}>
                    Waiting for: {waitingFor.map(tribeLabel).join(", ")}
                  </span>
                )}
              </div>
            ) : (
              <button
                type="button"
                className="primary pp-submit-btn"
                disabled={busy || chosenIds.length === 0}
                onClick={() => void onSubmit()}
              >
                {busy ? "Submitting…" : `Submit ${chosenIds.length} order${chosenIds.length !== 1 ? "s" : ""}`}
              </button>
            )}
          </div>

          {error && <p className="pp-error">{error}</p>}

          <OrderQueue
            view={view}
            chosenIds={chosenIds}
            selectedRegionId={selectedRegionId}
            canAdd={() => !submittedThisTick}
            onToggle={toggleOrder}
            onClear={clearOrders}
          />

          <button
            type="button"
            className="pp-dip-toggle"
            onClick={() => setShowDiplomacy(!showDiplomacy)}
          >
            {showDiplomacy ? "Hide" : "Show"} Diplomacy
          </button>

          {showDiplomacy && (
            <DiplomacyPanel
              view={view}
              messageTo={messageTo}
              messageText={messageText}
              onMessageTo={setMessageTo}
              onMessageText={setMessageText}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
