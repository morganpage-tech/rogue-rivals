import { describe, expect, it, beforeEach } from "vitest";
import { usePlayerStore } from "./playerStore.js";
import type { PlayerStore } from "./playerStore.js";

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
});
