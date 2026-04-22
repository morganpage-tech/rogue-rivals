import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { CreateMatchResponse, Tribe } from "@rr/shared";

import { MatchWizard } from "../components/MatchWizard.js";

function tribeLabel(t: Tribe): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function CreateMatch(): React.ReactElement {
  const nav = useNavigate();
  const [result, setResult] = useState<CreateMatchResponse | null>(null);

  if (result) {
    const humanLinks = Object.entries(result.inviteLinks).filter(
      ([, url]) => url,
    );

    return (
      <div className="page-create">
        <div className="mw-result">
          <h2>Match created!</h2>

          {humanLinks.length > 0 && (
            <div className="mw-invites">
              <h3>Invite links</h3>
              <p className="hint">
                Share these links with the human players.
              </p>
              {humanLinks.map(([tribe, url]) => (
                <div key={tribe} className="mw-invite-row">
                  <span className={`mw-tribe-name mw-tribe-${tribe}`}>
                    {tribeLabel(tribe as Tribe)}
                  </span>
                  <code className="mw-invite-url">{url}</code>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(url)}
                  >
                    Copy
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mw-result-actions">
            <button
              type="button"
              className="primary"
              onClick={() => nav(`/watch/${result.matchId}`)}
            >
              Watch match
            </button>
            <button
              type="button"
              onClick={() => setResult(null)}
            >
              Create another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-create">
      <MatchWizard
        onCreated={(response, playPath) => {
          if (playPath) {
            nav(playPath);
            return;
          }
          if (!response.autoPlay && Object.keys(response.inviteLinks).some((k) => response.inviteLinks[k as Tribe])) {
            setResult(response);
            return;
          }
          const spectatorPath = new URL(response.spectatorUrl).pathname;
          nav(spectatorPath);
        }}
      />
    </div>
  );
}
