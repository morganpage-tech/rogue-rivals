import { create } from "zustand";

import type { SpectatorView } from "@rr/shared";
import type { WsSpectatorOut } from "@rr/shared";

import { wsUrl } from "../config.js";

export interface SpectatorStore {
  matchId: string | null;
  ticks: SpectatorView[];
  currentTickIndex: number;
  isLive: boolean;
  isPaused: boolean;
  connection: "disconnected" | "connecting" | "connected";
  ws: WebSocket | null;

  connect(matchId: string): void;
  disconnect(): void;
  pause(): void;
  play(): void;
  goToTick(index: number): void;
  stepForward(): void;
  stepBack(): void;
  currentView(): SpectatorView | null;
}

/** Pure selector — used by `useSpectatorCurrentView` and unit tests (scrub index + tick list). */
export function spectatorCurrentViewSelector(
  s: Pick<SpectatorStore, "ticks" | "currentTickIndex">,
): SpectatorView | null {
  return s.ticks[s.currentTickIndex] ?? null;
}

export const useSpectatorStore = create<SpectatorStore>((set, get) => ({
  matchId: null,
  ticks: [],
  currentTickIndex: 0,
  isLive: true,
  isPaused: false,
  connection: "disconnected",
  ws: null,

  connect(matchId: string) {
    get().disconnect();
    set({
      connection: "connecting",
      matchId,
      ticks: [],
      currentTickIndex: 0,
      isLive: true,
      isPaused: false,
    });
    const ws = new WebSocket(wsUrl(`/ws/spectator?matchId=${encodeURIComponent(matchId)}`));
    ws.onopen = () => set({ connection: "connected" });
    ws.onmessage = (ev) => {
      if (get().matchId !== matchId) return;
      const msg = JSON.parse(ev.data as string) as WsSpectatorOut;
      if (msg.type === "spectator_history") {
        const ticks = msg.ticks;
        set({
          ticks,
          currentTickIndex: Math.max(0, ticks.length - 1),
          isLive: true,
        });
      } else if (msg.type === "spectator_tick") {
        set((s) => {
          const ticks = [...s.ticks, msg.view];
          const nextIndex =
            s.isLive && !s.isPaused ? ticks.length - 1 : s.currentTickIndex;
          return { ticks, currentTickIndex: nextIndex };
        });
      } else if (msg.type === "spectator_match_end") {
        set({ isLive: false });
      }
    };
    ws.onclose = () => {
      if (get().matchId !== matchId) return;
      set({ connection: "disconnected", ws: null });
    };
    set({ ws });
  },

  disconnect() {
    const w = get().ws;
    if (w) w.close();
    set({
      ws: null,
      connection: "disconnected",
      matchId: null,
      ticks: [],
      currentTickIndex: 0,
      isLive: true,
      isPaused: false,
    });
  },

  pause() {
    set({ isPaused: true });
  },

  play() {
    set({ isPaused: false, isLive: true, currentTickIndex: get().ticks.length - 1 });
  },

  goToTick(index: number) {
    const { ticks } = get();
    set({
      currentTickIndex: Math.max(0, Math.min(index, ticks.length - 1)),
    });
  },

  stepForward() {
    const { ticks, currentTickIndex } = get();
    set({ currentTickIndex: Math.min(currentTickIndex + 1, ticks.length - 1) });
  },

  stepBack() {
    const { currentTickIndex } = get();
    set({ currentTickIndex: Math.max(0, currentTickIndex - 1) });
  },

  currentView() {
    const { ticks, currentTickIndex } = get();
    return ticks[currentTickIndex] ?? null;
  },
}));

/**
 * Selected history frame for the current scrub index.
 *
 * Uses **two** subscriptions (`currentTickIndex` + `ticks`). A single selector
 * `ticks[i]` re-subscribes only on the selected value: if `ticks[i]===ticks[j]`
 * (same ref at two indices), scrubbing i→j does not re-render — the map stays
 * stale while the slider moves.
 */
export function useSpectatorCurrentView(): SpectatorView | null {
  const tickIndex = useSpectatorStore((s) => s.currentTickIndex);
  const ticks = useSpectatorStore((s) => s.ticks);
  return ticks[tickIndex] ?? null;
}
