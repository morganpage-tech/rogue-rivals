import type { InboxMessage, ProjectedView, Proposal, Tribe } from "@rr/shared";
import { tribeLabel } from "./formatV2.js";

interface DiplomacyPanelProps {
  view: ProjectedView;
  messageTo: Tribe;
  messageText: string;
  onMessageTo: (t: Tribe) => void;
  onMessageText: (s: string) => void;
}

function proposalLine(p: Proposal): string {
  if (p.kind === "trade_offer") return `Trade: ${p.amountInfluence} Influence`;
  if (p.kind === "nap") return `NAP (${p.lengthTicks} ticks)`;
  if (p.kind === "shared_vision") return `Shared vision (${p.lengthTicks} ticks)`;
  return p.kind;
}

export function DiplomacyPanel({
  view,
  messageTo,
  messageText,
  onMessageTo,
  onMessageText,
}: DiplomacyPanelProps) {
  const others = view.tribesAlive.filter((t) => t !== view.forTribe);

  return (
    <div className="v2-diplomacy">
      <h3>Diplomacy</h3>

      <div className="v2-inbox-block">
        <h4>New this tick</h4>
        {view.inboxNew.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>
            No new messages.
          </p>
        ) : (
          <ul className="v2-inbox-list">
            {view.inboxNew.map((m: InboxMessage, i: number) => (
              <li key={i} className="v2-inbox-item">
                {m.kind === "proposal" && m.proposal && (
                  <>
                    <span className="accent">Proposal</span> from {tribeLabel(m.proposal.from)}:{" "}
                    {proposalLine(m.proposal)}
                    <span className="mono muted"> · {m.proposal.id}</span>
                  </>
                )}
                {m.kind === "message" && (
                  <>
                    <span className="accent">Message</span> from {m.from ? tribeLabel(m.from) : "?"}:{" "}
                    {m.text}
                  </>
                )}
                {m.kind !== "proposal" && m.kind !== "message" && (
                  <span className="mono">{m.kind}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="v2-inbox-block">
        <h4>Awaiting your response</h4>
        {view.myPlayerState.outstandingProposals.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>
            None.
          </p>
        ) : (
          <ul className="v2-inbox-list">
            {view.myPlayerState.outstandingProposals.map((p) => (
              <li key={p.id} className="v2-inbox-item">
                <b>{proposalLine(p)}</b> from {tribeLabel(p.from)}
                <span className="mono muted"> · {p.id}</span>
                <div className="muted" style={{ fontSize: 11 }}>
                  Expires tick {p.expiresTick}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="v2-compose">
        <h4>Compose message</h4>
        <p className="muted" style={{ fontSize: 12 }}>
          Free-text diplomacy is a separate <code className="mono">message</code> order (not shown in the legal list
          above in this demo).
        </p>
        <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
          <label className="row" style={{ gap: 6 }}>
            To
            <select
              value={messageTo}
              onChange={(e) => onMessageTo(e.target.value as Tribe)}
            >
              {others.map((t) => (
                <option key={t} value={t}>
                  {tribeLabel(t)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <textarea
          value={messageText}
          onChange={(e) => onMessageText(e.target.value)}
          rows={3}
          placeholder="Short message…"
          style={{ width: "100%", marginTop: 8 }}
        />
      </div>
    </div>
  );
}
