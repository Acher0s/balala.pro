/**
 * LuaJIT's math.random / math.randomseed (lib_math.c, the Tausworthe TW223 generator), which
 * Balatro's pseudorandom() seeds and draws from once per call.
 *
 * The four 64-bit states are kept as pairs of unsigned 32-bit halves, so this runs without
 * BigInt. lua-random.test.ts checks it against a straight BigInt port of the C code.
 */

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer); // little-endian: [lo, hi]

/** (k, q, s) for each of the four TW223 generators, as in lj_math_random_step. */
const GENS: readonly [number, number, number][] = [
  [63, 31, 18],
  [58, 19, 28],
  [55, 24, 7],
  [47, 21, 8],
];

export class LuaRandom {
  /** gen[i] as [hi, lo] at 2i, 2i + 1. */
  private readonly s = new Uint32Array(8);

  constructor(seed = 0) {
    this.seed(seed);
  }

  /** math.randomseed(d). */
  seed(d: number): void {
    let r = 0x11090601;
    for (let i = 0; i < 4; i++) {
      const m = 2 ** (r & 255);
      r >>>= 8;
      d = d * Math.PI + Math.E;
      f64[0] = d;
      let lo = u32[0];
      const hi = u32[1];
      // if (u.u64 < m) u.u64 += m; m is at most 2^17, so only the low half can be below it.
      if (hi === 0 && lo < m) lo = (lo + m) >>> 0;
      this.s[2 * i] = hi;
      this.s[2 * i + 1] = lo;
    }
    for (let i = 0; i < 10; i++) this.step();
  }

  /** lj_math_random_step: advances all four generators and leaves the result in rh/rl. */
  private rh = 0;
  private rl = 0;
  private step(): void {
    let rh = 0;
    let rl = 0;
    const s = this.s;
    for (let i = 0; i < 4; i++) {
      const [k, q, sh] = GENS[i];
      const zh = s[2 * i];
      const zl = s[2 * i + 1];
      // a = (z << q) ^ z   (q < 32)
      let ah = ((zh << q) | (zl >>> (32 - q))) ^ zh;
      let al = (zl << q) ^ zl;
      ah >>>= 0;
      al >>>= 0;
      // b = a >> (k - s)
      const n = k - sh;
      let bh: number;
      let bl: number;
      if (n >= 32) {
        bh = 0;
        bl = ah >>> (n - 32);
      } else {
        bh = ah >>> n;
        bl = ((al >>> n) | (ah << (32 - n))) >>> 0;
      }
      // c = (z & (~0 << (64 - k))) << s   (64 - k < 32, s < 32)
      const mask = (0xffffffff << (64 - k)) >>> 0;
      const mh = zh;
      const ml = (zl & mask) >>> 0;
      const ch = ((mh << sh) | (ml >>> (32 - sh))) >>> 0;
      const cl = (ml << sh) >>> 0;
      const nh = (bh ^ ch) >>> 0;
      const nl = (bl ^ cl) >>> 0;
      s[2 * i] = nh;
      s[2 * i + 1] = nl;
      rh ^= nh;
      rl ^= nl;
    }
    this.rh = rh >>> 0;
    this.rl = rl >>> 0;
  }

  /** math.random(): a double in [0, 1). */
  random(): number {
    this.step();
    u32[1] = ((this.rh & 0x000fffff) | 0x3ff00000) >>> 0;
    u32[0] = this.rl;
    return f64[0] - 1.0;
  }

  /** math.random(m, n): an integer in [m, n]. */
  randint(m: number, n: number): number {
    return Math.floor(this.random() * (n - m + 1)) + m;
  }
}

const shared = new LuaRandom();

/** math.randomseed(seed); return math.random() */
export function seededRandom(seed: number): number {
  shared.seed(seed);
  return shared.random();
}

/** math.randomseed(seed); return math.random(m, n) */
export function seededRandint(seed: number, m: number, n: number): number {
  shared.seed(seed);
  return shared.randint(m, n);
}
