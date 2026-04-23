import { describe, expect, it, beforeEach, vi } from "vitest";
import type { ProjectedView } from "@rr/shared";

import { usePlayerStore } from "./playerStore.js";

vi.mock("../config.js", () => ({
  apiUrl: (path: string) => `http://localhost${path}`,
  wsUrl: (path: string) => `ws://localhost${path}`,
}));

function makeView(tick: number): ProjectedView {
  return {
    tick,
    forTribe: "orange",
    visibleRegions: {},
    visibleForces: [],
    visibleTransits: [],
    visibleScouts: [],
    myPlayerState: {
      tribe: "orange",
      influence: 10,
      reputationPenaltyExpiresTick: 0,
      inbox: [],
      outstandingProposals: [],
    },
    myForces: [],
    myScouts: [],
    myCaravans: [],
    inboxNew: [],
    announcementsNew: [],
    pactsInvolvingMe: [],
    legalOrderOptions: [],
    tribesAlive: [],
    tickLimit: 60,
  };
}

describe("usePlayerStore", () => {
  beforeEach(() => {
    usePlayerStore.setState({
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
    });
    vi.restoreAllMocks();
  });

  it("restoreFromUrl sets matchId and token", () => {
    usePlayerStore.getState().restoreFromUrl("match-1", "token-abc");
    const state = usePlayerStore.getState();
    expect(state.matchId).toBe("match-1");
    expect(state.token).toBe("token-abc");
  });

  it("toggleOrder adds an id", () => {
    usePlayerStore.getState().toggleOrder("opt-1");
    expect(usePlayerStore.getState().chosenIds).toContain("opt-1");
  });

  it("toggleOrder removes an existing id", () => {
    usePlayerStore.getState().toggleOrder("opt-1");
    usePlayerStore.getState().toggleOrder("opt-1");
    expect(usePlayerStore.getState().chosenIds).not.toContain("opt-1");
  });

  it("toggleOrder handles multiple ids", () => {
    usePlayerStore.getState().toggleOrder("opt-1");
    usePlayerStore.getState().toggleOrder("opt-2");
    expect(usePlayerStore.getState().chosenIds).toEqual(["opt-1", "opt-2"]);
  });

  it("clearOrders empties chosenIds", () => {
    usePlayerStore.getState().toggleOrder("opt-1");
    usePlayerStore.getState().toggleOrder("opt-2");
    usePlayerStore.getState().clearOrders();
    expect(usePlayerStore.getState().chosenIds).toEqual([]);
  });

  it("setMessageTo updates tribe", () => {
    usePlayerStore.getState().setMessageTo("brown");
    expect(usePlayerStore.getState().messageTo).toBe("brown");
  });

  it("setMessageText updates text", () => {
    usePlayerStore.getState().setMessageText("hello");
    expect(usePlayerStore.getState().messageText).toBe("hello");
  });

  it("disconnect sets connection to disconnected", () => {
    usePlayerStore.setState({ connection: "connected" });
    usePlayerStore.getState().disconnect();
    expect(usePlayerStore.getState().connection).toBe("disconnected");
    expect(usePlayerStore.getState().ws).toBeNull();
  });

  it("connect does nothing without matchId and token", () => {
    usePlayerStore.getState().connect();
    expect(usePlayerStore.getState().connection).toBe("disconnected");
  });

  describe("submitOrders", () => {
    function seedForSubmit(tick = 1) {
      usePlayerStore.setState({
        matchId: "m1",
        token: "tok",
        view: makeView(tick),
        chosenIds: ["opt-1"],
        pendingPacketId: null,
        pendingForTick: null,
      });
    }

    function mockFetchResponse(body: unknown) {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => body,
      } as Response);
    }

    it("sets submittedThisTick when accepted", async () => {
      seedForSubmit();
      mockFetchResponse({ status: "accepted", pendingTribes: [] });

      await usePlayerStore.getState().submitOrders([]);

      expect(usePlayerStore.getState().submittedThisTick).toBe(true);
      expect(usePlayerStore.getState().busy).toBe(false);
      expect(usePlayerStore.getState().error).toBeNull();
    });

    it("sets waitingFor from pendingTribes when accepted", async () => {
      seedForSubmit();
      mockFetchResponse({ status: "accepted", pendingTribes: ["blue", "green"] });

      await usePlayerStore.getState().submitOrders([]);

      expect(usePlayerStore.getState().waitingFor).toEqual(["blue", "green"]);
    });

    it("updates view immediately when server resolves tick", async () => {
      seedForSubmit(1);
      const newView = makeView(2);
      mockFetchResponse({ status: "resolved", view: newView });

      await usePlayerStore.getState().submitOrders([]);

      const state = usePlayerStore.getState();
      expect(state.view).toBe(newView);
      expect(state.view?.tick).toBe(2);
      expect(state.chosenIds).toEqual([]);
      expect(state.submittedThisTick).toBe(false);
      expect(state.pendingPacketId).toBeNull();
      expect(state.pendingForTick).toBeNull();
      expect(state.waitingFor).toEqual([]);
    });

    it("sets error on fetch failure", async () => {
      seedForSubmit();
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network"));

      await usePlayerStore.getState().submitOrders([]);

      expect(usePlayerStore.getState().error).toBe("Error: network");
      expect(usePlayerStore.getState().busy).toBe(false);
    });

    it("sets error on non-ok response", async () => {
      seedForSubmit();
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        text: async () => "stale_tick",
      } as Response);

      await usePlayerStore.getState().submitOrders([]);

      expect(usePlayerStore.getState().error).toBe("Error: stale_tick");
    });
  });
});
