import { create } from "zustand";

import type { OrderPacket, SpectatorView, Tribe } from "@rr/shared";

import { apiUrl } from "../config.js";

export interface SandboxFrame {
  tickNumber: number;
  stateHash: string;
  spectatorView: SpectatorView;
  events: Array<Record<string, unknown>>;
  packetsByTribe: Record<Tribe, OrderPacket>;
}

export interface DebugSandboxStore {
  sandboxId: string | null;
  sourceMatchId: string | null;
  forkedAtTick: number;
  frames: SandboxFrame[];
  currentFrameIndex: number;
  loading: boolean;
  error: string | null;

  fork(matchId: string, forkAtTick: number): Promise<void>;
  step(packetsByTribe: Record<Tribe, OrderPacket>): Promise<void>;
  resimulate(
    alternateOrders: Record<number, Record<Tribe, OrderPacket>>,
    untilTick: number,
  ): Promise<void>;
  goToFrame(index: number): void;
  stepForward(): void;
  stepBack(): void;
  discard(): Promise<void>;
  currentFrame(): SandboxFrame | null;
}

export const useDebugSandboxStore = create<DebugSandboxStore>((set, get) => ({
  sandboxId: null,
  sourceMatchId: null,
  forkedAtTick: 0,
  frames: [],
  currentFrameIndex: -1,
  loading: false,
  error: null,

  async fork(matchId, forkAtTick) {
    set({ loading: true, error: null });
    try {
      const res = await fetch(apiUrl(`/api/debug/matches/${encodeURIComponent(matchId)}/fork`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forkAtTick }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        set({ loading: false, error: body.error ?? `HTTP ${res.status}` });
        return;
      }
      const body = (await res.json()) as {
        sandboxId: string;
        sourceMatchId: string;
        forkedAtTick: number;
        currentTick: number;
        tribesAlive: Tribe[];
        winner: Tribe | Tribe[] | null;
      };
      set({
        sandboxId: body.sandboxId,
        sourceMatchId: body.sourceMatchId,
        forkedAtTick: body.forkedAtTick,
        frames: [],
        currentFrameIndex: -1,
        loading: false,
        error: null,
      });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  async step(packetsByTribe) {
    const { sandboxId } = get();
    if (!sandboxId) return;
    set({ loading: true, error: null });
    try {
      const res = await fetch(apiUrl(`/api/debug/sandbox/${encodeURIComponent(sandboxId)}/step`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packetsByTribe }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        set({ loading: false, error: body.error ?? `HTTP ${res.status}` });
        return;
      }
      const body = (await res.json()) as {
        frame: SandboxFrame;
        currentTick: number;
        winner: Tribe | Tribe[] | null;
      };
      set((s) => ({
        frames: [...s.frames, body.frame],
        currentFrameIndex: s.frames.length,
        loading: false,
      }));
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  async resimulate(alternateOrders, untilTick) {
    const { sandboxId } = get();
    if (!sandboxId) return;
    set({ loading: true, error: null });
    try {
      const res = await fetch(
        apiUrl(`/api/debug/sandbox/${encodeURIComponent(sandboxId)}/resimulate`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alternateOrders, untilTick }),
        },
      );
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        set({ loading: false, error: body.error ?? `HTTP ${res.status}` });
        return;
      }
      const body = (await res.json()) as {
        frames: SandboxFrame[];
        currentTick: number;
        winner: Tribe | Tribe[] | null;
        totalFrames: number;
      };
      set({
        frames: body.frames,
        currentFrameIndex: body.frames.length - 1,
        loading: false,
      });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  goToFrame(index) {
    const { frames } = get();
    set({ currentFrameIndex: Math.max(-1, Math.min(index, frames.length - 1)) });
  },

  stepForward() {
    const { frames, currentFrameIndex } = get();
    set({ currentFrameIndex: Math.min(currentFrameIndex + 1, frames.length - 1) });
  },

  stepBack() {
    const { currentFrameIndex } = get();
    set({ currentFrameIndex: Math.max(-1, currentFrameIndex - 1) });
  },

  async discard() {
    const { sandboxId } = get();
    if (sandboxId) {
      try {
        await fetch(apiUrl(`/api/debug/sandbox/${encodeURIComponent(sandboxId)}`), {
          method: "DELETE",
        });
      } catch {
        /* ignore */
      }
    }
    set({
      sandboxId: null,
      sourceMatchId: null,
      forkedAtTick: 0,
      frames: [],
      currentFrameIndex: -1,
      loading: false,
      error: null,
    });
  },

  currentFrame() {
    const { frames, currentFrameIndex } = get();
    if (currentFrameIndex < 0 || currentFrameIndex >= frames.length) return null;
    return frames[currentFrameIndex];
  },
}));

export function useSandboxCurrentView(): SpectatorView | null {
  const idx = useDebugSandboxStore((s) => s.currentFrameIndex);
  const frames = useDebugSandboxStore((s) => s.frames);
  if (idx < 0 || idx >= frames.length) return null;
  return frames[idx].spectatorView;
}
