/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import type { SpectatorView } from "@rr/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { useSpectatorCurrentView, useSpectatorStore } from "./spectatorStore.js";

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

describe("useSpectatorCurrentView (React)", () => {
  beforeEach(() => {
    resetStore();
  });

  it("returns the snapshot at currentTickIndex and updates when goToTick runs", () => {
    const t0 = viewTick(10);
    const t1 = viewTick(11);
    useSpectatorStore.setState({ ticks: [t0, t1], currentTickIndex: 1 });

    const { result } = renderHook(() => useSpectatorCurrentView());
    expect(result.current).toBe(t1);

    act(() => {
      useSpectatorStore.getState().goToTick(0);
    });
    expect(result.current).toBe(t0);

    act(() => {
      useSpectatorStore.getState().goToTick(1);
    });
    expect(result.current).toBe(t1);
  });

  it("updates when the tick list grows and the index follows the latest frame", () => {
    const first = viewTick(1);
    useSpectatorStore.setState({ ticks: [first], currentTickIndex: 0, isPaused: false, isLive: true });

    const { result } = renderHook(() => useSpectatorCurrentView());
    expect(result.current).toBe(first);

    const second = viewTick(2);
    act(() => {
      useSpectatorStore.setState((s) => ({
        ticks: [...s.ticks, second],
        currentTickIndex: 1,
      }));
    });
    expect(result.current).toBe(second);
  });

  it("returns null while there is no history", () => {
    const { result } = renderHook(() => useSpectatorCurrentView());
    expect(result.current).toBeNull();
  });
});
