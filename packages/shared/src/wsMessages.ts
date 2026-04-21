import type { ProjectedView, Tribe } from "./engineTypes.js";
import type { SpectatorView } from "./spectator.js";

export type WsPlayerIn =
  | { type: "auth"; token: string }
  | { type: "heartbeat" };

export type WsPlayerOut =
  | { type: "view"; projectedView: ProjectedView; tick: number }
  | { type: "waiting_for"; tribes: Tribe[]; tick: number }
  | { type: "match_end"; winner: Tribe | Tribe[] | null }
  | { type: "error"; message: string };

export type WsSpectatorOut =
  | {
      type: "spectator_history";
      ticks: SpectatorView[];
      matchStatus: string;
    }
  | {
      type: "spectator_tick";
      view: SpectatorView;
      tickNumber: number;
    }
  | { type: "spectator_match_end"; winner: Tribe | Tribe[] | null }
  | { type: "error"; message: string };
