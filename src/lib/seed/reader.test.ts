import { describe, expect, it } from "vitest";
import pools from "./pools.generated.json";
import type { SeedRng } from "./pseudo";
import {
  _internal,
  certificateQueue,
  illusionQueue,
  jokerQueue,
  luckyQueue,
  magicTrickQueue,
  normalizeSeed,
  packConsumableQueue,
  packQueue,
  type ReaderSettings,
  rawJokerQueue,
  shopConsumableQueue,
  shopQueue,
  standardPackQueue,
  tagQueue,
  voucherQueue,
} from "./reader";
import { PATCHES } from "./rulesets";

const [expanded, balanced] = PATCHES[0].rulesets;
const settings = (
  seed: string,
  stake = 1,
  ruleset = balanced,
  extra: Partial<ReaderSettings> = {},
): ReaderSettings => ({
  seed,
  ruleset,
  gameMode: PATCHES[0].gameMode,
  stake,
  ...extra,
});
const exp = (seed: string, extra: Partial<ReaderSettings> = {}) =>
  settings(seed, 1, expanded, extra);
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
    const a = rawJokerQueue(settings("6EQHIH19"), 1, 20);
    expect(rawJokerQueue(settings("6EQHIH19"), 1, 20)).toEqual(a);
    expect(rawJokerQueue(settings("94VJ9P47"), 1, 20)).not.toEqual(a);
  });

  it("never give a banned card, and do give the ruleset's own", () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      for (const r of [1, 2] as const)
        for (const j of rawJokerQueue(settings(seed), r, 300)) seen.add(j.key);
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
      const legendaries = rawJokerQueue(settings(seed), 4, 60).map(
        (j) => j.key,
      );
      expect(legendaries).not.toContain("j_chicot");
      const tags = tagQueue(settings(seed), 12).flatMap((t) => [
        t.small,
        t.big,
      ]);
      expect(tags).not.toContain("tag_boss");
      const perAnte = voucherQueue(settings(seed), 32, true);
      const vouchers = perAnte.flat();
      for (const v of [
        "v_hieroglyph",
        "v_petroglyph",
        "v_directors_cut",
        "v_retcon",
      ])
        expect(vouchers).not.toContain(v);
      expect(perAnte.filter((a) => a.length === 0)).toHaveLength(4);
    }
  });

  it("keep each rarity to its own pool", () => {
    const rares = new Set(pools.jokers[3]);
    for (const j of rawJokerQueue(settings("AAAAAAAA"), 3, 100))
      expect(rares.has(j.key)).toBe(true);
    const legendaries = new Set(pools.jokers[4]);
    for (const j of rawJokerQueue(settings("AAAAAAAA"), 4, 20))
      expect(legendaries.has(j.key)).toBe(true);
  });

  it("never pick The Soul or Black Hole from a pool", () => {
    for (const seed of SEEDS) {
      const spectrals = shopConsumableQueue(settings(seed), "Spectral", 200);
      expect(spectrals).not.toContain("c_soul");
      expect(spectrals).not.toContain("c_black_hole");
    }
  });

  it("read Planet X, Ceres and Eris as unlocked", () => {
    const planets = SEEDS.flatMap((s) =>
      shopConsumableQueue(settings(s), "Planet", 200),
    );
    for (const p of ["c_planet_x", "c_ceres", "c_eris"])
      expect(planets).toContain(p);
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
    const base = rawJokerQueue(settings("6EQHIH19"), 1, 200);
    const glow = rawJokerQueue(settings("6EQHIH19"), 1, 200, false, 4);
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
    const commons = rawJokerQueue(settings("6EQHIH19"), 1, 60);
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
    const list = voucherQueue(settings("6EQHIH19"), 8, false).flat();
    const bases = new Set(
      pools.vouchers.filter((v) => !v.requires.length).map((v) => v.key),
    );
    for (const v of list) expect(bases.has(v ?? "")).toBe(true);
  });

  it("offers each voucher at most once when everything is bought", () => {
    // 28: Attrition bans two pairs (Hieroglyph/Petroglyph, Director's Cut/Retcon).
    const list = voucherQueue(settings("6EQHIH19"), 28, true).flat();
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

describe("Expanded", () => {
  it("is the first ruleset, with Balanced still there", () => {
    expect(expanded.id).toBe("expanded");
    expect(balanced.id).toBe("balanced");
  });

  it("adds the mod cards after the vanilla ones, in load order", () => {
    const p = _internal.buildPools(exp("X"));
    expect(p.jokers[1]).toHaveLength(pools.jokers[1].length + 6);
    expect(p.jokers[2]).toHaveLength(pools.jokers[2].length + 8);
    expect(p.jokers[1].slice(-6)).toEqual([
      "UNAVAILABLE", // Defensive Joker
      "j_mp_pacifist",
      "UNAVAILABLE", // Penny Pincher, until the first PvP blind
      "j_mp_pizza",
      "j_mp_taxes",
      "j_mp_hanging_chad",
    ]);
    expect(p.jokers[2].slice(-8)).toEqual([
      "UNAVAILABLE", // Conjoined Joker
      "j_mp_lets_go_gambling",
      "j_mp_skip_off",
      "UNAVAILABLE", // Speedrun
      "j_mp_bloodstone",
      "j_mp_seltzer",
      "j_mp_ticket",
      "j_mp_turtle_bean",
    ]);
    expect(p.Planet.at(-1)).toBe("c_mp_asteroid");
    expect(p.Spectral.at(-1)).toBe("c_mp_ouija_standard");
    // Balanced keeps the mod's own content out.
    const b = _internal.buildPools(settings("X"));
    expect(b.jokers[1]).toHaveLength(pools.jokers[1].length + 1);
    expect(b.Planet).toHaveLength(pools.planets.length);
  });

  it("gives the mod's jokers and consumables, never its bans", () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      for (const r of [1, 2] as const)
        for (const j of rawJokerQueue(exp(seed), r, 300)) seen.add(j.key);
      for (const set of ["Planet", "Spectral"] as const)
        for (const c of shopConsumableQueue(exp(seed), set, 200)) seen.add(c);
    }
    for (const k of [
      "j_mp_pacifist",
      "j_mp_lets_go_gambling",
      "j_mp_ticket",
      "c_mp_asteroid",
      "c_mp_ouija_standard",
    ])
      expect(seen.has(k)).toBe(true);
    for (const k of [
      "j_mp_speedrun",
      "j_mp_conjoined_joker",
      "j_mp_defensive_joker",
      "j_mp_penny_pincher",
      "j_ticket",
      "j_selzer",
      "j_turtle_bean",
      "c_ouija",
      "j_mr_bones",
    ])
      expect(seen.has(k)).toBe(false);
  });

  it("opens Penny Pincher after the first PvP blind", () => {
    const seen = SEEDS.flatMap((s) =>
      rawJokerQueue(exp(s, { pincherUnlocked: true }), 1, 300).map(
        (j) => j.key,
      ),
    );
    expect(seen).toContain("j_mp_penny_pincher");
    const before = shopQueue(exp("6EQHIH19"), 40);
    const after = shopQueue(exp("6EQHIH19"), 40, { pincherFrom: 21 });
    expect(after.slice(0, 20)).toEqual(before.slice(0, 20));
  });

  it("has a different voucher and tag pool from Balanced", () => {
    // The Manhunt vouchers and the Ward Tag are slots that are never picked, so rolls move.
    const differs = SEEDS.some(
      (s) =>
        JSON.stringify(voucherQueue(exp(s), 8, false)) !==
          JSON.stringify(voucherQueue(settings(s), 8, false)) ||
        JSON.stringify(tagQueue(exp(s), 8)) !==
          JSON.stringify(tagQueue(settings(s), 8)),
    );
    expect(differs).toBe(true);
    for (const s of SEEDS) {
      const tags = tagQueue(exp(s), 8).flatMap((t) => [t.small, t.big]);
      expect(tags).not.toContain("tag_mp_ward");
      const vouchers = voucherQueue(exp(s), 32, true).flat();
      expect(vouchers.some((v) => v?.includes("manhunt"))).toBe(false);
    }
  });

  it("puts every sticker on Spectral+ like Gold", () => {
    const shop = SEEDS.flatMap((s) => shopQueue(settings(s, 9, expanded), 200));
    const jokers = shop.flatMap((i) => (i.kind === "joker" ? [i] : []));
    for (const st of ["eternal", "perishable", "rental"] as const)
      expect(jokers.some((j) => j.stickers.includes(st))).toBe(true);
    for (const j of jokers)
      if (["j_mp_pizza", "j_mp_seltzer", "j_mp_turtle_bean"].includes(j.key))
        expect(j.stickers).not.toContain("eternal");
  });
});

