import { describe, expect, it } from "vitest";
import {
  dedupeMovesOnePerForce,
  sanitizePlayerOrders,
  wouldClipOrders,
} from "../src/orderPacketFilters.js";
import type { Order } from "../src/types.js";

describe("orderPacketFilters", () => {
  it("dedupeMovesOnePerForce keeps first destination only", () => {
    const orders: Order[] = [
      {
        kind: "move",
        forceId: "f_g_001",
        destinationRegionId: "r_a",
      },
      {
        kind: "move",
        forceId: "f_g_001",
        destinationRegionId: "r_b",
      },
    ];
    expect(dedupeMovesOnePerForce(orders)).toHaveLength(1);
    expect(dedupeMovesOnePerForce(orders)[0]?.destinationRegionId).toBe("r_a");
  });

  it("wouldClipOrders is true for duplicate moves", () => {
    const orders: Order[] = [
      { kind: "move", forceId: "f1", destinationRegionId: "a" },
      { kind: "move", forceId: "f1", destinationRegionId: "b" },
    ];
    expect(wouldClipOrders(99, orders)).toBe(true);
    expect(sanitizePlayerOrders(99, orders)).toHaveLength(1);
  });
});
