/** @vitest-environment jsdom */

/**
 * Regression: scrubbing history must update the UI even when two frames share the
 * same object reference in `ticks[]`. A Zustand selector that only returns `ticks[i]`
 * uses `Object.is` — identical refs across indices suppress re-renders. WatchMatch
 * `useMemo(..., [v])` must also depend on `currentTickIndex` when `v` can alias.
 */

import { act, render } from "@testing-library/react";
import type { SpectatorView } from "@rr/shared";
import { createElement, useMemo } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => {
  resetStore();
});

describe("spectator scrub + shared frame refs", () => {
  it("re-renders useSpectatorCurrentView when currentTickIndex changes even if ticks[0]===ticks[1]", () => {
    const shared = viewTick(42);
    useSpectatorStore.setState({ ticks: [shared, shared], currentTickIndex: 0 });

    let renderCount = 0;
    function Probe(): null {
      renderCount++;
      useSpectatorCurrentView();
      return null;
    }

    render(createElement(Probe));
    expect(renderCount).toBe(1);

    act(() => {
      useSpectatorStore.getState().goToTick(1);
    });

    expect(useSpectatorStore.getState().currentTickIndex).toBe(1);
    expect(renderCount).toBe(2);
  });

  it("WatchMatch-style useMemo must list currentTickIndex, not only v, when frames can alias", () => {
    const shared = viewTick(1);
    useSpectatorStore.setState({ ticks: [shared, shared], currentTickIndex: 0 });

    const computeBad = vi.fn();
    const computeGood = vi.fn();

    function MemoProbe(): null {
      const v = useSpectatorCurrentView();
      const tickIndex = useSpectatorStore((s) => s.currentTickIndex);
      useMemo(() => {
        computeBad();
        return v?.tick ?? -1;
      }, [v]);
      useMemo(() => {
        computeGood();
        return v?.tick ?? -1;
      }, [v, tickIndex]);
      return null;
    }

    render(createElement(MemoProbe));
    expect(computeBad).toHaveBeenCalledTimes(1);
    expect(computeGood).toHaveBeenCalledTimes(1);

    act(() => {
      useSpectatorStore.getState().goToTick(1);
    });

    expect(computeBad).toHaveBeenCalledTimes(1);
    expect(computeGood).toHaveBeenCalledTimes(2);
  });
});
