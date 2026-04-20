import { normalizeReplayPayload } from "./normalizeReplayPayload.js";
import type { ReplayPayload } from "./types.js";

interface ReplayFileLoaderProps {
  onLoad: (payload: ReplayPayload) => void;
}

export function ReplayFileLoader({ onLoad }: ReplayFileLoaderProps) {
  return (
    <label className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span className="muted" style={{ fontSize: 12 }}>
        Load replay JSON
      </span>
      <input
        type="file"
        accept="application/json,.json"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            const text = await file.text();
            const raw = JSON.parse(text) as unknown;
            onLoad(normalizeReplayPayload(raw));
          } catch (err) {
            window.alert(
              `Failed to load replay: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }}
      />
    </label>
  );
}
