/**
 * Balatro's seeded RNG (functions/misc_functions.lua): pseudohash, pseudoseed, pseudorandom
 * and pseudorandom_element. Every named stream ("cdt0", "Joker10", …) keeps its own state, which
 * pseudoseed advances on each use, so a stream is a fixed sequence for a given seed no matter
 * what else the game rolls in between.
 */
import { seededRandint, seededRandom } from "./lua-random";

const encoder = new TextEncoder();

/** pseudohash(str) */
export function pseudohash(str: string): number {
  const bytes = encoder.encode(str);
  let num = 1;
  for (let i = bytes.length; i >= 1; i--) {
    num = ((1.1239285023 / num) * bytes[i - 1] * Math.PI + Math.PI * i) % 1;
  }
  return num;
}

/** math.abs(tonumber(string.format("%.13f", x))) */
function round13(x: number): number {
  return Math.abs(Number(x.toFixed(13)));
}

/** One step of a stream's state, as pseudoseed does it. */
export function advance(state: number): number {
  return round13((2.134453429141 + state * 1.72431234) % 1);
}

export class SeedRng {
  readonly seed: string;
  readonly hashedSeed: number;
  private readonly states: Map<string, number>;

  constructor(seed: string, states?: Map<string, number>) {
    this.seed = seed;
    this.hashedSeed = pseudohash(seed);
    this.states = new Map(states);
  }

  /** A copy whose streams continue from where this one's are, without touching this one. */
  clone(): SeedRng {
    return new SeedRng(this.seed, this.states);
  }

  /** pseudoseed(key) */
  pseudoseed(key: string): number {
    const prev = this.states.get(key) ?? pseudohash(key + this.seed);
    const next = advance(prev);
    this.states.set(key, next);
    return (next + this.hashedSeed) / 2;
  }

  /** pseudorandom(key): a float in [0, 1). */
  random(key: string): number {
    return seededRandom(this.pseudoseed(key));
  }

  /** pseudorandom(key, min, max) */
  randint(key: string, min: number, max: number): number {
    return seededRandint(this.pseudoseed(key), min, max);
  }

  /**
   * pseudorandom_element(list, pseudoseed(key)) for an array: the game sorts by index, so this
   * is list[floor(random * length)].
   */
  element<T>(list: readonly T[], key: string): T {
    return list[seededRandint(this.pseudoseed(key), 1, list.length) - 1];
  }

  /** The stream's current state, as the game saves it in G.GAME.pseudorandom. */
  state(key: string): number | undefined {
    return this.states.get(key);
  }
}
