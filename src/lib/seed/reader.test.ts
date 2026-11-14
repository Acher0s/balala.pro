import { describe, expect, it } from "vitest";
import pools from "./pools.generated.json";
import type { SeedRng } from "./pseudo";
import {
  _internal,
  jokerQueue,
  luckyQueue,
  normalizeSeed,
  packConsumableQueue,
  packQueue,
  type ReaderSettings,
  shopConsumableQueue,
  shopQueue,
  tagQueue,
  voucherQueue,
} from "./reader";
import { PATCHES } from "./rulesets";

const balanced = PATCHES[0].rulesets[0];
const settings = (seed: string, stake = 1): ReaderSettings => ({
  seed,
  ruleset: balanced,
  gameMode: PATCHES[0].gameMode,
  stake,
});
const SEEDS = ["6EQHIH19", "94VJ9P47", "HKGD2XBQ", "AAAAAAAA", "1"];

describe("seed", () => {
  it("gets The Order's leading *", () => {
    expect(normalizeSeed(" 6eqhih19 ")).toBe("*6EQHIH19");
    expect(normalizeSeed("*6EQHIH19")).toBe("*6EQHIH19");
  });
});

describe("poll_edition", () => {
  const { pollEdition } = _internal;
  /** A stream that always returns `value`, to check the thresholds. */
  const fixed = (value: number) =>
    ({ random: () => value }) as unknown as SeedRng;

  it("uses the base game's thresholds", () => {
    expect(pollEdition(fixed(0.9975), "k")).toBe("negative");
    expect(pollEdition(fixed(0.995), "k")).toBe("polychrome");
    expect(pollEdition(fixed(0.985), "k")).toBe("holo");
    expect(pollEdition(fixed(0.965), "k")).toBe("foil");
    expect(pollEdition(fixed(0.95), "k")).toBeUndefined();
  });

  it("scales the shiny editions with Hone and Glow Up, not Negative", () => {
    expect(pollEdition(fixed(0.95), "k", { rate: 2 })).toBe("foil");
    expect(pollEdition(fixed(0.86), "k", { rate: 4 })).toBe("foil");
    expect(pollEdition(fixed(0.996), "k", { rate: 4 })).toBe("polychrome");
  });

  it("guarantees one for Illusion, never Negative", () => {
    expect(
      pollEdition(fixed(0.99), "k", { guaranteed: true, noNegative: true }),
    ).toBe("polychrome");
    expect(
      pollEdition(fixed(0.6), "k", { guaranteed: true, noNegative: true }),
    ).toBe("holo");
    expect(
      pollEdition(fixed(0.1), "k", { guaranteed: true, noNegative: true }),
    ).toBe("foil");
  });
});

describe("queues", () => {
  it("are the same for the same seed and differ between seeds", () => {
    const a = jokerQueue(settings("6EQHIH19"), 1, 20);
    expect(jokerQueue(settings("6EQHIH19"), 1, 20)).toEqual(a);
    expect(jokerQueue(settings("94VJ9P47"), 1, 20)).not.toEqual(a);
  });

  it("never give a banned card, and do give the ruleset's own", () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      for (const r of [1, 2] as const)
        for (const j of jokerQueue(settings(seed), r, 300)) seen.add(j.key);
      for (const t of shopConsumableQueue(settings(seed), "Tarot", 200))
        seen.add(t);
    }
    expect(seen.has("j_hanging_chad")).toBe(false);
    expect(seen.has("j_bloodstone")).toBe(false);
    expect(seen.has("c_justice")).toBe(false);
    // Attrition's bans, whatever the ruleset.
    for (const key of ["j_mr_bones", "j_luchador", "j_matador"])
      expect(seen.has(key)).toBe(false);
    expect(seen.has("j_mp_hanging_chad")).toBe(true);
    expect(seen.has("j_mp_bloodstone")).toBe(true);
  });

  it("never give Chicot, the Boss Tag or the ante vouchers in Attrition", () => {
    for (const seed of SEEDS) {
      const legendaries = jokerQueue(settings(seed), 4, 60).map((j) => j.key);
      expect(legendaries).not.toContain("j_chicot");
      const tags = tagQueue(settings(seed), 12).flatMap((t) => [
        t.small,
        t.big,
      ]);
      expect(tags).not.toContain("tag_boss");
      const vouchers = voucherQueue(settings(seed), 32, true);
      for (const v of [
        "v_hieroglyph",
        "v_petroglyph",
        "v_directors_cut",
        "v_retcon",
      ])
        expect(vouchers).not.toContain(v);
      expect(vouchers.filter((v) => v === null)).toHaveLength(4);
    }
  });

  it("keep each rarity to its own pool", () => {
    const rares = new Set(pools.jokers[3]);
    for (const j of jokerQueue(settings("AAAAAAAA"), 3, 100))
      expect(rares.has(j.key)).toBe(true);
    const legendaries = new Set(pools.jokers[4]);
    for (const j of jokerQueue(settings("AAAAAAAA"), 4, 20))
      expect(legendaries.has(j.key)).toBe(true);
  });

  it("never pick The Soul, Black Hole or a soft-locked planet from a pool", () => {
    for (const seed of SEEDS) {
      const spectrals = shopConsumableQueue(settings(seed), "Spectral", 200);
      expect(spectrals).not.toContain("c_soul");
      expect(spectrals).not.toContain("c_black_hole");
      const planets = shopConsumableQueue(settings(seed), "Planet", 200);
      for (const p of ["c_planet_x", "c_ceres", "c_eris"])
        expect(planets).not.toContain(p);
    }
  });

  it("give pack cards The Soul and Black Hole only rarely", () => {
    const cards = SEEDS.flatMap((s) =>
      packConsumableQueue(settings(s), "Spectral", 400),
    );
    const special = cards.filter((c) => c === "c_soul" || c === "c_black_hole");
    expect(special.length).toBeLessThan(cards.length * 0.02);
  });
});

