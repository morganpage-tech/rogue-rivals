import { describe, expect, it, beforeEach } from "vitest";

import type { SpectatorView } from "@rr/shared";

import {
  spectatorCurrentViewSelector,
  useSpectatorStore,
} from "./spectatorStore.js";

function viewTick(n: number): SpectatorView {
  return { tick: n } as SpectatorView;
}

function resetStore(): void {
  useSpectatorStore.setState({
    matchId: null,
    ticks: [],
    currentTickIndex: 0,
    isLive: true,
    isPaused: false,
    connection: "disconnected",
    ws: null,
  });
}

describe("spectatorCurrentViewSelector", () => {
  it("returns the snapshot at currentTickIndex", () => {
    const a = viewTick(1);
    const b = viewTick(2);
    const c = viewTick(3);
    expect(
      spectatorCurrentViewSelector({ ticks: [a, b, c], currentTickIndex: 1 }),
    ).toBe(b);
  });

  it("returns null when ticks is empty", () => {
    expect(spectatorCurrentViewSelector({ ticks: [], currentTickIndex: 0 })).toBeNull();
  });
});

describe("useSpectatorStore scrubbing", () => {
  beforeEach(() => {
    resetStore();
  });

  it("goToTick changes which frame spectatorCurrentViewSelector returns (matches currentView())", () => {
    const t0 = viewTick(10);
    const t1 = viewTick(11);
    const t2 = viewTick(12);
    useSpectatorStore.setState({
      ticks: [t0, t1, t2],
      currentTickIndex: 2,
    });

    const st = useSpectatorStore.getState();
    expect(spectatorCurrentViewSelector(st)).toBe(t2);
    expect(st.currentView()).toBe(t2);

    st.goToTick(0);
    const st0 = useSpectatorStore.getState();
    expect(spectatorCurrentViewSelector(st0)).toBe(t0);
    expect(st0.currentView()).toBe(t0);

    st0.goToTick(1);
    const st1 = useSpectatorStore.getState();
    expect(spectatorCurrentViewSelector(st1)).toBe(t1);
    expect(st1.currentView()).toBe(t1);
  });

  it("stepForward and stepBack move the selected frame", () => {
    useSpectatorStore.setState({
      ticks: [viewTick(0), viewTick(1), viewTick(2)],
      currentTickIndex: 0,
    });
    useSpectatorStore.getState().stepForward();
    expect(spectatorCurrentViewSelector(useSpectatorStore.getState())?.tick).toBe(1);
    useSpectatorStore.getState().stepForward();
    expect(spectatorCurrentViewSelector(useSpectatorStore.getState())?.tick).toBe(2);
    useSpectatorStore.getState().stepBack();
    expect(spectatorCurrentViewSelector(useSpectatorStore.getState())?.tick).toBe(1);
  });
});
