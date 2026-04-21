import { describe, expect, it } from "vitest";
import type { Order, Proposal } from "@rr/shared";
import { orderToReplayPayload } from "./orderToReplayPayload.js";

const baseProposal: Proposal = {
  id: "p1",
  kind: "nap",
  from: "orange",
  to: "grey",
  lengthTicks: 10,
  amountInfluence: 0,
  expiresTick: 99,
};

describe("orderToReplayPayload", () => {
  it("maps move, recruit, scout, respond, message", () => {
    const move: Order = {
      kind: "move",
      forceId: "f1",
      destinationRegionId: "r2",
    };
    expect(orderToReplayPayload(move)).toEqual({
      force_id: "f1",
      destination_region_id: "r2",
    });

    const recruit: Order = {
      kind: "recruit",
      regionId: "r1",
      tier: 2,
    };
    expect(orderToReplayPayload(recruit)).toEqual({
      region_id: "r1",
      tier: 2,
    });

    const scout: Order = {
      kind: "scout",
      fromRegionId: "a",
      targetRegionId: "b",
    };
    expect(orderToReplayPayload(scout)).toEqual({
      from_region_id: "a",
      target_region_id: "b",
    });

    const respond: Order = {
      kind: "respond",
      proposalId: "p1",
      response: "accept",
    };
    expect(orderToReplayPayload(respond)).toEqual({
      proposal_id: "p1",
      response: "accept",
    });

    const message: Order = {
      kind: "message",
      to: "grey",
      text: "hi",
    };
    expect(orderToReplayPayload(message)).toEqual({ to: "grey", text: "hi" });
  });

  it("maps build: structure and road with road_target", () => {
    const fort: Order = {
      kind: "build",
      regionId: "r1",
      structure: "fort",
    };
    expect(orderToReplayPayload(fort)).toEqual({
      region_id: "r1",
      structure: "fort",
    });

    const road: Order = {
      kind: "build",
      regionId: "r1",
      structure: "road",
      roadTarget: "r2",
    };
    expect(orderToReplayPayload(road)).toEqual({
      region_id: "r1",
      structure: "road",
      road_target: "r2",
    });
  });

  it("maps propose: nap, trade_offer, shared_vision", () => {
    const nap: Order = {
      kind: "propose",
      proposal: { ...baseProposal, kind: "nap" },
    };
    expect(orderToReplayPayload(nap)).toEqual({
      proposal: {
        kind: "nap",
        to: "grey",
        length_ticks: 10,
      },
    });

    const sv: Order = {
      kind: "propose",
      proposal: { ...baseProposal, kind: "shared_vision" },
    };
    expect(orderToReplayPayload(sv).proposal).toMatchObject({
      kind: "shared_vision",
      length_ticks: 10,
    });

    const trade: Order = {
      kind: "propose",
      proposal: {
        ...baseProposal,
        kind: "trade_offer",
        amountInfluence: 5,
      },
    };
    expect(orderToReplayPayload(trade)).toEqual({
      proposal: {
        kind: "trade_offer",
        to: "grey",
        amount_influence: 5,
      },
    });

    const war: Order = {
      kind: "propose",
      proposal: { ...baseProposal, kind: "declare_war" },
    };
    expect(orderToReplayPayload(war)).toEqual({
      proposal: { kind: "declare_war", to: "grey" },
    });
  });
});
