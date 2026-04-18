import { useState } from "react";
import type { MatchState, Resource, TradeOffer } from "@rr/engine";
import { RES_LABEL, RES_SHORT } from "./format";

type ResourceBag = Partial<Record<Resource, number>>;

const RES_KEYS: Resource[] = ["T", "O", "F", "Rel", "S"];

interface ProposeProps {
  state: MatchState;
  fromId: string;
  nameOf: (id: string) => string;
  initialOffered?: ResourceBag;
  initialRequested?: ResourceBag;
  initialRecipient?: string;
  title?: string;
  submitLabel?: string;
  onSubmit: (recipient: string, offered: ResourceBag, requested: ResourceBag) => void;
  onCancel: () => void;
}

function Stepper({
  value,
  onChange,
  max,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  max: number;
  label: string;
}) {
  return (
    <div className="trade-row">
      <div>
        <code>{label}</code>
      </div>
      <div className="stepper">
        <button onClick={() => onChange(Math.max(0, value - 1))} disabled={value <= 0}>
          ù
        </button>
        <div className="v">{value}</div>
        <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>
          +
        </button>
      </div>
    </div>
  );
}

export function ProposeTrade(props: ProposeProps) {
  const {
    state,
    fromId,
    nameOf,
    initialOffered = {},
    initialRequested = {},
    initialRecipient,
    title = "Propose a trade",
    submitLabel = "Send offer",
    onSubmit,
    onCancel,
  } = props;

  const otherIds = state.seatPlayerIds.filter((id) => id !== fromId);
  const [recipient, setRecipient] = useState<string>(
    initialRecipient ?? otherIds[0] ?? "",
  );
  const [offered, setOffered] = useState<ResourceBag>({ ...initialOffered });
  const [requested, setRequested] = useState<ResourceBag>({ ...initialRequested });

  const fromPs = state.players[fromId];
  const toPs = recipient ? state.players[recipient] : null;

  const offeredTotal = RES_KEYS.reduce((a, k) => a + (offered[k] ?? 0), 0);
  const requestedTotal = RES_KEYS.reduce((a, k) => a + (requested[k] ?? 0), 0);

  const offererCanPay = RES_KEYS.every(
    (k) => fromPs.resources[k] >= (offered[k] ?? 0),
  );
  const offererInvalid = !offererCanPay || offeredTotal === 0 || requestedTotal === 0;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <div className="col" style={{ marginTop: 8 }}>
          <label className="row" style={{ justifyContent: "space-between" }}>
            <span className="muted">To</span>
            <select
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            >
              {otherIds.map((id) => (
                <option key={id} value={id}>
                  {nameOf(id)}
                </option>
              ))}
            </select>
          </label>
          <div className="trade-grid">
            <div>
              <h4>You offer</h4>
              {RES_KEYS.map((k) => (
                <Stepper
                  key={k}
                  label={`${RES_SHORT[k]} ù ${RES_LABEL[k]}`}
                  value={offered[k] ?? 0}
                  max={fromPs.resources[k]}
                  onChange={(n) => setOffered({ ...offered, [k]: n })}
                />
              ))}
              <div className="muted" style={{ fontSize: 12 }}>
                Your stockpile: {RES_KEYS.map((k) => `${RES_SHORT[k]}:${fromPs.resources[k]}`).join(" ")}
              </div>
            </div>
            <div>
              <h4>You want</h4>
              {RES_KEYS.map((k) => (
                <Stepper
                  key={k}
                  label={`${RES_SHORT[k]} ù ${RES_LABEL[k]}`}
                  value={requested[k] ?? 0}
                  max={99}
                  onChange={(n) => setRequested({ ...requested, [k]: n })}
                />
              ))}
              {toPs && (
                <div className="muted" style={{ fontSize: 12 }}>
                  Their stockpile is private.
                </div>
              )}
            </div>
          </div>
          {!offererCanPay && (
            <div className="bad" style={{ fontSize: 12 }}>
              You don't have enough resources to cover this offer.
            </div>
          )}
          <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
            <button onClick={onCancel}>Cancel</button>
            <button
              className="primary"
              disabled={offererInvalid || !recipient}
              onClick={() => onSubmit(recipient, offered, requested)}
            >
              {submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface RespondProps {
  offer: TradeOffer;
  state: MatchState;
  nameOf: (id: string) => string;
  onAccept: () => void;
  onReject: () => void;
  onCounter: (offered: ResourceBag, requested: ResourceBag) => void;
  onCancel: () => void;
}

export function RespondTrade(props: RespondProps) {
  const { offer, state, nameOf, onAccept, onReject, onCounter, onCancel } = props;
  const [mode, setMode] = useState<"view" | "counter">("view");

  const recipient = offer.recipient;
  const recPs = state.players[recipient];
  const canAccept = RES_KEYS.every(
    (k) => recPs.resources[k] >= (offer.requested[k] ?? 0),
  );

  if (mode === "counter") {
    return (
      <ProposeTrade
        state={state}
        fromId={recipient}
        nameOf={nameOf}
        title={`Counter offer to ${nameOf(offer.offerer)}`}
        submitLabel="Send counter"
        initialRecipient={offer.offerer}
        initialOffered={offer.requested}
        initialRequested={offer.offered}
        onCancel={() => setMode("view")}
        onSubmit={(_to, offered, requested) => onCounter(offered, requested)}
      />
    );
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Incoming trade from {nameOf(offer.offerer)}</h3>
        <div className="col" style={{ marginTop: 8 }}>
          <div className="trade-grid">
            <div className="card sub">
              <h4>They offer</h4>
              <div className="mono">
                {RES_KEYS.filter((k) => (offer.offered[k] ?? 0) > 0)
                  .map((k) => `${offer.offered[k]} ${RES_SHORT[k]}`)
                  .join(" + ") || "ù"}
              </div>
            </div>
            <div className="card sub">
              <h4>They want</h4>
              <div className="mono">
                {RES_KEYS.filter((k) => (offer.requested[k] ?? 0) > 0)
                  .map((k) => `${offer.requested[k]} ${RES_SHORT[k]}`)
                  .join(" + ") || "ù"}
              </div>
            </div>
          </div>
          {!canAccept && (
            <div className="bad" style={{ fontSize: 12 }}>
              You don't have the resources they're requesting.
            </div>
          )}
          <div
            className="row"
            style={{ justifyContent: "flex-end", gap: 8, marginTop: 10, flexWrap: "wrap" }}
          >
            <button onClick={onCancel}>Close</button>
            <button className="danger" onClick={onReject}>
              Reject
            </button>
            <button onClick={() => setMode("counter")}>Counterù</button>
            <button className="primary" disabled={!canAccept} onClick={onAccept}>
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
