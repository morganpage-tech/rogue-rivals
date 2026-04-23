import type { MapPreset, Order, ProjectedView, Tribe } from "./engineTypes.js";
import type { SpectatorView } from "./spectator.js";

/** LLM slot: API keys come from process env on the server (see @rr/llm / README). */
export interface LlmSlotConfig {
  readonly persona?: string;
  readonly systemPrompt?: string;
}

export interface SlotConfig {
  readonly tribe: Tribe;
  readonly type: "human" | "llm" | "pass";
  readonly displayName?: string;
  readonly llmConfig?: LlmSlotConfig;
}

export interface CreateMatchRequest {
  readonly seed?: number;
  readonly mapPreset: MapPreset;
  readonly tribes: Tribe[];
  readonly slots: SlotConfig[];
  readonly tickTimeoutSeconds?: number;
  readonly tickLimit?: number;
}

export interface CreateMatchResponse {
  readonly matchId: string;
  readonly spectatorUrl: string;
  readonly inviteLinks: Record<Tribe, string>;
  readonly autoPlay: boolean;
}

export interface JoinMatchRequest {
  readonly tribe: Tribe;
  readonly displayName: string;
}

export interface JoinMatchResponse {
  readonly tribe: Tribe;
  readonly token: string;
  readonly playUrl: string;
}

export interface SubmitOrdersRequest {
  readonly orders: Order[];
  readonly tick: number;
  readonly clientPacketId: string;
}

export type SubmitOrdersResponse =
  | { readonly status: "accepted"; readonly pendingTribes: Tribe[] }
  | { readonly status: "duplicate"; readonly pendingTribes?: Tribe[] }
  | { readonly status: "resolved"; readonly view: ProjectedView | undefined };

export interface SpectatorGetResponse {
  readonly spectatorView: SpectatorView;
}

export interface PlayerMatchView {
  readonly view: ProjectedView;
  readonly submittedThisTick: boolean;
  readonly waitingFor: Tribe[];
  readonly matchStatus: string;
}

/** Server match JSONL on disk vs in-memory tick buffer (debugging / spectator). */
export interface MatchLogStatusResponse {
  readonly dataDir: string;
  readonly absolutePath: string;
  readonly tickRecordsOnDisk: number;
  readonly tickBufferLength: number;
  readonly inSync: boolean;
}

export interface SharedMatchSummary {
  readonly matchId: string;
  readonly status: "lobby" | "running" | "finished" | "paused";
  readonly tick: number;
  readonly tickLimit: number;
  readonly tribesAlive: Tribe[];
  readonly winner: Tribe | Tribe[] | null;
  readonly mapPreset: MapPreset;
  readonly autoPlay: boolean;
  readonly createdAt: string | null;
}
