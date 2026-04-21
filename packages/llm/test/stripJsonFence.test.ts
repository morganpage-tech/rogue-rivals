import { describe, expect, it } from "vitest";

import { stripJsonFence } from "../src/stripJsonFence.js";

describe("stripJsonFence", () => {
  it("returns inner JSON from fenced block", () => {
    const s = stripJsonFence("```json\n{\"a\":1}\n```");
    expect(s).toBe('{"a":1}');
  });

  it("returns trimmed raw when no fence", () => {
    expect(stripJsonFence('  {"b":2}  ')).toBe('{"b":2}');
  });
});
