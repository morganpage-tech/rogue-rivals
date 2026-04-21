import type { OrderPacket, ProjectedView, Tribe } from "@rr/shared";

import { buildReplayFrameFromTs } from "./buildReplayFrameFromTs.js";
import type { ParsedReplayState } from "./parseReplayStateSnapshot.js";

export function buildInitialReplayFrame(
  state: ParsedReplayState,
  projectedViews: Readonly<Record<Tribe, ProjectedView>>,
): ReturnType<typeof buildReplayFrameFromTs> {
  const packets = {} as Record<Tribe, OrderPacket>;
  for (const t of state.tribesAlive) {
    packets[t] = { tribe: t, tick: state.tick, orders: [] };
  }
  return buildReplayFrameFromTs({
    label: "Initial state",
    state,
    stateHash: "",
    packets,
    events: [],
    projectedViews,
  });
}
