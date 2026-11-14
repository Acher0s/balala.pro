import { describe, expect, it } from "vitest";
import pools from "./pools.generated.json";
import { pseudohash, SeedRng } from "./pseudo";

/**
 * A real save (vanilla RNG, ante 1, seed 94VJ9P47): its G.GAME.pseudorandom table, which the
 * game writes with 13 significant digits, and what those streams rolled.
 */
const SAVE = {
  seed: "94VJ9P47",
  hashed_seed: 0.919716432781,
  states: {
    Voucher1: [1, 0.463884850929],
    shop_pack1: [1, 0.6797266988054],
    Tag1: [2, 0.2390091343562],
    boss: [1, 0.6684290351119],
  } as Record<string, [number, number]>,
};

describe("pseudohash / pseudoseed", () => {
  it("hashes the seed as the game does", () => {
    expect(pseudohash(SAVE.seed)).toBeCloseTo(SAVE.hashed_seed, 11);
  });

  it("advances each stream to the saved state", () => {
    const rng = new SeedRng(SAVE.seed);
    for (const [key, [uses, state]] of Object.entries(SAVE.states)) {
      for (let i = 0; i < uses; i++) rng.pseudoseed(key);
      expect(rng.state(key)).toBeCloseTo(state, 12);
    }
  });

  it("rolls the save's first voucher", () => {
    // Vanilla get_next_voucher_key: upgrades are UNAVAILABLE until their base is bought.
    const pool = pools.vouchers.map((v) =>
      v.requires.length ? "UNAVAILABLE" : v.key,
    );
    const rng = new SeedRng(SAVE.seed);
    expect(rng.element(pool, "Voucher1")).toBe("v_tarot_merchant");
  });

  it("rolls the save's blind tags, resamples included", () => {
    // Vanilla get_next_tag_key at ante 1: tags with min_ante 2 are UNAVAILABLE, and each retry
    // uses its own "Tag1_resample<n>" stream.
    // The 0.5.6 mod in that game kept its three sandbox tags in the pool as UNAVAILABLE.
    const pool = [
      ...pools.tags.map((t) => ((t.minAnte ?? 0) > 1 ? "UNAVAILABLE" : t.key)),
      ...Array(3).fill("UNAVAILABLE"),
    ];
    const rng = new SeedRng(SAVE.seed);
    const next = () => {
      let tag = rng.element(pool, "Tag1");
      for (let it = 2; tag === "UNAVAILABLE"; it++)
        tag = rng.element(pool, `Tag1_resample${it}`);
      return tag;
    };
    expect([next(), next()]).toEqual(["tag_coupon", "tag_voucher"]);
    // The save's Tag1_resample2..5 streams were each used once.
    for (const it of [2, 3, 4, 5])
      expect(rng.state(`Tag1_resample${it}`)).toBeDefined();
    expect(rng.state("Tag1_resample6")).toBeUndefined();
  });

  it("rolls the save's shop: a tarot, a planet and a celestial pack", () => {
    const rng = new SeedRng(SAVE.seed);
    const total = 20 + 4 + 4; // joker, tarot, planet rates
    const kinds = [0, 1].map(() => {
      const r = rng.random("cdt1") * total;
      return r <= 20 ? "Joker" : r <= 24 ? "Tarot" : "Planet";
    });
    expect(kinds).toEqual(["Tarot", "Planet"]);
    const planets = pools.planets.map((p) =>
      p.softlock ? "UNAVAILABLE" : p.key,
    );
    expect(rng.element(planets, "Planetsho1")).toBe("c_pluto");
    expect(rng.element(pools.tarots, "Tarotsho1")).toBe("c_hermit");
    // The first shop's first pack is a forced Buffoon Pack; the second is rolled by weight.
    const cume = pools.boosters.reduce((sum, b) => sum + b.weight, 0);
    const poll = rng.random("shop_pack1") * cume;
    let it = 0;
    const pack = pools.boosters.find((b) => {
      it += b.weight;
      return it >= poll && it - b.weight <= poll;
    });
    expect(pack?.key).toBe("p_celestial_normal_4");
  });
});
