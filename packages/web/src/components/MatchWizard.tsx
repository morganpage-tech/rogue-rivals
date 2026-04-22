import { useMemo, useState } from "react";

import type {
  CreateMatchRequest,
  CreateMatchResponse,
  MapPreset,
  SlotConfig,
  Tribe,
} from "@rr/shared";

import { apiUrl } from "../config.js";

const TRIBES_4P: Tribe[] = ["orange", "grey", "brown", "red"];
const TRIBES_6P: Tribe[] = [
  "arctic",
  "tricoloured",
  "red",
  "brown",
  "orange",
  "grey",
];

const PRESET_TRIBES: Record<MapPreset, Tribe[]> = {
  hand_minimal: TRIBES_4P,
  expanded: TRIBES_4P,
  continent6p: TRIBES_6P,
  procedural: TRIBES_4P,
};

const PERSONA_OPTIONS = [
  "warlord",
  "merchant",
  "paranoid",
  "opportunist",
  "kingmaker",
  "random",
];

type SlotType = "llm" | "human" | "pass";

interface TribeSlotState {
  enabled: boolean;
  type: SlotType;
  persona: string;
  systemPrompt: string;
  displayName: string;
  isMe: boolean;
}

function defaultSlot(_tribe: Tribe): TribeSlotState {
  return {
    enabled: true,
    type: "llm",
    persona: "warlord",
    systemPrompt: "",
    displayName: "",
    isMe: false,
  };
}

