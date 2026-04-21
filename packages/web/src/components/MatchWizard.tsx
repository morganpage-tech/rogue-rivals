import { useState } from "react";

import type { CreateMatchRequest, MapPreset, Tribe } from "@rr/shared";

import { apiUrl } from "../config.js";

const DEFAULT_TRIBES: Tribe[] = ["orange", "grey", "brown", "red"];

export function MatchWizard(props: {
  onCreated: (matchId: string, spectatorPath: string) => void;
}) {
  const [mapPreset, setMapPreset] = useState<MapPreset>("hand_minimal");
  const [seed, setSeed] = useState<string>("");
  const [tickLimit, setTickLimit] = useState(60);
  const [persona, setPersona] = useState("warlord");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const tribes = DEFAULT_TRIBES;
      const body: CreateMatchRequest = {
        mapPreset,
        tribes,
        tickLimit,
        slots: tribes.map((tribe) => ({
          tribe,
          type: "llm" as const,
          llmConfig: {
            persona,
            ...(systemPrompt.trim() ? { systemPrompt: systemPrompt.trim() } : {}),
          },
        })),
        ...(seed.trim() ? { seed: Number(seed) } : {}),
      };
      const res = await fetch(apiUrl("/api/matches"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { matchId: string; spectatorUrl: string };
      const path = new URL(json.spectatorUrl).pathname;
      props.onCreated(json.matchId, path);
    } catch (ex) {
      setErr(String(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="match-wizard" onSubmit={(e) => void submit(e)}>
      <h2>Create match</h2>
      <label>
        Map preset{" "}
        <select
          value={mapPreset}
          onChange={(e) => setMapPreset(e.target.value as MapPreset)}
        >
          <option value="hand_minimal">hand_minimal</option>
          <option value="expanded">expanded</option>
          <option value="continent6p">continent6p</option>
        </select>
      </label>
      <label>
        Seed (optional){" "}
        <input value={seed} onChange={(e) => setSeed(e.target.value)} />
      </label>
      <label>
        Tick limit{" "}
        <input
          type="number"
          value={tickLimit}
          onChange={(e) => setTickLimit(Number(e.target.value))}
        />
      </label>
      <label>
        Persona id{" "}
        <input value={persona} onChange={(e) => setPersona(e.target.value)} placeholder="warlord" />
      </label>
      <label>
        Extra system prompt (optional){" "}
        <textarea
          style={{ width: "100%" }}
          rows={3}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
        />
      </label>
      <p className="hint">
        LLM API keys are configured on the game server via environment variables (see project README).
      </p>
      {err ? <p className="error">{err}</p> : null}
      <button type="submit" disabled={busy}>
        {busy ? "Creating…" : "Create & Watch"}
      </button>
    </form>
  );
}
