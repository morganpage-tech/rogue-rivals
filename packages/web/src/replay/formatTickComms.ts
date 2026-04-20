import type { TickSummary } from "./types.js";
import { describeReplayEvent } from "./describeReplayEvent.js";

export function formatTickComms(summary: TickSummary): { messages: string[]; diplomacy: string[] } {
  const messages: string[] = [];
  for (const m of summary.messages as { from?: string; to?: string; text?: string }[]) {
    const from = m.from ?? "?";
    const to = m.to ?? "?";
    const text = m.text ?? "";
    messages.push(`${from} → ${to}: ${text}`);
  }

  const diplomacy: string[] = [];
  for (const entry of summary.diplomacy as Record<string, unknown>[]) {
    if (!entry || typeof entry !== "object") continue;
    const k = String(entry.kind ?? "");
    if (k === "proposal_order") {
      let line = `${entry.from} proposes ${entry.proposal_kind} to ${entry.to}`;
      if (entry.length_ticks != null) line += ` for ${entry.length_ticks} ticks`;
      if (entry.amount_influence != null) line += ` (${entry.amount_influence} Influence)`;
      diplomacy.push(line);
    } else if (k === "respond_order") {
      diplomacy.push(`${entry.from} responds ${entry.response} to ${entry.proposal_id}`);
    } else {
      diplomacy.push(describeReplayEvent(entry));
    }
  }

  return { messages, diplomacy };
}
