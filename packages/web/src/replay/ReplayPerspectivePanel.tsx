import type { ProjectedView, Tribe } from "@rr/engine2";
import { REPLAY_TRIBE_STROKE } from "./replayTheme.js";

function tribeColor(t: Tribe): string {
  return REPLAY_TRIBE_STROKE[t] ?? "#888";
}

interface ReplayPerspectivePanelProps {
  view: ProjectedView | null;
}

export function ReplayPerspectivePanel({ view }: ReplayPerspectivePanelProps) {
  if (!view) {
    return (
      <div className="muted" style={{ fontSize: 13 }}>
        Showing <strong>omniscient</strong> replay state. Switch to a tribe perspective to see that
        tribe&apos;s fog-of-war, inbox, and visible forces.
      </div>
    );
  }

  const visibleRegions = Object.keys(view.visibleRegions).sort();
  const inbox = view.inboxNew ?? [];
  const pacts = view.pactsInvolvingMe ?? [];

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span
          style={{
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: "4px 8px",
            fontSize: 12,
            background: "#191919",
          }}
        >
          Tribe:{" "}
          <strong style={{ color: tribeColor(view.forTribe) }}>{view.forTribe.toUpperCase()}</strong>
        </span>
        <span
          style={{
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: "4px 8px",
            fontSize: 12,
            background: "#191919",
          }}
        >
          Visible regions: <span className="mono">{visibleRegions.length}</span>
        </span>
        <span
          style={{
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: "4px 8px",
            fontSize: 12,
            background: "#191919",
          }}
        >
          Visible foreign forces: <span className="mono">{view.visibleForces.length}</span>
        </span>
        <span
          style={{
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: "4px 8px",
            fontSize: 12,
            background: "#191919",
          }}
        >
          Visible transits: <span className="mono">{view.visibleTransits.length}</span>
        </span>
      </div>
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 10,
          background: "#191919",
        }}
      >
        <div>
          <strong>Visible region ids</strong>
        </div>
        <div className="muted mono" style={{ fontSize: 11, marginTop: 6, wordBreak: "break-word" }}>
          {visibleRegions.join(", ") || "(none)"}
        </div>
      </div>
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 10,
          background: "#191919",
        }}
      >
        <div>
          <strong>Inbox this tick</strong>
        </div>
        {inbox.length === 0 ? (
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            No new inbox items.
          </div>
        ) : (
          <ul style={{ margin: "8px 0 0 16px", fontSize: 12 }}>
            {inbox.map((entry, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                {entry.kind === "message" && (
                  <>
                    message from {entry.from}: {entry.text ?? ""}
                  </>
                )}
                {entry.kind === "proposal" && entry.proposal && (
                  <>
                    proposal {entry.proposal.kind} from {entry.proposal.from} ({entry.proposal.id})
                  </>
                )}
                {entry.kind === "scout_report" && (
                  <>scout report: {String(entry.payload?.region_id ?? "unknown")}</>
                )}
                {entry.kind === "caravan_delivered" && (
                  <>
                    caravan from {entry.from} amount={String(entry.payload?.amount ?? "")}
                  </>
                )}
                {!["message", "proposal", "scout_report", "caravan_delivered"].includes(entry.kind) && (
                  <span className="mono">{entry.kind}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 10,
          background: "#191919",
        }}
      >
        <div>
          <strong>Active pacts involving this tribe</strong>
        </div>
        {pacts.length === 0 ? (
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            No active pacts.
          </div>
        ) : (
          <ul style={{ margin: "8px 0 0 16px", fontSize: 12 }}>
            {pacts.map((p, i) => (
              <li key={i}>
                {p.kind}: {p.parties.join(" / ")} (exp {p.expiresTick})
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
