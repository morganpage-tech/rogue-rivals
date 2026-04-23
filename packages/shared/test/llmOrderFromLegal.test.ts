import { describe, expect, it } from "vitest";
import {
  orderFromLegalOption,
  ordersFromChooseIds,
  ordersFromLlmMessageList,
} from "../src/llmOrderFromLegal.js";
import type { LegalOrderOption, ProjectedView } from "../src/engineTypes.js";

const baseView: ProjectedView = {
  tick: 0,
  forTribe: "orange",
  visibleRegions: {},
  visibleForces: [],
  visibleTransits: [],
  visibleScouts: [],
  myPlayerState: {
    tribe: "orange",
    influence: 100,
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
  tribesAlive: ["orange", "grey", "brown"],
  tickLimit: 60,
};

describe("orderFromLegalOption", () => {
  it("converts move option", () => {
    const opt: LegalOrderOption = {
      id: "move:f1:r_b",
      kind: "move",
      summary: "Move f1 from r_a to r_b",
      payload: { forceId: "f1", destinationRegionId: "r_b" },
    };
    const order = orderFromLegalOption(opt);
    expect(order).toEqual({ kind: "move", forceId: "f1", destinationRegionId: "r_b" });
  });

  it("converts recruit option", () => {
    const opt: LegalOrderOption = {
      id: "recruit:r_a:t2",
      kind: "recruit",
      summary: "Recruit Tier 2 at r_a",
      payload: { regionId: "r_a", tier: 2 },
    };
    expect(orderFromLegalOption(opt)).toEqual({ kind: "recruit", regionId: "r_a", tier: 2 });
  });

  it("converts build option with roadTarget", () => {
    const opt: LegalOrderOption = {
      id: "build:r_a:road:r_b",
      kind: "build",
      summary: "Build road at r_a toward r_b",
      payload: { regionId: "r_a", structure: "road", roadTarget: "r_b" },
    };
    const order = orderFromLegalOption(opt);
    expect(order).toEqual({ kind: "build", regionId: "r_a", structure: "road", roadTarget: "r_b" });
  });

  it("converts build option without roadTarget", () => {
    const opt: LegalOrderOption = {
      id: "build:r_a:fort",
      kind: "build",
      summary: "Build fort at r_a",
      payload: { regionId: "r_a", structure: "fort" },
    };
    const order = orderFromLegalOption(opt);
    expect(order).toEqual({ kind: "build", regionId: "r_a", structure: "fort" });
    expect("roadTarget" in order).toBe(false);
  });

  it("converts scout option", () => {
    const opt: LegalOrderOption = {
      id: "scout:r_a:r_b",
      kind: "scout",
      summary: "Scout r_a to r_b",
      payload: { fromRegionId: "r_a", targetRegionId: "r_b" },
    };
    expect(orderFromLegalOption(opt)).toEqual({ kind: "scout", fromRegionId: "r_a", targetRegionId: "r_b" });
  });

  it("converts propose option", () => {
    const proposal = {
      id: "pending", kind: "nap" as const, from: "orange" as const,
      to: "grey" as const, lengthTicks: 8, amountInfluence: 0, expiresTick: 3,
    };
    const opt: LegalOrderOption = {
      id: "propose:nap:grey",
      kind: "propose",
      summary: "Propose NAP to grey",
      payload: { proposal },
    };
    expect(orderFromLegalOption(opt)).toEqual({ kind: "propose", proposal });
  });

  it("converts respond option", () => {
    const opt: LegalOrderOption = {
      id: "respond:p1:accept",
      kind: "respond",
      summary: "Accept p1",
      payload: { proposalId: "p1", response: "accept" },
    };
    expect(orderFromLegalOption(opt)).toEqual({ kind: "respond", proposalId: "p1", response: "accept" });
  });

  it("throws on unknown kind", () => {
    const opt = { id: "x", kind: "unknown_kind", summary: "", payload: {} };
    expect(() => orderFromLegalOption(opt as unknown as LegalOrderOption)).toThrow(
      "Unsupported legal option kind",
    );
  });
});

describe("ordersFromChooseIds", () => {
  it("maps choose IDs to orders via legal options", () => {
    const view: ProjectedView = {
      ...baseView,
      legalOrderOptions: [
        {
          id: "move:f1:r_b",
          kind: "move",
          summary: "Move f1",
          payload: { forceId: "f1", destinationRegionId: "r_b" },
        },
        {
          id: "recruit:r_a:t1",
          kind: "recruit",
          summary: "Recruit T1",
          payload: { regionId: "r_a", tier: 1 },
        },
      ],
    };
    const { orders } = ordersFromChooseIds(view, ["move:f1:r_b", "recruit:r_a:t1"]);
    expect(orders).toHaveLength(2);
    expect(orders[0]).toEqual({ kind: "move", forceId: "f1", destinationRegionId: "r_b" });
    expect(orders[1]).toEqual({ kind: "recruit", regionId: "r_a", tier: 1 });
  });

  it("skips unknown IDs", () => {
    const { orders } = ordersFromChooseIds(baseView, ["nonexistent"]);
    expect(orders).toHaveLength(0);
  });

  it("skips duplicate legal IDs", () => {
    const view: ProjectedView = {
      ...baseView,
      legalOrderOptions: [
        { id: "move:f1:r_b", kind: "move", summary: "", payload: { forceId: "f1", destinationRegionId: "r_b" } },
      ],
    };
    const { orders } = ordersFromChooseIds(view, ["move:f1:r_b", "move:f1:r_b"]);
    expect(orders).toHaveLength(1);
  });

  it("handles message:tribe:text choose IDs as message orders", () => {
    const { orders } = ordersFromChooseIds(baseView, ["message:grey:hello there"]);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toEqual({ kind: "message", to: "grey", text: "hello there" });
  });

  it("skips message to self", () => {
    const { orders } = ordersFromChooseIds(baseView, ["message:orange:hello"]);
    expect(orders).toHaveLength(0);
  });

  it("skips message to dead tribe", () => {
    const view: ProjectedView = { ...baseView, tribesAlive: ["orange"] };
    const { orders } = ordersFromChooseIds(view, ["message:grey:hello"]);
    expect(orders).toHaveLength(0);
  });

  it("strips trailing tick count from propose:nap keys", () => {
    const view: ProjectedView = {
      ...baseView,
      legalOrderOptions: [
        {
          id: "propose:nap:grey",
          kind: "propose",
          summary: "",
          payload: {
            proposal: { id: "pending", kind: "nap", from: "orange", to: "grey", lengthTicks: 8, amountInfluence: 0, expiresTick: 3 },
          },
        },
      ],
    };
    const { orders } = ordersFromChooseIds(view, ["propose:nap:grey:3"]);
    expect(orders).toHaveLength(1);
    expect(orders[0]!.kind).toBe("propose");
  });

  it("appends default amount to propose:trade_offer without amount", () => {
    const view: ProjectedView = {
      ...baseView,
      legalOrderOptions: [
        {
          id: "propose:trade_offer:grey:5",
          kind: "propose",
          summary: "",
          payload: {
            proposal: { id: "pending", kind: "trade_offer", from: "orange", to: "grey", lengthTicks: 0, amountInfluence: 5, expiresTick: 3 },
          },
        },
      ],
    };
    const { orders } = ordersFromChooseIds(view, ["propose:trade_offer:grey"]);
    expect(orders).toHaveLength(1);
  });

  it("skips non-string entries", () => {
    const { orders } = ordersFromChooseIds(baseView, [123 as unknown as string]);
    expect(orders).toHaveLength(0);
  });

  it("skips empty strings", () => {
    const { orders } = ordersFromChooseIds(baseView, [""]);
    expect(orders).toHaveLength(0);
  });

  it("returns rejected IDs with legal alternatives", () => {
    const view: ProjectedView = {
      ...baseView,
      legalOrderOptions: [
        { id: "propose:nap:grey:3", kind: "propose", summary: "", payload: { proposal: { id: "pending", kind: "nap", from: "orange", to: "grey", lengthTicks: 3, amountInfluence: 0, expiresTick: 3 } } },
        { id: "propose:nap:grey:4", kind: "propose", summary: "", payload: { proposal: { id: "pending", kind: "nap", from: "orange", to: "grey", lengthTicks: 4, amountInfluence: 0, expiresTick: 3 } } },
      ],
    };
    const { orders, rejected } = ordersFromChooseIds(view, ["propose:nap:grey:8"]);
    expect(orders).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.rawId).toBe("propose:nap:grey:8");
    expect(rejected[0]!.legalAlternatives).toContain("propose:nap:grey:3");
    expect(rejected[0]!.legalAlternatives).toContain("propose:nap:grey:4");
  });
});

