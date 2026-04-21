import type { LlmDecisionDebug, TickDebug, Tribe } from "@rr/shared";
import { useState } from "react";

import { REPLAY_TRIBE_STROKE } from "../replay/replayTheme.js";
import { tribeLabel } from "../v2/formatV2.js";

interface DebugPanelProps {
  debug: TickDebug | null;
}

function tribeColor(t: Tribe): string {
  return REPLAY_TRIBE_STROKE[t] ?? "#888";
}

function Collapsible({ label, defaultOpen = false, children }: {
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="dp-collapsible">
      <button type="button" className="dp-collapse-toggle" onClick={() => setOpen(!open)}>
        <span className={`dp-arrow ${open ? "dp-arrow-open" : ""}`}>▶</span>
        {label}
      </button>
      {open && <div className="dp-collapse-body">{children}</div>}
    </div>
  );
}

function PreBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 500;
  return (
    <div className="dp-pre-wrap">
      <pre className="dp-pre">
        {isLong && !expanded ? text.slice(0, 500) + "\n…" : text}
      </pre>
      {isLong && (
        <button type="button" className="dp-expand-btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Collapse" : `Show all (${text.length.toLocaleString()} chars)`}
        </button>
      )}
    </div>
  );
}

function LlmDecisionCard({ decision }: { decision: LlmDecisionDebug }) {
  const color = tribeColor(decision.tribe);
  return (
    <div className="dp-decision-card">
      <div className="dp-decision-header" style={{ borderLeftColor: color }}>
        <span className="dp-tribe-label" style={{ color }}>
          {tribeLabel(decision.tribe)}
        </span>
        <span className="dp-persona">{decision.persona}</span>
        {decision.error ? (
          <span className="dp-error-badge">ERROR</span>
        ) : (
          <span className="dp-usage">
            {decision.usage.input_tokens}in / {decision.usage.output_tokens}out · {decision.usage.latency_ms}ms · {decision.usage.model}
          </span>
        )}
      </div>

      <div className="dp-decision-body">
        <div className="dp-section">
          <span className="dp-section-label">Chose ({decision.choose.length})</span>
          {decision.choose.length > 0 ? (
            <ul className="dp-choose-list">
              {decision.choose.map((id, i) => (
                <li key={i} className="dp-choose-item"><code>{id}</code></li>
              ))}
            </ul>
          ) : (
            <span className="muted">No orders chosen</span>
          )}
        </div>

        {decision.messages.length > 0 && (
          <div className="dp-section">
            <span className="dp-section-label">Messages ({decision.messages.length})</span>
            <ul className="dp-msg-list">
              {decision.messages.map((m, i) => (
                <li key={i} className="dp-msg-item">
                  <span className="dp-msg-to" style={{ color: tribeColor(m.to as Tribe) }}>
                    → {tribeLabel(m.to as Tribe)}
                  </span>
                  {" "}
                  <span className="dp-msg-text">{m.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {decision.error && (
          <div className="dp-section">
            <span className="dp-section-label">Error</span>
            <span className="dp-error-text">{decision.error}</span>
          </div>
        )}

        <Collapsible label="System Prompt">
          <PreBlock text={decision.systemPrompt} />
        </Collapsible>

        <Collapsible label="User Prompt">
          <PreBlock text={decision.userPrompt} />
        </Collapsible>

        <Collapsible label="Raw LLM Response">
          <PreBlock text={decision.rawResponse} />
        </Collapsible>
      </div>
    </div>
  );
}

export function DebugPanel({ debug }: DebugPanelProps) {
  if (!debug) {
    return (
      <div className="debug-panel">
        <h3 className="dp-title">Debug</h3>
        <p className="muted">No debug data for this tick.</p>
      </div>
    );
  }

  const tribeEntries = Object.entries(debug.orderSummary) as [string, string[]][];

  return (
    <div className="debug-panel">
      <h3 className="dp-title">
        Debug — Tick {debug.tick}
      </h3>

      <div className="dp-section">
        <h4 className="dp-section-heading">Orders Summary</h4>
        <table className="dp-orders-table">
          <tbody>
            {tribeEntries.map(([tribe, orders]) => (
              <tr key={tribe}>
                <td className="dp-ot-tribe" style={{ color: tribeColor(tribe as Tribe) }}>
                  {tribeLabel(tribe as Tribe)}
                </td>
                <td className="dp-ot-orders">
                  {orders.length > 0 ? orders.map((o, i) => (
                    <span key={i} className="dp-order-tag">{o}</span>
                  )) : <span className="muted">pass</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {debug.events.length > 0 && (
        <div className="dp-section">
          <h4 className="dp-section-heading">Events ({debug.events.length})</h4>
          <ul className="dp-events-list">
            {debug.events.map((ev, i) => (
              <li key={i} className="dp-event-item">
                <span className="dp-event-kind">{ev.kind}</span>
                <span className="dp-event-detail">{JSON.stringify(ev).slice(0, 200)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {debug.decisions.length > 0 && (
        <div className="dp-section">
          <h4 className="dp-section-heading">LLM Decisions ({debug.decisions.length})</h4>
          <div className="dp-decisions">
            {debug.decisions.map((d, i) => (
              <LlmDecisionCard key={i} decision={d} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