describe("joker queues as the shop gives them", () => {
  it("are the stickerless queue on White Stake", () => {
    const shop = jokerQueue(settings("6EQHIH19"), 2, 40);
    const raw = rawJokerQueue(settings("6EQHIH19"), 2, 40);
    expect(shop.map((j) => j.key)).toEqual(raw.map((j) => j.key));
    for (const j of shop) expect(j.stickers).toEqual([]);
  });

  it("mix both queues on Black Stake, in order", () => {
    const s = settings("6EQHIH19", 4);
    const shop = jokerQueue(s, 1, 80);
    const plain = rawJokerQueue(s, 1, 80);
    const stickered = rawJokerQueue(s, 1, 80, true);
    let p = 0;
    let q = 0;
    for (const j of shop) {
      const from = j.stickerQueue ? stickered[q++] : plain[p++];
      expect(j.key).toBe(from.key);
      expect(j.edition).toBe(from.edition);
    }
    expect(q).toBeGreaterThan(0);
    expect(shop.some((j) => j.stickers.includes("eternal"))).toBe(true);
  });

  it("match the shop's own jokers of that rarity", () => {
    const s = settings("94VJ9P47", 8);
    const fromShop = shopQueue(s, 120).flatMap((i) =>
      i.kind === "joker" && i.rarity === 1 ? [i] : [],
    );
    const queue = jokerQueue(s, 1, fromShop.length);
    expect(queue).toEqual(fromShop);
  });
});

