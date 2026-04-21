import jwt from "jsonwebtoken";

import type { PlayerJwtClaims } from "@rr/shared";
import type { Tribe } from "@rr/shared";

export function issuePlayerToken(
  secret: string,
  matchId: string,
  tribe: Tribe,
  expiresAtSec: number,
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: PlayerJwtClaims = {
    matchId,
    tribe,
    role: "player",
    iat: now,
    exp: Math.min(expiresAtSec, now + 30 * 24 * 3600),
  };
  return jwt.sign(payload, secret, { algorithm: "HS256" });
}

export function verifyPlayerToken(
  secret: string,
  token: string,
): PlayerJwtClaims | null {
  try {
    const d = jwt.verify(token, secret) as PlayerJwtClaims;
    if (d.role !== "player" || !d.matchId || !d.tribe) return null;
    return d;
  } catch {
    return null;
  }
}
