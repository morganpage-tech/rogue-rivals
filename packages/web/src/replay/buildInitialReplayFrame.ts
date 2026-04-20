import type { GameState, OrderPacket, ProjectedView, Tribe } from "@rr/engine2";
import { hashState } from "@rr/engine2";
import { buildReplayFrameFromTs } from "./buildReplayFrameFromTs.js";

export function buildInitialReplayFrame(
  state: GameState,
  projectedViews: Readonly<Record<Tribe, ProjectedView>>,
): ReturnType<typeof buildReplayFrameFromTs> {
  const packets = {} as Record<Tribe, OrderPacket>;
  for (const t of state.tribesAlive) {
    packets[t] = { tribe: t, tick: state.tick, orders: [] };
  }
  return buildReplayFrameFromTs({
    label: "Initial state",
    state,
    stateHash: hashState(state),
    packets,
    events: [],
    projectedViews,
  });
}