describe("playing card queues", () => {
  it("give Standard Pack cards with seals, editions and enhancements", () => {
    const cards = SEEDS.flatMap((s) => standardPackQueue(settings(s), 200));
    const share = (f: (c: (typeof cards)[number]) => unknown) =>
      cards.filter(f).length / cards.length;
    expect(share((c) => c.seal)).toBeGreaterThan(0.15);
    expect(share((c) => c.seal)).toBeLessThan(0.25);
    expect(share((c) => c.enhancement)).toBeGreaterThan(0.35);
    expect(share((c) => c.enhancement)).toBeLessThan(0.45);
    expect(share((c) => c.edition)).toBeGreaterThan(0.05);
    expect(cards.some((c) => c.edition === "negative")).toBe(false);
    for (const c of cards) expect(pools.cards).toContain(c.card);
  });

  it("only gives Standard Packs more editions with Glow Up", () => {
    const base = standardPackQueue(settings("6EQHIH19"), 200);
    const glow = standardPackQueue(settings("6EQHIH19"), 200, 4);
    expect(glow.map((c) => [c.card, c.seal, c.enhancement])).toEqual(
      base.map((c) => [c.card, c.seal, c.enhancement]),
    );
    expect(glow.filter((c) => c.edition).length).toBeGreaterThan(
      base.filter((c) => c.edition).length,
    );
  });

  it("match the shop's own playing cards", () => {
    const s = settings("6EQHIH19");
    const shop = shopQueue(s, 200, { vouchers: { v_magic_trick: 1 } });
    const fromShop = shop.flatMap((i) => (i.kind === "card" ? [i.card] : []));
    expect(magicTrickQueue(s, fromShop.length).map((c) => c.card)).toEqual(
      fromShop,
    );
    const illusion = illusionQueue(s, 200);
    expect(illusion.length).toBeGreaterThan(0);
    for (const c of illusion) expect(c.slot).toBeDefined();
    expect(illusion.some((c) => c.enhancement || c.edition)).toBe(true);
  });

  it("always gives Certificate a seal", () => {
    const cards = certificateQueue(settings("6EQHIH19"), 200);
    for (const c of cards)
      expect(["Gold", "Red", "Blue", "Purple"]).toContain(c.seal);
    expect(new Set(cards.map((c) => c.seal)).size).toBe(4);
  });
});

describe("blocking a card", () => {
  it("skips it from that slot on, and leaves the slots before alone", () => {
    const s = settings("FZZUAJBR");
    const plain = shopQueue(s, 80);
    const at = plain.findIndex((i) => i.kind === "joker");
    const first = plain[at];
    if (first.kind !== "joker") throw new Error("no joker");
    const blocked = shopQueue(s, 80, {
      blocks: [{ key: first.key, from: at + 1 }],
    });
    expect(blocked.slice(0, at)).toEqual(plain.slice(0, at));
    expect(blocked[at].kind).toBe("joker");
    for (const item of blocked.slice(at))
      if (item.kind !== "card") expect(item.key).not.toBe(first.key);
  });

  it("moves a queue on to its next card", () => {
    const s = settings("FZZUAJBR");
    const commons = jokerQueue(s, 1, 30);
    const blocked = jokerQueue(s, 1, 30, 1, [{ key: commons[0].key, from: 1 }]);
    expect(blocked[0].key).not.toBe(commons[0].key);
    expect(blocked.map((j) => j.key)).not.toContain(commons[0].key);
    const tarots = shopConsumableQueue(s, "Tarot", 20);
    const fewer = shopConsumableQueue(s, "Tarot", 20, [
      { key: tarots[2], from: 3 },
    ]);
    expect(fewer.slice(0, 2)).toEqual(tarots.slice(0, 2));
    expect(fewer.slice(2)).not.toContain(tarots[2]);
  });
});
