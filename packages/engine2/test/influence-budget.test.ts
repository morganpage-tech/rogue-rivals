import { describe, expect, it } from "vitest";
import {
  filterOrdersByInfluenceBudget,
  ordersExceedInfluenceBudget,
} from "@rr/shared";
import type { Order } from "../src/types.js";

describe("influenceBudget", () => {
  it("allows one scout from 5 influence, not three", () => {
    const threeScouts: Order[] = [
      {
        kind: "scout",
        fromRegionId: "a",
        targetRegionId: "b",
      },
      {
        kind: "scout",
        fromRegionId: "a",
        targetRegionId: "c",
      },
      {
        kind: "scout",
        fromRegionId: "a",
        targetRegionId: "d",
      },
    ];
    expect(ordersExceedInfluenceBudget(5, threeScouts)).toBe(true);
    const kept = filterOrdersByInfluenceBudget(5, threeScouts);
    expect(kept).toHaveLength(1);
  });

  it("applies recruit before scouts (phase 1 then phase 2)", () => {
    const orders: Order[] = [
      { kind: "recruit", regionId: "r", tier: 1 },
      { kind: "scout", fromRegionId: "a", targetRegionId: "b" },
      { kind: "scout", fromRegionId: "a", targetRegionId: "c" },
    ];
    // 5 - 2 = 3 -> one scout; second scout fails
    expect(filterOrdersByInfluenceBudget(5, orders)).toHaveLength(2);
  });
});
