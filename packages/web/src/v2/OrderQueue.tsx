import type { LegalOrderOption, ProjectedView } from "@rr/engine2";
import { useState } from "react";
import { legalOptionMatchesRegion, scoutOptionRedundantForMapIntel } from "./ordersFromLegal.js";

interface OrderQueueProps {
  view: ProjectedView;
  chosenIds: string[];
  /** When set, only show move/recruit/build/scout options that start at this region; propose/respond stay visible. */
  selectedRegionId?: string | null;
  /** When false, the option cannot be turned on (removing an already-selected id is always allowed). */
  canAdd: (id: string) => boolean;
  onToggle: (id: string) => void;
  onClear: () => void;
}

export function OrderQueue({
  view,
  chosenIds,
  selectedRegionId = null,
  canAdd,
  onToggle,
  onClear,
}: OrderQueueProps) {
  const [showScoutOrders, setShowScoutOrders] = useState(false);
  const hadScouts = view.legalOrderOptions.some((o) => o.kind === "scout");
  const legalOptions = view.legalOrderOptions.filter(
    (o) => showScoutOrders || !scoutOptionRedundantForMapIntel(view, o),
  );

  const regionFilter = (opts: LegalOrderOption[]) =>
    selectedRegionId == null
      ? opts
      : opts.filter((o) => legalOptionMatchesRegion(o, selectedRegionId, view));

  const byKind = (k: string) => regionFilter(legalOptions.filter((o) => o.kind === k));
  const kinds = ["move", "recruit", "build", "scout", "propose", "respond", "message"] as const;

  const regionScopedKinds = ["move", "recruit", "build", "scout"] as const;
  const hasRegionScopedActions =
    selectedRegionId == null ||
    regionScopedKinds.some((k) => byKind(k).length > 0);

  return (
    <div className="v2-order-queue">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h3>Orders this tick</h3>
        <button type="button" className="danger" onClick={onClear} disabled={chosenIds.length === 0}>
          Clear queue
        </button>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        Toggle legal actions for this tick (build/recruit/diplomacy resolve before moves/scouts;
        each scout costs 3 Influence from your current total — this tick&apos;s production applies
        next tick; at most one <code className="mono">move</code> per force). Submit runs{" "}
        <code className="mono">tick()</code> on the local engine.
      </p>
      {hadScouts && (
        <label className="row" style={{ gap: 8, alignItems: "center", marginTop: 8 }}>
          <input
            type="checkbox"
            checked={showScoutOrders}
            onChange={(e) => setShowScoutOrders(e.target.checked)}
          />
          <span className="muted" style={{ fontSize: 12 }}>
            Show scout orders (adjacent targets are already visible in fog — use for inbox/combat)
          </span>
        </label>
      )}
      {selectedRegionId != null && (
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Showing actions starting at <span className="mono">{selectedRegionId}</span>; click the map
          again to clear selection.
        </p>
      )}
      {selectedRegionId != null && !hasRegionScopedActions && (
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          No move, recruit, build, or scout options starting at this region this tick.
        </p>
      )}
      {chosenIds.length > 0 && (
        <ol className="v2-queue-list">
          {chosenIds.map((id) => {
            const opt = view.legalOrderOptions.find((o) => o.id === id);
            return (
              <li key={id}>
                <span className="mono" style={{ fontSize: 11 }}>
                  {id}
                </span>
                {opt && <span className="muted"> — {opt.summary}</span>}
              </li>
            );
          })}
        </ol>
      )}

      <div className="v2-legal-sections">
        {kinds.map((kind) => {
          const opts = byKind(kind);
          if (opts.length === 0) return null;
          return (
            <div key={kind} className="v2-legal-group">
              <h4 className="v2-kind-title">{kind}</h4>
              <div className="v2-legal-btns">
                {opts.map((o: LegalOrderOption) => {
                  const on = chosenIds.includes(o.id);
                  const allowed = on || canAdd(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      className={on ? "primary" : ""}
                      disabled={!allowed}
                      onClick={() => onToggle(o.id)}
                      title={
                        allowed
                          ? o.id
                          : `${o.id} — would be clipped (Influence budget or a second move for the same force)`
                      }
                    >
                      {o.summary}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