describe("edition vouchers", () => {
  it("keep the jokers and only add editions", () => {
    const base = jokerQueue(settings("6EQHIH19"), 1, 200);
    const glow = jokerQueue(settings("6EQHIH19"), 1, 200, false, 4);
    expect(glow.map((j) => j.key)).toEqual(base.map((j) => j.key));
    glow.forEach((j, i) => {
      if (base[i].edition) expect(j.edition).toBeDefined();
    });
    expect(glow.filter((j) => j.edition).length).toBeGreaterThan(
      base.filter((j) => j.edition).length,
    );
  });
});

describe("shop", () => {
  it("rolls about 20 jokers in 28 slots", () => {
    const items = SEEDS.flatMap((s) => shopQueue(settings(s), 400));
    const jokers = items.filter((i) => i.kind === "joker").length;
    expect(jokers / items.length).toBeGreaterThan(0.65);
    expect(jokers / items.length).toBeLessThan(0.78);
    expect(items.some((i) => i.kind === "card")).toBe(false);
  });

  it("takes its jokers from the stickerless queues on White Stake", () => {
    const shop = shopQueue(settings("6EQHIH19"), 60);
    const commons = jokerQueue(settings("6EQHIH19"), 1, 60);
    const fromShop = shop.filter((i) => i.kind === "joker" && i.rarity === 1);
    expect(fromShop.length).toBeGreaterThan(0);
    fromShop.forEach((j, i) => {
      if (j.kind !== "joker") throw new Error();
      expect(j.stickerQueue).toBe(false);
      expect(j.key).toBe(commons[i].key);
      expect(j.edition).toBe(commons[i].edition);
    });
  });

  it("gives stickers from Black Stake, from the sticker queues", () => {
    const shop = SEEDS.flatMap((s) => shopQueue(settings(s, 8), 200));
    const jokers = shop.flatMap((i) => (i.kind === "joker" ? [i] : []));
    const stickered = jokers.filter((j) => j.stickerQueue);
    expect(stickered.length).toBeGreaterThan(jokers.length * 0.3);
    expect(jokers.some((j) => j.stickers.includes("eternal"))).toBe(true);
    expect(jokers.some((j) => j.stickers.includes("perishable"))).toBe(true);
    expect(jokers.some((j) => j.stickers.includes("rental"))).toBe(true);
    for (const j of jokers)
      expect(
        j.stickers.includes("eternal") && j.stickers.includes("perishable"),
      ).toBe(false);
  });

  it("only changes slots from where a voucher is bought", () => {
    const plain = shopQueue(settings("6EQHIH19"), 40);
    const later = shopQueue(settings("6EQHIH19"), 40, {
      vouchers: { v_tarot_merchant: 21 },
    });
    expect(later.slice(0, 20)).toEqual(plain.slice(0, 20));
  });

  it("adds playing cards with Magic Trick and Spectrals with Ghost Deck", () => {
    const items = shopQueue(settings("6EQHIH19"), 300, {
      ghostDeck: true,
      vouchers: { v_magic_trick: 1, v_illusion: 1 },
    });
    expect(items.some((i) => i.kind === "card")).toBe(true);
    expect(items.some((i) => i.kind === "card" && i.enhancement)).toBe(true);
    expect(
      items.some((i) => i.kind === "consumable" && i.set === "Spectral"),
    ).toBe(true);
  });
});

describe("vouchers", () => {
  it("offers base vouchers until they are bought", () => {
    const list = voucherQueue(settings("6EQHIH19"), 8, false);
    const bases = new Set(
      pools.vouchers.filter((v) => !v.requires.length).map((v) => v.key),
    );
    for (const v of list) expect(bases.has(v ?? "")).toBe(true);
  });

  it("offers each voucher at most once when everything is bought", () => {
    // 28: Attrition bans two pairs (Hieroglyph/Petroglyph, Director's Cut/Retcon).
    const list = voucherQueue(settings("6EQHIH19"), 28, true);
    expect(new Set(list).size).toBe(28);
    // An upgrade only comes after its base.
    list.forEach((v, i) => {
      const req = pools.vouchers.find((x) => x.key === v)?.requires ?? [];
      for (const r of req) expect(list.indexOf(r)).toBeLessThan(i);
    });
  });
});

describe("tags, packs and Lucky Cards", () => {
  it("rolls no ante-2 tag in ante 1", () => {
    const late = new Set(
      pools.tags.filter((t) => (t.minAnte ?? 0) > 1).map((t) => t.key),
    );
    for (const seed of SEEDS) {
      const [first] = tagQueue(settings(seed), 1);
      expect(late.has(first.small)).toBe(false);
      expect(late.has(first.big)).toBe(false);
    }
  });

  it("starts the first shop with a Buffoon Pack", () => {
    const shops = packQueue(settings("6EQHIH19"), 5);
    expect(shops[0][0]).toBe("p_buffoon_normal_1");
    for (const s of shops) expect(s).toHaveLength(2);
  });

  it("hits Lucky Cards at about their odds, more with Oops! All 6s", () => {
    const rolls = luckyQueue(settings("6EQHIH19"), 3000);
    const mult = rolls.filter((r) => r.mult).length / rolls.length;
    expect(mult).toBeGreaterThan(0.16);
    expect(mult).toBeLessThan(0.24);
    const doubled = luckyQueue(settings("6EQHIH19"), 3000, 1);
    doubled.forEach((r, i) => {
      if (rolls[i].mult) expect(r.mult).toBe(true);
    });
  });
});
