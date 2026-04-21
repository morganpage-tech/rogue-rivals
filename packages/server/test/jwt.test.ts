import { describe, expect, it } from "vitest";
import { issuePlayerToken, verifyPlayerToken } from "../src/auth/jwt.js";

const SECRET = "test-secret-key-for-unit-tests";

describe("issuePlayerToken / verifyPlayerToken", () => {
  it("issues and verifies a valid token", () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = issuePlayerToken(SECRET, "match-123", "orange", expiresAt);
    const claims = verifyPlayerToken(SECRET, token);
    expect(claims).not.toBeNull();
    expect(claims!.matchId).toBe("match-123");
    expect(claims!.tribe).toBe("orange");
    expect(claims!.role).toBe("player");
  });

  it("returns null for wrong secret", () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = issuePlayerToken(SECRET, "match-123", "orange", expiresAt);
    expect(verifyPlayerToken("wrong-secret", token)).toBeNull();
  });

  it("returns null for malformed token", () => {
    expect(verifyPlayerToken(SECRET, "not-a-jwt")).toBeNull();
  });

  it("returns null for empty token", () => {
    expect(verifyPlayerToken(SECRET, "")).toBeNull();
  });

  it("caps expiry to 30 days from now", () => {
    const farFuture = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
    const token = issuePlayerToken(SECRET, "match-123", "orange", farFuture);
    const claims = verifyPlayerToken(SECRET, token);
    expect(claims).not.toBeNull();
    const maxExp = Math.floor(Date.now() / 1000) + 30 * 24 * 3600 + 5;
    expect(claims!.exp!).toBeLessThanOrEqual(maxExp);
  });

  it("contains iat claim", () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const before = Math.floor(Date.now() / 1000);
    const token = issuePlayerToken(SECRET, "match-123", "orange", expiresAt);
    const claims = verifyPlayerToken(SECRET, token);
    expect(claims!.iat).toBeGreaterThanOrEqual(before);
  });
});