describe("ordersFromLlmMessageList", () => {
  it("creates message orders for valid messages", () => {
    const orders = ordersFromLlmMessageList(baseView, [
      { to: "grey", text: "hello" },
      { to: "brown", text: "hi" },
    ]);
    expect(orders).toHaveLength(2);
    expect(orders[0]).toEqual({ kind: "message", to: "grey", text: "hello" });
    expect(orders[1]).toEqual({ kind: "message", to: "brown", text: "hi" });
  });

  it("skips message to self", () => {
    const orders = ordersFromLlmMessageList(baseView, [{ to: "orange", text: "self" }]);
    expect(orders).toHaveLength(0);
  });

  it("skips message to dead tribe", () => {
    const orders = ordersFromLlmMessageList(baseView, [{ to: "red", text: "dead" }]);
    expect(orders).toHaveLength(0);
  });

  it("skips empty text", () => {
    const orders = ordersFromLlmMessageList(baseView, [{ to: "grey", text: "" }]);
    expect(orders).toHaveLength(0);
  });

  it("truncates text to 400 chars", () => {
    const longText = "a".repeat(500);
    const orders = ordersFromLlmMessageList(baseView, [{ to: "grey", text: longText }]);
    expect(orders).toHaveLength(1);
    expect((orders[0] as { text: string }).text.length).toBe(400);
  });
});
