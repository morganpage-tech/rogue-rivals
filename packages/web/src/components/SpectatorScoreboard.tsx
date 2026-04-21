import type { SpectatorView, SpectatorForce, Tribe } from "@rr/shared";
import { useMemo } from "react";

import { REPLAY_TRIBE_STROKE } from "../replay/replayTheme.js";
import { tribeLabel } from "../v2/formatV2.js";

interface SpectatorScoreboardProps {
  view: SpectatorView;
}

function tribeColor(t: Tribe): string {
  return REPLAY_TRIBE_STROKE[t] ?? "#888";
}

function regionCounts(view: SpectatorView): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of Object.keys(view.players)) counts[t] = 0;
  for (const region of Object.values(view.regions)) {
    if (region.owner) counts[region.owner] = (counts[region.owner] ?? 0) + 1;
  }
  return counts;
}

function forceByTribe(forces: SpectatorForce[]): Record<string, SpectatorForce[]> {
  const map: Record<string, SpectatorForce[]> = {};
  for (const f of forces) {
    (map[f.owner] ??= []).push(f);
  }
  return map;
}

function pactSummary(
  pacts: SpectatorView["pacts"],
): { nap: string[]; war: string[]; vision: string[] } {
  const nap: string[] = [];
  const war: string[] = [];
  const vision: string[] = [];
  for (const p of pacts) {
    const label = p.parties.map(tribeLabel).join("–");
    if (p.kind === "nap") nap.push(label);
    else if (p.kind === "war") war.push(label);
    else if (p.kind === "shared_vision") vision.push(label);
  }
  return { nap, war, vision };
}

export function SpectatorScoreboard({ view }: SpectatorScoreboardProps) {
  const counts = useMemo(() => regionCounts(view), [view]);
  const fbymap = useMemo(() => forceByTribe(Object.values(view.forces)), [view]);
  const alive = new Set(view.tribesAlive);
  const tribes = Object.keys(view.players).sort() as Tribe[];
  const pacts = useMemo(() => pactSummary(view.pacts), [view]);

  return (
    <div className="spectator-scoreboard">
      <h3 className="ss-title">Scoreboard</h3>
      <div className="ss-grid">
        {tribes.map((tribe) => {
          const player = view.players[tribe];
          if (!player) return null;
          const isAlive = alive.has(tribe);
          const forces = fbymap[tribe] ?? [];
          const pactsForTribe = view.pacts.filter((p) => p.parties.includes(tribe));
          return (
            <div
              key={tribe}
              className={`ss-card ${isAlive ? "" : "ss-eliminated"}`}
            >
              <div className="ss-tribe-name" style={{ color: tribeColor(tribe) }}>
                {tribeLabel(tribe)}
                {!isAlive && <span className="ss-dead-tag">ELIMINATED</span>}
              </div>
              <div className="ss-stat">
                Influence: <span className="mono">{player.influence}</span>
              </div>
              <div className="ss-stat">
                Regions: <span className="mono">{counts[tribe] ?? 0}</span>
              </div>
              <div className="ss-stat">
                Forces: <span className="mono">{forces.length}</span>
                {forces.length > 0 && (
                  <span className="muted" style={{ marginLeft: 4 }}>
                    (T{forces.map((f) => f.tier).join(", T")})
                  </span>
                )}
              </div>
              <div className="ss-stat">
                Pacts: <span className="mono">{pactsForTribe.length}</span>
              </div>
            </div>
          );
        })}
      </div>

      {(pacts.nap.length > 0 || pacts.war.length > 0 || pacts.vision.length > 0) && (
        <div className="ss-pacts">
          <h4 className="ss-pacts-title">Active Pacts</h4>
          {pacts.nap.length > 0 && (
            <div className="ss-pact-group">
              <span className="ss-pact-label ss-pact-nap">NAP</span>{" "}
              {pacts.nap.join(" · ")}
            </div>
          )}
          {pacts.vision.length > 0 && (
            <div className="ss-pact-group">
              <span className="ss-pact-label ss-pact-vision">Vision</span>{" "}
              {pacts.vision.join(" · ")}
            </div>
          )}
          {pacts.war.length > 0 && (
            <div className="ss-pact-group">
              <span className="ss-pact-label ss-pact-war">War</span>{" "}
              {pacts.war.join(" · ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
