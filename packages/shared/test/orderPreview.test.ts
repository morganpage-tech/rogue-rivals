import { describe, expect, it } from "vitest";
import {
  dedupeMovesOnePerForce,
  filterOrdersByInfluenceBudget,
  ordersExceedInfluenceBudget,
  sanitizePlayerOrders,
  wouldClipOrders,
} from "../src/orderPreview.js";

const makeMove = (forceId: string, dest: string) =>
  ({ kind: "move" as const, forceId, destinationRegionId: dest });
const makeBuild = (regionId: string, structure: "fort" | "granary" | "road" | "watchtower" | "shrine" | "forge") =>
  ({ kind: "build" as const, regionId, structure });
const makeRecruit = (regionId: string, tier: 1 | 2 | 3 | 4) =>
  ({ kind: "recruit" as const, regionId, tier });
const makeScout = (from: string, to: string) =>
  ({ kind: "scout" as const, fromRegionId: from, targetRegionId: to });
const makeMessage = (to: "orange" | "grey", text: string) =>
  ({ kind: "message" as const, to, text });

describe("dedupeMovesOnePerForce", () => {
  it("keeps first move per force, drops duplicates", () => {
    const orders = [makeMove("f1", "r_a"), makeMove("f1", "r_b"), makeMove("f2", "r_c")];
    const result = dedupeMovesOnePerForce(orders);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(makeMove("f1", "r_a"));
    expect(result[1]).toEqual(makeMove("f2", "r_c"));
  });

  it("passes through non-move orders unchanged", () => {
    const orders = [makeBuild("r1", "fort"), makeRecruit("r2", 1), makeMove("f1", "r_a")];
    expect(dedupeMovesOnePerForce(orders)).toEqual(orders);
  });

  it("returns empty for empty input", () => {
    expect(dedupeMovesOnePerForce([])).toEqual([]);
  });
});

describe("filterOrdersByInfluenceBudget", () => {
  it("keeps all orders when influence is sufficient", () => {
    const orders = [makeBuild("r1", "fort"), makeRecruit("r2", 1), makeScout("r1", "r2")];
    expect(filterOrdersByInfluenceBudget(100, orders)).toHaveLength(3);
  });

  it("drops build when insufficient influence", () => {
    const orders = [makeBuild("r1", "fort")];
    expect(filterOrdersByInfluenceBudget(5, orders)).toHaveLength(0);
  });

  it("keeps phase-1 orders before phase-2 (budget decremented across phases)", () => {
    const build = makeBuild("r1", "fort");
    const scout = makeScout("r1", "r2");
    const orders = [build, scout];
    const result = filterOrdersByInfluenceBudget(15, orders);
    expect(result).toContainEqual(build);
    expect(result).toContainEqual(scout);
  });

  it("drops scout when budget exhausted by phase 1", () => {
    const build = makeBuild("r1", "fort");
    const scout = makeScout("r1", "r2");
    const result = filterOrdersByInfluenceBudget(10, [build, scout]);
    expect(result).toContainEqual(build);
    expect(result).not.toContainEqual(scout);
  });

  it("keeps zero-cost orders (propose, respond, message)", () => {
    const orders = [
      { kind: "propose" as const, proposal: { id: "p1", kind: "nap" as const, from: "orange" as const, to: "grey" as const, lengthTicks: 8, amountInfluence: 0, expiresTick: 3 } },
      { kind: "respond" as const, proposalId: "p1", response: "accept" as const },
      makeMessage("grey", "hello"),
    ];
    expect(filterOrdersByInfluenceBudget(0, orders)).toHaveLength(3);
  });

  it("processes phase-1 before phase-2 regardless of order in array", () => {
    const scout = makeScout("r1", "r2");
    const build = makeBuild("r1", "fort");
    const result = filterOrdersByInfluenceBudget(10, [scout, build]);
    expect(result).toContainEqual(build);
    expect(result).not.toContainEqual(scout);
  });
});

describe("ordersExceedInfluenceBudget", () => {
  it("returns false when budget is sufficient", () => {
    expect(ordersExceedInfluenceBudget(100, [makeBuild("r1", "fort")])).toBe(false);
  });

  it("returns true when budget is insufficient", () => {
    expect(ordersExceedInfluenceBudget(5, [makeBuild("r1", "fort")])).toBe(true);
  });
});

describe("sanitizePlayerOrders", () => {
  it("dedupes moves then applies budget filter", () => {
    const orders = [
      makeMove("f1", "r_a"),
      makeMove("f1", "r_b"),
      makeBuild("r1", "fort"),
      makeScout("r1", "r2"),
    ];
    const result = sanitizePlayerOrders(10, orders);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual(makeMove("f1", "r_a"));
    expect(result).toContainEqual(makeBuild("r1", "fort"));
  });
});

describe("wouldClipOrders", () => {
  it("returns false when no clipping", () => {
    expect(wouldClipOrders(100, [makeMove("f1", "r_a")])).toBe(false);
  });

  it("returns true when orders get clipped", () => {
    expect(wouldClipOrders(0, [makeBuild("r1", "fort")])).toBe(true);
  });
});
