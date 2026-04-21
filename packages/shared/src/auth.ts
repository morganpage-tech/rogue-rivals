import type { Tribe } from "./engineTypes.js";

/** JWT claims for match-scoped player tokens (HS256). */
export interface PlayerJwtClaims {
  readonly matchId: string;
  readonly tribe: Tribe;
  readonly role: "player";
  readonly iat: number;
  readonly exp: number;
}
