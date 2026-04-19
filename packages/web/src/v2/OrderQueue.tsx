import type { LegalOrderOption, ProjectedView } from "@rr/engine2";

interface OrderQueueProps {
  view: ProjectedView;
  chosenIds: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}

export function OrderQueue({ view, chosenIds, onToggle, onClear }: OrderQueueProps) {
  const byKind = (k: string) => view.legalOrderOptions.filter((o) => o.kind === k);
  const kinds = ["move", "recruit", "build", "scout", "propose", "respond", "message"] as const;

  return (
    <div className="v2-order-queue">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h3>Orders this tick</h3>
        <button type="button" className="danger" onClick={onClear} disabled={chosenIds.length === 0}>
          Clear queue
        </button>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        Toggle legal actions for this tick. Submit runs <code className="mono">tick()</code> on the
        local engine (other tribes pass).
      </p>
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
                  return (
                    <button
                      key={o.id}
                      type="button"
                      className={on ? "primary" : ""}
                      onClick={() => onToggle(o.id)}
                      title={o.id}
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
