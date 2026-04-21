import type { ResolutionEvent, Tribe } from "./engineTypes.js";

export interface LlmDecisionDebug {
  readonly tribe: Tribe;
  readonly persona: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly rawResponse: string;
  readonly choose: string[];
  readonly messages: readonly { to: string; text: string }[];
  readonly usage: {
    readonly input_tokens: number;
    readonly output_tokens: number;
    readonly latency_ms: number;
    readonly model: string;
    readonly provider: string;
  };
  readonly error?: string;
}

export interface TickDebug {
  readonly tick: number;
  readonly decisions: readonly LlmDecisionDebug[];
  readonly orderSummary: Record<string, string[]>;
  readonly events: readonly ResolutionEvent[];
  readonly stateHash: string;
}

export type WsDebugOut =
  | { type: "debug_history"; ticks: TickDebug[]; matchStatus: string }
  | { type: "debug_tick"; tick: TickDebug }
  | { type: "debug_match_end"; winner: Tribe | Tribe[] | null }
  | { type: "error"; message: string };
