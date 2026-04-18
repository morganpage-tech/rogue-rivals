import type { Tribe } from "./rules.js";
import type { MatchState } from "./state.js";
import { createInitialPlayer } from "./state.js";
import { createRngState, nextRandom, shuffle } from "./rng.js";

export interface InitMatchOpts {
  seed: number;
  seats: { playerId: string; tribe: Tribe }[];
  /** When replaying simulations, pass logged `config.turn_order` here. */
  turnOrder?: readonly string[];
}

export function initialScrapPool(numPlayers: number): number {
  return 5 * numPlayers;
}

export function initMatch(opts: InitMatchOpts): MatchState {
  const { seed, seats } = opts;
  if (seats.length < 2 || seats.length > 4) {
    throw new RangeError("seats must have 2–4 players");
  }

  const rng = createRngState(seed >>> 0);
  const seatPlayerIds = seats.map((s) => s.playerId);
  const players: MatchState["players"] = {};
  for (const s of seats) {
    players[s.playerId] = createInitialPlayer(s.playerId, s.tribe);
  }

  let turnOrder: string[];
  if (opts.turnOrder && opts.turnOrder.length === seats.length) {
    turnOrder = [...opts.turnOrder];
  } else {
    const rnd = () => nextRandom(rng);
    turnOrder = shuffle(seatPlayerIds, rnd);
  }

  return {
    rulesVersion: "v0.7.3.1",
    seed,
    rng,
    seatPlayerIds,
    turnOrder,
    round: 1,
    currentPlayerId: turnOrder[0]!,
    scrapPool: initialScrapPool(seats.length),
    players,
    pendingOffers: [],
    matchEnded: false,
    endTrigger: null,
    offerSeq: 0,
    greatHallBuiltThisRound: false,
    needsTurnOpenExpire: true,
  };
}
