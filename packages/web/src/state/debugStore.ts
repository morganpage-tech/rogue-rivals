import { create } from "zustand";

import type { TickDebug, WsDebugOut } from "@rr/shared";

import { wsUrl } from "../config.js";

export interface DebugStore {
  matchId: string | null;
  ticks: TickDebug[];
  connection: "disconnected" | "connecting" | "connected";
  ws: WebSocket | null;

  connect(matchId: string): void;
  disconnect(): void;
}

export const useDebugStore = create<DebugStore>((set, get) => ({
  matchId: null,
  ticks: [],
  connection: "disconnected",
  ws: null,

  connect(matchId: string) {
    get().disconnect();
    set({
      connection: "connecting",
      matchId,
      ticks: [],
    });
    const ws = new WebSocket(wsUrl(`/ws/debug?matchId=${encodeURIComponent(matchId)}`));
    ws.onopen = () => set({ connection: "connected" });
    ws.onmessage = (ev) => {
      if (get().matchId !== matchId) return;
      const msg = JSON.parse(ev.data as string) as WsDebugOut;
      if (msg.type === "debug_history") {
        set({ ticks: msg.ticks });
      } else if (msg.type === "debug_tick") {
        set((s) => ({ ticks: [...s.ticks, msg.tick] }));
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
    });
  },
}));

export function useDebugTickForIndex(
  tickIndex: number,
): TickDebug | null {
  const ticks = useDebugStore((s) => s.ticks);
  return ticks[tickIndex] ?? null;
}
