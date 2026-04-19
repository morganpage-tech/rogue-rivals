/**
 * Mirrors `tools/v2/sim_v2.py` canned script + dynamic rewrites so TS `tick`
 * can be compared to `fixtures/sim_v2_python_hashes.json` (regenerate by
 * looping `_rewrite_dynamic_orders` + `tick` in Python for seed 2026001).
 */
import type { GameState, OrderPacket, Proposal, Tribe } from "../src/types.js";
import { tick } from "../src/tick.js";

const TRIBES: readonly Tribe[] = ["orange", "grey", "brown", "red"];

function passPacket(tribe: Tribe, tick: number): OrderPacket {
  return { tribe, tick, orders: [] };
}

function pendingProposal(p: Omit<Proposal, "id" | "expiresTick"> & { id?: string }): Proposal {
  return {
    id: p.id ?? "pending",
    kind: p.kind,
    from: p.from,
    to: p.to,
    lengthTicks: p.lengthTicks,
    amountInfluence: p.amountInfluence,
    expiresTick: p.expiresTick ?? 0,
  };
}

/** Pick orange tier-II force the same way as `sim_v2._rewrite_dynamic_orders`. */
function resolveOrangeTier2ForceId(state: GameState): string | undefined {
  const tier2 = Object.values(state.forces).filter(
    (f) => f.owner === "orange" && f.tier === 2,
  );
  if (tier2.length === 0) return undefined;
  const garr = tier2.filter((f) => f.location.kind === "garrison");
  return (garr[0] ?? tier2[0])!.id;
}

export const SIM_V2_STEPS = 10;

