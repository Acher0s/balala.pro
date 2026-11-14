import { describe, expect, it } from "vitest";
import { LuaRandom } from "./lua-random";

/** A straight BigInt port of LuaJIT's lib_math.c, to check the 32-bit version against. */
class Reference {
  gen = [0n, 0n, 0n, 0n];
  constructor(d: number) {
    const view = new DataView(new ArrayBuffer(8));
    let r = 0x11090601;
    for (let i = 0; i < 4; i++) {
      const m = 1n << BigInt(r & 255);
      r >>>= 8;
      d = d * Math.PI + Math.E;
      view.setFloat64(0, d, true);
      let u = view.getBigUint64(0, true);
      if (u < m) u += m;
      this.gen[i] = u;
    }
    for (let i = 0; i < 10; i++) this.step();
  }
  step(): bigint {
    const params: [bigint, bigint, bigint][] = [
      [63n, 31n, 18n],
      [58n, 19n, 28n],
      [55n, 24n, 7n],
      [47n, 21n, 8n],
    ];
    let r = 0n;
    const all = (1n << 64n) - 1n;
    params.forEach(([k, q, s], i) => {
      let z = this.gen[i];
      z =
        ((((z << q) & all) ^ z) >> (k - s)) ^
        (((z & ((all << (64n - k)) & all)) << s) & all);
      r ^= z;
      this.gen[i] = z;
    });
    return r;
  }
  random(): number {
    const bits = (this.step() & 0x000fffffffffffffn) | 0x3ff0000000000000n;
    const view = new DataView(new ArrayBuffer(8));
    view.setBigUint64(0, bits, true);
    return view.getFloat64(0, true) - 1;
  }
}

describe("LuaRandom", () => {
  it("matches the BigInt port of LuaJIT's generator", () => {
    const seeds = [0, 0.5, 0.123456789, 0.999999, 1e-9, 0.42, 0.7731];
    for (const seed of seeds) {
      const a = new LuaRandom(seed);
      const b = new Reference(seed);
      for (let i = 0; i < 20; i++) expect(a.random()).toBe(b.random());
    }
  });

  it("draws integers in range", () => {
    const r = new LuaRandom(0.3);
    for (let i = 0; i < 200; i++) {
      const n = r.randint(1, 6);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
    }
  });
});
