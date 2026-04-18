/**
 * Seeded PRNG (mulberry32) with serializable state. All engine randomness uses
 * `state.rng` — never Math.random().
 */

export type RandomFn = () => number;

/** Serializable mulberry32 state (inner `a` register). */
export interface RngState {
  a: number;
}

export function createRngState(seed: number): RngState {
  return { a: seed >>> 0 };
}

/** Next float in [0,1); advances `rng.a` (same progression as legacy `mulberry32` closure). */
export function nextRandom(rng: RngState): number {
  let a = rng.a | 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  rng.a = a >>> 0;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Same PRNG sequence as `createRngState(seed)` + repeated `nextRandom`. */
export function mulberry32(seed: number): RandomFn {
  const rng = createRngState(seed);
  return () => nextRandom(rng);
}

/** Fisher–Yates shuffle using a `RandomFn` */
export function shuffle<T>(items: readonly T[], rnd: RandomFn): T[] {
  const x = [...items];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = x[i];
    x[i] = x[j]!;
    x[j] = tmp!;
  }
  return x;
}