function tribeLabel(t: Tribe): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function MatchWizard(props: {
  onCreated: (
    response: CreateMatchResponse,
    playPath: string | null,
  ) => void;
}) {
  const [mapPreset, setMapPreset] = useState<MapPreset>("continent6p");
  const [seed, setSeed] = useState("");
  const [tickLimit, setTickLimit] = useState(60);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const tribes = useMemo(() => PRESET_TRIBES[mapPreset] ?? TRIBES_4P, [mapPreset]);

  const [slots, setSlots] = useState<Record<Tribe, TribeSlotState>>(() =>
    buildDefaultSlots("continent6p"),
  );

  function resetSlots(preset: MapPreset): void {
    setSlots(buildDefaultSlots(preset));
  }

  function updateSlot(
    tribe: Tribe,
    patch: Partial<TribeSlotState>,
  ): void {
    setSlots((prev) => {
      const next = { ...prev, [tribe]: { ...prev[tribe], ...patch } };

      if (patch.isMe === true) {
        for (const t of Object.keys(next) as Tribe[]) {
          if (t !== tribe) next[t] = { ...next[t], isMe: false };
        }
      }

      if (patch.type === "llm") {
        next[tribe] = { ...next[tribe], isMe: false };
      }

      return next;
    });
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setErr(null);

    try {
      const enabledTribes = tribes.filter((t) => slots[t].enabled);
      if (enabledTribes.length < 2) {
        setErr("At least 2 tribes must be enabled.");
        setBusy(false);
        return;
      }

      const slotConfigs: SlotConfig[] = enabledTribes.map((tribe) => {
        const s = slots[tribe];
        const base: SlotConfig = {
          tribe,
          type: s.type,
          ...(s.type === "human" && s.displayName.trim()
            ? { displayName: s.displayName.trim() }
            : {}),
          ...(s.type === "llm"
            ? {
                llmConfig: {
                  persona: s.persona,
                  ...(s.systemPrompt.trim()
                    ? { systemPrompt: s.systemPrompt.trim() }
                    : {}),
                },
              }
            : {}),
        };
        return base;
      });

      const body: CreateMatchRequest = {
        mapPreset,
        tribes: enabledTribes,
        tickLimit,
        slots: slotConfigs,
        ...(seed.trim() ? { seed: Number(seed) } : {}),
      };

      const res = await fetch(apiUrl("/api/matches"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(await res.text());

      const json = (await res.json()) as CreateMatchResponse;

      let playPath: string | null = null;
      if (!json.autoPlay) {
        const myTribe = enabledTribes.find((t) => slots[t].isMe);
        if (myTribe && json.inviteLinks[myTribe]) {
          const inviteUrl = new URL(json.inviteLinks[myTribe]);
          playPath = inviteUrl.pathname + inviteUrl.search;
        }
      }

      props.onCreated(json, playPath);
    } catch (ex) {
      setErr(String(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="match-wizard" onSubmit={(e) => void submit(e)}>
      <h2>Create match</h2>

      <div className="mw-row">
        <label>
          Map preset
          <select
            value={mapPreset}
            onChange={(e) => {
              const v = e.target.value as MapPreset;
              setMapPreset(v);
              resetSlots(v);
            }}
          >
            <option value="continent6p">Continent 6P</option>
            <option value="hand_minimal">Hand Minimal (4P)</option>
            <option value="expanded">Expanded (4P)</option>
          </select>
        </label>
        <label>
          Seed (optional)
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="random"
          />
        </label>
        <label>
          Tick limit
          <input
            type="number"
            value={tickLimit}
            onChange={(e) => setTickLimit(Number(e.target.value))}
          />
        </label>
      </div>

      <table className="mw-tribes">
        <thead>
          <tr>
            <th>Tribe</th>
            <th>In?</th>
            <th>Type</th>
            <th>Config</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {tribes.map((tribe) => {
            const s = slots[tribe];
            return (
              <tr key={tribe} className={!s.enabled ? "mw-disabled" : ""}>
                <td>
                  <span className={`mw-tribe-name mw-tribe-${tribe}`}>
                    {tribeLabel(tribe)}
                  </span>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={(e) =>
                      updateSlot(tribe, { enabled: e.target.checked })
                    }
                  />
                </td>
                <td>
                  <select
                    value={s.type}
                    onChange={(e) =>
                      updateSlot(tribe, {
                        type: e.target.value as SlotType,
                      })
                    }
                    disabled={!s.enabled}
                  >
                    <option value="llm">LLM</option>
                    <option value="human">Human</option>
                    <option value="pass">Pass</option>
                  </select>
                </td>
                <td>
                  {s.enabled && s.type === "llm" && (
                    <div className="mw-llm-cfg">
                      <select
                        value={s.persona}
                        onChange={(e) =>
                          updateSlot(tribe, { persona: e.target.value })
                        }
                      >
                        {PERSONA_OPTIONS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                      <input
                        placeholder="Extra system prompt"
                        value={s.systemPrompt}
                        onChange={(e) =>
                          updateSlot(tribe, { systemPrompt: e.target.value })
                        }
                      />
                    </div>
                  )}
                  {s.enabled && s.type === "human" && (
                    <div className="mw-human-cfg">
                      <input
                        placeholder="Display name"
                        value={s.displayName}
                        onChange={(e) =>
                          updateSlot(tribe, { displayName: e.target.value })
                        }
                      />
                      <label className="mw-me-label">
                        <input
                          type="checkbox"
                          checked={s.isMe}
                          onChange={(e) =>
                            updateSlot(tribe, { isMe: e.target.checked })
                          }
                        />
                        I am playing
                      </label>
                    </div>
                  )}
                </td>
                <td>
                  {s.enabled && s.type === "human" && s.isMe && (
                    <span className="mw-me-badge">You</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="hint">
        LLM API keys are configured on the game server via environment
        variables.
      </p>

      {err && <p className="error">{err}</p>}

      <button type="submit" className="primary" disabled={busy}>
        {busy ? "Creating…" : "Create match"}
      </button>
    </form>
  );
}

function buildDefaultSlots(preset: MapPreset): Record<Tribe, TribeSlotState> {
  const ts = PRESET_TRIBES[preset] ?? TRIBES_4P;
  const out: Partial<Record<Tribe, TribeSlotState>> = {};
  for (const t of ts) out[t] = defaultSlot(t);
  return out as Record<Tribe, TribeSlotState>;
}
