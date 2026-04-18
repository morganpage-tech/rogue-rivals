import { useState } from "react";
import type { BuildingType, Resource } from "@rr/engine";
import {
  ACTION_EFFECT,
  BUILDING_EFFECT,
  BUILDING_LABEL,
  BUILDING_VP,
  BUILDING_WHY,
  RES_LABEL,
  RES_SHORT,
} from "./format";

const BUILDINGS: BuildingType[] = [
  "shack",
  "den",
  "watchtower",
  "forge",
  "great_hall",
];

const BUILDING_COST_TEXT: Record<BuildingType, string> = {
  shack: "1 home resource + 1 Scrap",
  den: "1 home resource + 1 non-home + 1 Scrap",
  watchtower: "2 of any one resource + 1 Scrap",
  forge: "3 different resources + 1 Scrap",
  great_hall: "1 of each resource (T + O + F + Rel) + 2 Scrap",
};

export function HelpPanel() {
  const [open, setOpen] = useState(true);
  const ress: Resource[] = ["T", "O", "F", "Rel", "S"];

  return (
    <div className="card">
      <div
        className="row"
        style={{ justifyContent: "space-between", cursor: "pointer" }}
        onClick={() => setOpen((o) => !o)}
      >
        <h3>How to play</h3>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open && (
        <div className="col" style={{ gap: 12, marginTop: 10, fontSize: 13 }}>
          <div>
            <div className="accent" style={{ fontWeight: 600, marginBottom: 4 }}>
              Goal
            </div>
            <div>
              Be the player with the most Victory Points when the match ends. The
              match ends the moment any of these happens:
              <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                <li>someone reaches <b>8 VP</b>,</li>
                <li>someone builds the <b>Great Hall</b> (ends at end of that round), or</li>
                <li>round <b>15</b> completes.</li>
              </ul>
            </div>
          </div>

          <div>
            <div className="accent" style={{ fontWeight: 600, marginBottom: 4 }}>
              Resources
            </div>
            <div className="mono" style={{ fontSize: 12 }}>
              {ress.map((k) => `${RES_SHORT[k]} = ${RES_LABEL[k]}`).join(" · ")}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Your <b>home region</b> is tied to your tribe and yields 2 of its
              resource per gather. Other regions yield 1. Ruins always yield Scrap.
            </div>
          </div>

          <div>
            <div className="accent" style={{ fontWeight: 600, marginBottom: 4 }}>
              Each turn
            </div>
            <div>
              Propose and resolve trades freely, then take exactly <b>one</b>{" "}
              action to end your turn:
            </div>
            <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
              <li>
                <b>Gather</b> — {ACTION_EFFECT.gather}
              </li>
              <li>
                <b>Build</b> — {ACTION_EFFECT.build}
              </li>
              <li>
                <b>Ambush</b> — {ACTION_EFFECT.ambush}
              </li>
              <li>
                <b>Scout</b> — {ACTION_EFFECT.scout}
              </li>
              <li>
                <b>Pass</b> — {ACTION_EFFECT.pass}
              </li>
            </ul>
          </div>

          <div>
            <div className="accent" style={{ fontWeight: 600, marginBottom: 4 }}>
              Buildings
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: 6,
              }}
            >
              {BUILDINGS.map((b) => (
                <div
                  key={b}
                  className="card sub"
                  style={{ padding: "6px 10px" }}
                >
                  <div>
                    <b>{BUILDING_LABEL[b]}</b>{" "}
                    <span className="accent">+{BUILDING_VP[b]} VP</span>{" "}
                    <span className="muted mono" style={{ fontSize: 12 }}>
                      · cost: {BUILDING_COST_TEXT[b]}
                    </span>
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {BUILDING_EFFECT[b]}{" "}
                    <span className="accent">Why: {BUILDING_WHY[b]}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="accent" style={{ fontWeight: 600, marginBottom: 4 }}>
              Trade beads
            </div>
            <div>{ACTION_EFFECT.trade}</div>
          </div>

          <div>
            <div className="accent" style={{ fontWeight: 600, marginBottom: 4 }}>
              A reasonable first plan
            </div>
            <div>
              Gather in your home region for 2–3 turns, trade once with a
              neighbour for a different resource, then build a <b>Shack</b> (+1
              VP and your home gathers become +2). Then aim for <b>Den</b> or{" "}
              <b>Forge</b>. Watch out for ambushes on regions you've been
              visiting repeatedly.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
