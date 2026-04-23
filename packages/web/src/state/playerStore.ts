import { create } from "zustand";

import type { Order, ProjectedView, Tribe } from "@rr/shared";
import type { SubmitOrdersResponse } from "@rr/shared";

import { apiUrl, wsUrl } from "../config.js";

function randomPacketId(): string {
  return crypto.randomUUID();
}

export interface PlayerStore {
  matchId: string | null;
  tribe: Tribe | null;
  token: string | null;
  view: ProjectedView | null;
  chosenIds: string[];
  messageTo: Tribe;
  messageText: string;
  submittedThisTick: boolean;
  waitingFor: Tribe[];
  connection: "disconnected" | "connecting" | "connected";
  busy: boolean;
  error: string | null;
  pendingPacketId: string | null;
  pendingForTick: number | null;
  ws: WebSocket | null;

  restoreFromUrl(matchId: string, token: string): void;
  connect(): void;
  disconnect(): void;
  submitOrders(orders: Order[]): Promise<void>;
  toggleOrder(id: string): void;
  clearOrders(): void;
  setMessageTo(tribe: Tribe): void;
  setMessageText(text: string): void;
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  matchId: null,
  tribe: null,
  token: null,
  view: null,
  chosenIds: [],
  messageTo: "grey",
  messageText: "",
  submittedThisTick: false,
  waitingFor: [],
  connection: "disconnected",
  busy: false,
  error: null,
  pendingPacketId: null,
  pendingForTick: null,
  ws: null,

  restoreFromUrl(matchId, token) {
    set({ matchId, token });
  },

  connect() {
    const { matchId, token } = get();
    if (!matchId || !token) return;
    const lockedMatchId = matchId;
    get().disconnect();
    set({ connection: "connecting" });
    void (async () => {
      try {
        const snap = await fetch(apiUrl(`/api/matches/${lockedMatchId}`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (snap.ok) {
          const j = (await snap.json()) as { matchStatus?: string };
          if (j.matchStatus === "paused") {
            await fetch(apiUrl(`/api/matches/${lockedMatchId}/resume`), { method: "POST" });
          }
        }
      } catch {
        /* non-fatal; server may be older */
      }
      if (get().matchId !== lockedMatchId) return;
      const ws = new WebSocket(wsUrl(`/ws/play?matchId=${encodeURIComponent(matchId)}`));
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "auth", token }));
      };
      ws.onmessage = (ev) => {
        if (get().matchId !== lockedMatchId) return;
        const msg = JSON.parse(ev.data as string) as {
          type?: string;
          projectedView?: ProjectedView;
          tick?: number;
          tribes?: Tribe[];
        };
        if (msg.type === "view" && msg.projectedView) {
          set({
            view: msg.projectedView,
            connection: "connected",
            chosenIds: [],
            submittedThisTick: false,
            pendingPacketId: null,
            pendingForTick: null,
            waitingFor: [],
          });
        } else if (msg.type === "waiting_for" && msg.tribes) {
          set({ waitingFor: msg.tribes });
        }
      };
      ws.onclose = () => {
        if (get().matchId !== lockedMatchId) return;
        set({ ws: null, connection: "disconnected" });
      };
      set({ ws });
    })();
  },

  disconnect() {
    const w = get().ws;
    if (w) w.close();
    set({ ws: null, connection: "disconnected" });
  },

  async submitOrders(orders: Order[]) {
    const st = get();
    if (!st.matchId || !st.token || !st.view) return;
    const view = st.view;
    let packetId = st.pendingPacketId;
    if (
      packetId &&
      st.pendingForTick === view.tick
    ) {
      /* retry */
    } else {
      packetId = randomPacketId();
      set({ pendingPacketId: packetId, pendingForTick: view.tick });
    }
    set({ busy: true, error: null });
    try {
      const res = await fetch(apiUrl(`/api/matches/${st.matchId}/orders`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${st.token}`,
        },
        body: JSON.stringify({
          orders,
          tick: view.tick,
          clientPacketId: packetId,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const body = (await res.json()) as SubmitOrdersResponse;
      if (body.status === "accepted") {
        set({ submittedThisTick: true, waitingFor: body.pendingTribes });
      } else if (body.status === "resolved" && body.view) {
        set({
          view: body.view,
          chosenIds: [],
          submittedThisTick: false,
          pendingPacketId: null,
          pendingForTick: null,
          waitingFor: [],
        });
      }
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ busy: false });
    }
  },

  toggleOrder(id: string) {
    set((s) => ({
      chosenIds: s.chosenIds.includes(id)
        ? s.chosenIds.filter((x) => x !== id)
        : [...s.chosenIds, id],
    }));
  },

  clearOrders() {
    set({ chosenIds: [] });
  },

  setMessageTo(tribe) {
    set({ messageTo: tribe });
  },

  setMessageText(text) {
    set({ messageText: text });
  },
}));