export function simV2PacketsForStep(state: GameState, step: number): Record<Tribe, OrderPacket> {
  if (state.tick !== step) {
    throw new Error(`simV2: expected state.tick ${step}, got ${state.tick}`);
  }

  switch (step) {
    case 0:
      return {
        orange: {
          tribe: "orange",
          tick: 0,
          orders: [
            {
              kind: "propose",
              proposal: pendingProposal({
                kind: "nap",
                from: "orange",
                to: "grey",
                lengthTicks: 8,
                amountInfluence: 0,
              }),
            },
          ],
        },
        grey: passPacket("grey", 0),
        brown: {
          tribe: "brown",
          tick: 0,
          orders: [
            { kind: "build", regionId: "r_brown_swamps", structure: "granary" },
          ],
        },
        red: {
          tribe: "red",
          tick: 0,
          orders: [{ kind: "recruit", regionId: "r_red_desert", tier: 1 }],
        },
      };

    case 1: {
      const napCandidates = state.players.grey!.outstandingProposals.filter((p) => p.kind === "nap");
      const target = napCandidates[napCandidates.length - 1]!;
      return {
        orange: {
          tribe: "orange",
          tick: 1,
          orders: [{ kind: "recruit", regionId: "r_orange_plains", tier: 2 }],
        },
        grey: {
          tribe: "grey",
          tick: 1,
          orders: [{ kind: "respond", proposalId: target.id, response: "accept" }],
        },
        brown: {
          tribe: "brown",
          tick: 1,
          orders: [
            {
              kind: "scout",
              fromRegionId: "r_brown_swamps",
              targetRegionId: "r_desert_wastes",
            },
          ],
        },
        red: passPacket("red", 1),
      };
    }

    case 2: {
      const fid = resolveOrangeTier2ForceId(state);
      if (!fid) {
        return {
          orange: { tribe: "orange", tick: 2, orders: [] },
          grey: passPacket("grey", 2),
          brown: passPacket("brown", 2),
          red: {
            tribe: "red",
            tick: 2,
            orders: [
              {
                kind: "propose",
                proposal: pendingProposal({
                  kind: "trade_offer",
                  from: "red",
                  to: "grey",
                  lengthTicks: 0,
                  amountInfluence: 6,
                }),
              },
            ],
          },
        };
      }
      return {
        orange: {
          tribe: "orange",
          tick: 2,
          orders: [
            {
              kind: "move",
              forceId: fid,
              destinationRegionId: "r_ruins_center",
            },
          ],
        },
        grey: passPacket("grey", 2),
        brown: passPacket("brown", 2),
        red: {
          tribe: "red",
          tick: 2,
          orders: [
            {
              kind: "propose",
              proposal: pendingProposal({
                kind: "trade_offer",
                from: "red",
                to: "grey",
                lengthTicks: 0,
                amountInfluence: 6,
              }),
            },
          ],
        },
      };
    }

    case 3: {
      const trades = state.players.grey!.outstandingProposals.filter((p) => p.kind === "trade_offer");
      const target = trades[trades.length - 1]!;
      return {
        orange: passPacket("orange", 3),
        grey: {
          tribe: "grey",
          tick: 3,
          orders: [{ kind: "respond", proposalId: target.id, response: "accept" }],
        },
        brown: passPacket("brown", 3),
        red: passPacket("red", 3),
      };
    }

    case 4:
      return {
        orange: passPacket("orange", 4),
        grey: passPacket("grey", 4),
        brown: passPacket("brown", 4),
        red: {
          tribe: "red",
          tick: 4,
          orders: [{ kind: "message", to: "grey", text: "beware orange" }],
        },
      };

    case 5:
      return {
        orange: {
          tribe: "orange",
          tick: 5,
          orders: [
            {
              kind: "propose",
              proposal: pendingProposal({
                kind: "nap",
                from: "orange",
                to: "brown",
                lengthTicks: 8,
                amountInfluence: 0,
              }),
            },
          ],
        },
        grey: {
          tribe: "grey",
          tick: 5,
          orders: [
            {
              kind: "build",
              regionId: "r_grey_mountains",
              structure: "watchtower",
            },
          ],
        },
        brown: passPacket("brown", 5),
        red: passPacket("red", 5),
      };

    case 6: {
      const fid = resolveOrangeTier2ForceId(state);
      if (!fid) {
        return {
          orange: { tribe: "orange", tick: 6, orders: [] },
          grey: passPacket("grey", 6),
          brown: passPacket("brown", 6),
          red: passPacket("red", 6),
        };
      }
      return {
        orange: {
          tribe: "orange",
          tick: 6,
          orders: [
            {
              kind: "move",
              forceId: fid,
              destinationRegionId: "r_grey_mountains",
            },
          ],
        },
        grey: passPacket("grey", 6),
        brown: passPacket("brown", 6),
        red: passPacket("red", 6),
      };
    }

    case 7:
      return {
        orange: passPacket("orange", 7),
        grey: {
          tribe: "grey",
          tick: 7,
          orders: [
            {
              kind: "scout",
              fromRegionId: "r_grey_mountains",
              targetRegionId: "r_ruins_center",
            },
          ],
        },
        brown: {
          tribe: "brown",
          tick: 7,
          orders: [
            { kind: "build", regionId: "r_brown_swamps", structure: "fort" },
          ],
        },
        red: passPacket("red", 7),
      };

    case 8:
      return Object.fromEntries(TRIBES.map((t) => [t, passPacket(t, 8)])) as Record<
        Tribe,
        OrderPacket
      >;

    case 9:
      return Object.fromEntries(TRIBES.map((t) => [t, passPacket(t, 9)])) as Record<
        Tribe,
        OrderPacket
      >;

    default:
      throw new Error(`simV2: invalid step ${step}`);
  }
}

/** Run full canned match; returns post-tick hashes (one per step). */
export function runSimV2Match(state: GameState): { finalTick: number; hashes: string[] } {
  const hashes: string[] = [];
  for (let step = 0; step < SIM_V2_STEPS; step++) {
    const packets = simV2PacketsForStep(state, step);
    const { stateHash } = tick(state, packets);
    hashes.push(stateHash);
  }
  return { finalTick: state.tick, hashes };
}
