import type { Tribe } from "@rr/engine2";
import { REPLAY_TRIBE_STROKE } from "./replayTheme.js";
import type { ParsedReplayState } from "./parseReplayStateSnapshot.js";

function tribeColor(t: Tribe): string {
  return REPLAY_TRIBE_STROKE[t] ?? "#888";
}

function regionCounts(state: ParsedReplayState): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of Object.keys(state.players)) counts[t] = 0;
  for (const region of Object.values(state.regions)) {
    if (region.owner) counts[region.owner] = (counts[region.owner] ?? 0) + 1;
  }
  return counts;
}

interface ReplayScoreboardProps {
  state: ParsedReplayState;
}

export function ReplayScoreboard({ state }: ReplayScoreboardProps) {
  const counts = regionCounts(state);
  const tribes = Object.keys(state.players).sort();

  return (
    <div
      className="replay-scoreboard"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 10,
      }}
    >
      {tribes.map((tribe) => {
        const player = state.players[tribe as Tribe];
        if (!player) return null;
        const forceCount = Object.values(state.forces).filter((f) => f.owner === tribe).length;
        const pactCount = state.pacts.filter((p) => p.parties.includes(tribe as Tribe)).length;
        return (
          <div
            key={tribe}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 10,
              background: "#191919",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6, color: tribeColor(tribe as Tribe) }}>
              {tribe.toUpperCase()}
            </div>
            <div style={{ fontSize: 12 }}>
              Influence: <span className="mono">{player.influence}</span>
            </div>
            <div style={{ fontSize: 12 }}>
              Regions: <span className="mono">{counts[tribe] ?? 0}</span>
            </div>
            <div style={{ fontSize: 12 }}>
              Forces: <span className="mono">{forceCount}</span>
            </div>
            <div style={{ fontSize: 12 }}>
              Pacts: <span className="mono">{pactCount}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
