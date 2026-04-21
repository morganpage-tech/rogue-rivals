import { describe, expect, it } from "vitest";
import {
  legalOptionMatchesRegion,
  scoutOptionRedundantForMapIntel,
  orderFromLegalOption,
} from "./legalOrders.js";
import type { LegalOrderOption, ProjectedView } from "@rr/shared";

const baseView: ProjectedView = {
  tick: 0,
  forTribe: "orange",
  visibleRegions: { r_a: {} as any, r_b: {} as any },
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
  myForces: [
    { id: "f1", owner: "orange", tier: 2, location: { kind: "garrison", regionId: "r_a" } } as any,
  ],
  myScouts: [],
  myCaravans: [],
  inboxNew: [],
  announcementsNew: [],
  pactsInvolvingMe: [],
  legalOrderOptions: [],
  tribesAlive: ["orange", "grey"],
  tickLimit: 60,
};

describe("legalOptionMatchesRegion", () => {
  it("matches move option to force origin region", () => {
    const opt: LegalOrderOption = {
      id: "move:f1:r_b",
      kind: "move",
      summary: "Move f1",
      payload: { forceId: "f1", destinationRegionId: "r_b" },
    };
    expect(legalOptionMatchesRegion(opt, "r_a", baseView)).toBe(true);
    expect(legalOptionMatchesRegion(opt, "r_b", baseView)).toBe(false);
  });

  it("matches recruit option to region", () => {
    const opt: LegalOrderOption = {
      id: "recruit:r_a:t1",
      kind: "recruit",
      summary: "Recruit",
      payload: { regionId: "r_a", tier: 1 },
    };
    expect(legalOptionMatchesRegion(opt, "r_a", baseView)).toBe(true);
    expect(legalOptionMatchesRegion(opt, "r_b", baseView)).toBe(false);
  });

  it("matches build option to region", () => {
    const opt: LegalOrderOption = {
      id: "build:r_a:fort",
      kind: "build",
      summary: "Build fort",
      payload: { regionId: "r_a", structure: "fort" },
    };
    expect(legalOptionMatchesRegion(opt, "r_a", baseView)).toBe(true);
    expect(legalOptionMatchesRegion(opt, "r_b", baseView)).toBe(false);
  });

  it("matches scout option to fromRegion", () => {
    const opt: LegalOrderOption = {
      id: "scout:r_a:r_b",
      kind: "scout",
      summary: "Scout",
      payload: { fromRegionId: "r_a", targetRegionId: "r_b" },
    };
    expect(legalOptionMatchesRegion(opt, "r_a", baseView)).toBe(true);
    expect(legalOptionMatchesRegion(opt, "r_b", baseView)).toBe(false);
  });

  it("propose always matches", () => {
    const opt: LegalOrderOption = {
      id: "propose:nap:grey",
      kind: "propose",
      summary: "Propose NAP",
      payload: { proposal: {} },
    };
    expect(legalOptionMatchesRegion(opt, "r_a", baseView)).toBe(true);
    expect(legalOptionMatchesRegion(opt, "r_z", baseView)).toBe(true);
  });

  it("respond always matches", () => {
    const opt: LegalOrderOption = {
      id: "respond:p1:accept",
      kind: "respond",
      summary: "Accept",
      payload: { proposalId: "p1", response: "accept" },
    };
    expect(legalOptionMatchesRegion(opt, "r_a", baseView)).toBe(true);
  });
});

describe("scoutOptionRedundantForMapIntel", () => {
  it("returns true when target is already in visible regions", () => {
    const opt: LegalOrderOption = {
      id: "scout:r_a:r_b",
      kind: "scout",
      summary: "Scout",
      payload: { fromRegionId: "r_a", targetRegionId: "r_b" },
    };
    expect(scoutOptionRedundantForMapIntel(baseView, opt)).toBe(true);
  });

  it("returns false when target is not in visible regions", () => {
    const opt: LegalOrderOption = {
      id: "scout:r_a:r_c",
      kind: "scout",
      summary: "Scout",
      payload: { fromRegionId: "r_a", targetRegionId: "r_c" },
    };
    expect(scoutOptionRedundantForMapIntel(baseView, opt)).toBe(false);
  });

  it("returns false for non-scout options", () => {
    const opt: LegalOrderOption = {
      id: "move:f1:r_b",
      kind: "move",
      summary: "Move",
      payload: { forceId: "f1", destinationRegionId: "r_b" },
    };
    expect(scoutOptionRedundantForMapIntel(baseView, opt)).toBe(false);
  });
});

describe("orderFromLegalOption", () => {
  it("converts move", () => {
    const opt: LegalOrderOption = {
      id: "move:f1:r_b",
      kind: "move",
      summary: "",
      payload: { forceId: "f1", destinationRegionId: "r_b" },
    };
    expect(orderFromLegalOption(opt)).toEqual({ kind: "move", forceId: "f1", destinationRegionId: "r_b" });
  });

  it("converts recruit", () => {
    const opt: LegalOrderOption = {
      id: "recruit:r_a:t2",
      kind: "recruit",
      summary: "",
      payload: { regionId: "r_a", tier: 2 },
    };
    expect(orderFromLegalOption(opt)).toEqual({ kind: "recruit", regionId: "r_a", tier: 2 });
  });

  it("converts build with roadTarget", () => {
    const opt: LegalOrderOption = {
      id: "build:r_a:road:r_b",
      kind: "build",
      summary: "",
      payload: { regionId: "r_a", structure: "road", roadTarget: "r_b" },
    };
    const order = orderFromLegalOption(opt);
    expect(order).toEqual({ kind: "build", regionId: "r_a", structure: "road", roadTarget: "r_b" });
  });

  it("converts build without roadTarget", () => {
    const opt: LegalOrderOption = {
      id: "build:r_a:fort",
      kind: "build",
      summary: "",
      payload: { regionId: "r_a", structure: "fort" },
    };
    const order = orderFromLegalOption(opt);
    expect(order).toEqual({ kind: "build", regionId: "r_a", structure: "fort" });
    expect("roadTarget" in order).toBe(false);
  });

  it("converts scout", () => {
    const opt: LegalOrderOption = {
      id: "scout:r_a:r_b",
      kind: "scout",
      summary: "",
      payload: { fromRegionId: "r_a", targetRegionId: "r_b" },
    };
    expect(orderFromLegalOption(opt)).toEqual({ kind: "scout", fromRegionId: "r_a", targetRegionId: "r_b" });
  });

  it("converts propose", () => {
    const proposal = { id: "pending", kind: "nap" as const, from: "orange" as const, to: "grey" as const, lengthTicks: 8, amountInfluence: 0, expiresTick: 3 };
    const opt: LegalOrderOption = {
      id: "propose:nap:grey",
      kind: "propose",
      summary: "",
      payload: { proposal },
    };
    expect(orderFromLegalOption(opt)).toEqual({ kind: "propose", proposal });
  });

  it("converts respond", () => {
    const opt: LegalOrderOption = {
      id: "respond:p1:accept",
      kind: "respond",
      summary: "",
      payload: { proposalId: "p1", response: "accept" },
    };
    expect(orderFromLegalOption(opt)).toEqual({ kind: "respond", proposalId: "p1", response: "accept" });
  });

  it("throws on unknown kind", () => {
    const opt = { id: "x", kind: "unknown", summary: "", payload: {} };
    expect(() => orderFromLegalOption(opt as unknown as LegalOrderOption)).toThrow("Unsupported legal option kind");
  });
});
