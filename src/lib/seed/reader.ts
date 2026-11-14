/**
 * What a seed rolls in a Multiplayer match with The Order on: the shop, every joker and
 * consumable queue, vouchers, skip tags and Lucky Cards.
 *
 * The Order (BalatroMultiplayerAPI, api/the_order/ and lovely/TheOrder.toml) makes the game's
 * queues run for the whole game instead of restarting every ante: card creation happens with
 * the ante set to 0, every joker rolls its rarity from the one "rarity0" stream whatever made
 * it, and each rarity has two queues, one for jokers without stickers and one for jokers with
 * them. A roll that hits an unavailable card takes the next card from the same queue. So each
 * queue below is a fixed list for a seed: what you get from it depends only on how many cards
 * you have taken from it so far.
 *
 * Each function starts from the beginning of the game and reads its queue as if nothing else
 * had drawn from it. Queues that are shared (the shop's jokers and Buffoon Packs', for one)
 * are noted where they are.
 */

import type { SeedPools } from "./pool-types";
import vanilla from "./pools.generated.json";
import { SeedRng } from "./pseudo";
import type { GameModeDef, RulesetDef } from "./rulesets";

const POOLS = vanilla as SeedPools;
export const UNAVAILABLE = "UNAVAILABLE";

export type Rarity = 1 | 2 | 3 | 4;
export type Edition = "foil" | "holo" | "polychrome" | "negative";
export type StickerId = "eternal" | "perishable" | "rental";
export type ConsumableSet = "Tarot" | "Planet" | "Spectral";

export interface JokerRoll {
  key: string;
  rarity: Rarity;
  edition?: Edition;
}

export interface ShopJoker extends JokerRoll {
  kind: "joker";
  stickers: StickerId[];
  /** Taken from the rarity's sticker queue rather than its stickerless one. */
  stickerQueue: boolean;
}

export type ShopItem =
  | ShopJoker
  | { kind: "consumable"; set: ConsumableSet; key: string }
  | {
      kind: "card";
      /** Playing card key, e.g. "H_K". */
      card: string;
      enhancement?: string;
      edition?: Edition;
    };

export interface ReaderSettings {
  /** The seed as the game shows it, with or without The Order's leading "*". */
  seed: string;
  ruleset: RulesetDef;
  /** The game mode, whose bans add to the ruleset's. */
  gameMode: GameModeDef;
  /** Stake number: 1 White … 4 Black (Eternals) … 7 Orange (Perishables), 8 Gold (Rentals). */
  stake: number;
}

/** Shop rates that vouchers and decks change, from a given shop slot on. */
export interface ShopModifiers {
  /** Ghost Deck: Spectral cards in the shop from the start (spectral_rate = 2). */
  ghostDeck?: boolean;
  /** Voucher key → the first shop slot (1-based) it applies to. */
  vouchers?: Partial<Record<ShopVoucher, number>>;
}

/** The vouchers that change what the shop rolls. */
export const SHOP_VOUCHERS = [
  "v_tarot_merchant",
  "v_tarot_tycoon",
  "v_planet_merchant",
  "v_planet_tycoon",
  "v_magic_trick",
  "v_illusion",
  "v_hone",
  "v_glow_up",
] as const;
export type ShopVoucher = (typeof SHOP_VOUCHERS)[number];

/** The seed the game runs on: The Order puts a "*" in front (lovely/TheOrder.toml). */
export function normalizeSeed(input: string): string {
  return `*${input.trim().toUpperCase().replace(/^\*/, "")}`;
}

// ---------------------------------------------------------------------------
// Pools

interface Pools {
  jokers: Record<Rarity, string[]>;
  Tarot: string[];
  Planet: string[];
  Spectral: string[];
  enhancements: string[];
  cards: string[];
  noEternal: Set<string>;
  noPerishable: Set<string>;
}

/** Everything banned in a match: the ruleset's bans and the game mode's. */
export function bannedKeys(settings: ReaderSettings): Set<string> {
  return new Set([...settings.ruleset.banned, ...settings.gameMode.banned]);
}

/** The pools as get_current_pool builds them, with the bans and the ruleset's additions. */
function buildPools(settings: ReaderSettings): Pools {
  const { ruleset } = settings;
  const banned = bannedKeys(settings);
  const mark = (key: string) => (banned.has(key) ? UNAVAILABLE : key);
  const jokers = {} as Record<Rarity, string[]>;
  for (const r of [1, 2, 3, 4] as Rarity[])
    jokers[r] = [
      ...POOLS.jokers[r].map(mark),
      ...(ruleset.added.jokers?.[r] ?? []),
    ];
  return {
    jokers,
    Tarot: POOLS.tarots.map(mark),
    // Planet X, Ceres and Eris need their hand played first; this reads as if it hasn't been.
    Planet: POOLS.planets.map((p) => (p.softlock ? UNAVAILABLE : mark(p.key))),
    // The Soul and Black Hole are never picked from the pool, only by their own roll.
    Spectral: POOLS.spectrals.map((s) =>
      s.hidden ? UNAVAILABLE : mark(s.key),
    ),
    enhancements: POOLS.enhancements.map(mark),
    cards: POOLS.cards,
    noEternal: new Set(POOLS.noEternal),
    noPerishable: new Set(POOLS.noPerishable),
  };
}

// ---------------------------------------------------------------------------
// Rolls

/**
 * SMODS.poll_rarity("Joker", key): Common 0.7, Uncommon 0.25, Rare 0.05, Legendary 0, as
 * weights divided by their total (same float steps as the Lua).
 */
function pollRarity(rng: SeedRng, key: string): Rarity {
  const poll = rng.random(key);
  const weights = [0.7, 0.25, 0.05, 0];
  let total = 0;
  for (const w of weights) total = total + w;
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc = acc + weights[i] / total;
    if (poll < acc) return (i + 1) as Rarity;
  }
  return 1;
}

/** The rarity a number roll stands for (create_card's _rarity as a number). */
function rarityOf(roll: number): Rarity {
  return roll > 0.95 ? 3 : roll > 0.7 ? 2 : 1;
}

/**
 * Steamodded's poll_edition. Options in the order it tries them, with their weights; the
 * three shiny ones scale with edition_rate (Hone 2, Glow Up 4) unless guaranteed.
 */
function pollEdition(
  rng: SeedRng,
  key: string,
  opts: {
    rate?: number;
    mod?: number;
    noNegative?: boolean;
    guaranteed?: boolean;
  } = {},
): Edition | undefined {
  const { rate = 1, mod = 1, noNegative = false, guaranteed = false } = opts;
  const poll = rng.random(key);
  const editions: [Edition, number, boolean][] = [
    ["negative", 3, false],
    ["polychrome", 3, true],
    ["holo", 14, true],
    ["foil", 20, true],
  ];
  let total = 0;
  for (const [, w] of editions) total = total + w;
  let modifier = 1;
  if (!guaranteed) {
    modifier = mod;
    total = total + (total / 4) * 96;
  }
  let acc = 0;
  for (const [name, w, scaled] of editions) {
    const weight = !guaranteed && scaled ? rate * w : w;
    acc = acc + weight * modifier;
    if (poll > 1 - acc / total && !(name === "negative" && noNegative))
      return name;
  }
  return undefined;
}

/** pseudorandom_element over a pool, taking the next entry while it's UNAVAILABLE. */
function drawFrom(rng: SeedRng, pool: readonly string[], key: string): string {
  let center = rng.element(pool, key);
  for (let it = 2; center === UNAVAILABLE; it++) {
    center = rng.element(pool, key);
    if (it > 1000) center = rng.element(pool, `${key}_resample${it}`);
  }
  return center;
}

class Game {
  readonly rng: SeedRng;
  readonly pools: Pools;
  readonly stake: number;

  constructor(settings: ReaderSettings) {
    this.rng = new SeedRng(normalizeSeed(settings.seed));
    this.pools = buildPools(settings);
    this.stake = settings.stake;
  }

  /**
   * A joker made in the shop or a pack (lovely/TheOrder.toml, "stable shop"): roll its
   * stickers, take it from the sticker queue if it got any, then roll its edition. A roll that
   * hits an unavailable joker rolls the stickers again and moves the edition queue on with it.
   */
  shopJoker(rarity: Rarity, editionRate: number): ShopJoker {
    const pk = `Joker${rarity}0`;
    const pool = this.pools.jokers[rarity];
    for (let it = 0; ; it++) {
      const etper = this.rng.random(`_etper${pk}`);
      let eternal = false;
      let perishable = false;
      let rental = false;
      if (this.stake >= 4 && etper > 0.7) eternal = true;
      else if (this.stake >= 7 && etper > 0.4 && etper <= 0.7)
        perishable = true;
      if (this.stake >= 8 && this.rng.random(`_rent${pk}`) > 0.7) rental = true;
      const s = eternal || perishable || rental ? "_sticker" : "";
      let key = this.rng.element(pool, pk + s);
      if (it > 1000) key = this.rng.element(pool, `${pk}${s}_resample${it}`);
      if (key !== UNAVAILABLE) {
        const edition = pollEdition(this.rng, `edi${pk}${s}`, {
          rate: editionRate,
        });
        // set_eternal / set_perishable only stick on jokers that allow them.
        const stickers: StickerId[] = [];
        if (eternal && !this.pools.noEternal.has(key)) stickers.push("eternal");
        if (perishable && !this.pools.noPerishable.has(key))
          stickers.push("perishable");
        if (rental) stickers.push("rental");
        return {
          kind: "joker",
          key,
          rarity,
          edition,
          stickers,
          stickerQueue: s !== "",
        };
      }
      this.rng.random(`edi${pk}${s}`);
    }
  }

  /** A joker that isn't made in the shop or a pack: no stickers, the stickerless queue. */
  plainJoker(rarity: Rarity, editionRate = 1): JokerRoll {
    const pk = rarity === 4 ? "Joker4" : `Joker${rarity}0`;
    const pool = this.pools.jokers[rarity];
    for (;;) {
      const key = this.rng.element(pool, pk);
      if (key !== UNAVAILABLE)
        return {
          key,
          rarity,
          edition: pollEdition(this.rng, `edi${pk}`, { rate: editionRate }),
        };
      this.rng.random(`edi${pk}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Queues

/** Joker queue of one rarity: stickerless (`stickers` false) or the sticker queue. */
export function jokerQueue(
  settings: ReaderSettings,
  rarity: Rarity,
  count: number,
  stickers = false,
  /** edition_rate: 1, Hone 2, Glow Up 4. */
  editionRate = 1,
): JokerRoll[] {
  const game = new Game(settings);
  const pk = rarity === 4 ? "Joker4" : `Joker${rarity}0`;
  const s = stickers && rarity !== 4 ? "_sticker" : "";
  const pool = game.pools.jokers[rarity];
  const out: JokerRoll[] = [];
  while (out.length < count) {
    const key = game.rng.element(pool, pk + s);
    const editionKey = `edi${pk}${s}`;
    if (key === UNAVAILABLE) {
      game.rng.random(editionKey);
      continue;
    }
    out.push({
      key,
      rarity,
      edition: pollEdition(game.rng, editionKey, { rate: editionRate }),
    });
  }
  return out;
}

/** Consumables from the shop ("Tarot", "Planet", "Spectral" with key_append = the set). */
export function shopConsumableQueue(
  settings: ReaderSettings,
  set: ConsumableSet,
  count: number,
): string[] {
  const game = new Game(settings);
  const key = `${set}${set}0`;
  return Array.from({ length: count }, () =>
    drawFrom(game.rng, game.pools[set], key),
  );
}

/**
 * Cards drawn in packs, one per card shown: Arcana (Tarot), Celestial (Planet) and Spectral
 * packs. Each card first rolls for The Soul (Tarot, Spectral) and Black Hole (Planet,
 * Spectral) on "soul_<set>0"; only when that misses does it take the next card from the pack
 * queue. A Spectral card rolls both, and Black Hole wins if both hit.
 */
export function packConsumableQueue(
  settings: ReaderSettings,
  set: ConsumableSet,
  count: number,
): string[] {
  const game = new Game(settings);
  const soulKey = `soul_${set}0`;
  const poolKey = `${set}${set}_pack0`;
  const banned = bannedKeys(settings);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    let forced: string | undefined;
    if (!banned.has("c_soul")) {
      if (set === "Tarot" || set === "Spectral")
        if (game.rng.random(soulKey) > 0.997) forced = "c_soul";
      if (set === "Planet" || set === "Spectral")
        if (game.rng.random(soulKey) > 0.997) forced = "c_black_hole";
    }
    out.push(forced ?? drawFrom(game.rng, game.pools[set], poolKey));
  }
  return out;
}

/**
 * Judgement's rarity on Black Stake and up (api/the_order/card_creation.lua): its own
 * "order_jud_rarity" roll. Below Black Stake Judgement rolls rarity from the shared rarity0
 * stream like every other joker.
 */
export function judgementRarities(
  settings: ReaderSettings,
  count: number,
): Rarity[] {
  const game = new Game(settings);
  return Array.from({ length: count }, () =>
    rarityOf(game.rng.random("order_jud_rarity")),
  );
}

/** Lucky Card rolls in order: +20 Mult (1 in 5) and $20 (1 in 15), each doubled per Oops! All 6s. */
export function luckyQueue(
  settings: ReaderSettings,
  count: number,
  oops = 0,
): { mult: boolean; money: boolean }[] {
  const game = new Game(settings);
  const n = 2 ** oops;
  return Array.from({ length: count }, () => ({
    mult: game.rng.random("lucky_mult") < n / 5,
    money: game.rng.random("lucky_money") < n / 15,
  }));
}

/**
 * Skip tags per ante (get_next_tag_key, unchanged by The Order): the Small Blind's tag, then
 * the Big Blind's, from "Tag<ante>". A tag the ante is too early for retries on its own
 * "Tag<ante>_resample<n>" stream.
 */
export function tagQueue(
  settings: ReaderSettings,
  antes: number,
): { ante: number; small: string; big: string }[] {
  const game = new Game(settings);
  const banned = bannedKeys(settings);
  const out: { ante: number; small: string; big: string }[] = [];
  for (let ante = 1; ante <= antes; ante++) {
    const pool = POOLS.tags.map((t) =>
      (t.minAnte ?? 0) > ante || banned.has(t.key) ? UNAVAILABLE : t.key,
    );
    const next = () => {
      let tag = game.rng.element(pool, `Tag${ante}`);
      for (let it = 2; tag === UNAVAILABLE; it++)
        tag = game.rng.element(pool, `Tag${ante}_resample${it}`);
      return tag;
    };
    const small = next();
    const big = next();
    out.push({ ante, small, big });
  }
  return out;
}

/**
 * The voucher each ante's shop offers (api/the_order/vouchers.lua). The pool is folded into
 * one slot per base/upgrade pair, which holds the base, or the upgrade once the base is owned,
 * and "Voucher0" picks a slot. A slot whose pair is fully owned is rolled again. With
 * `buyAll`, every voucher offered is assumed bought, so a pair offered again shows its upgrade.
 * The Voucher Tag draws from the same "Voucher0" stream.
 */
export function voucherQueue(
  settings: ReaderSettings,
  antes: number,
  buyAll: boolean,
  owned: readonly string[] = [],
): (string | null)[] {
  const game = new Game(settings);
  const have = new Set(owned);
  const banned = bannedKeys(settings);
  const out: (string | null)[] = [];
  for (let ante = 1; ante <= antes; ante++) {
    const pool = POOLS.vouchers.map((v) =>
      have.has(v.key) ||
      banned.has(v.key) ||
      v.requires.some((r) => !have.has(r))
        ? UNAVAILABLE
        : v.key,
    );
    const culled = cull(pool);
    if (culled.every((v) => v === UNAVAILABLE)) {
      out.push(null);
      continue;
    }
    let center = game.rng.element(culled, "Voucher0");
    for (let it = 2; center === UNAVAILABLE; it++) {
      center = game.rng.element(culled, "Voucher0");
      if (it > 1000) center = game.rng.element(culled, `Voucher0${it}`);
    }
    out.push(center);
    if (buyAll) have.add(center);
  }
  return out;
}

/** get_culled: each pair of the voucher pool becomes its available entries, or UNAVAILABLE. */
function cull(pool: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < pool.length; i += 2) {
    const first = pool[i];
    const second = pool[i + 1];
    if (second === undefined) out.push(first);
    else if (first !== UNAVAILABLE && second !== UNAVAILABLE)
      out.push(first, second);
    else if (first !== UNAVAILABLE) out.push(first);
    else if (second !== UNAVAILABLE) out.push(second);
    else out.push(UNAVAILABLE);
  }
  return out;
}

/**
 * The packs each shop offers: two per shop from "shop_pack0", by weight. The first shop's
 * first pack is always a Buffoon Pack (its art, 1 or 2, comes from an unseeded roll).
 */
export function packQueue(settings: ReaderSettings, shops: number): string[][] {
  const game = new Game(settings);
  const banned = bannedKeys(settings);
  const boosters = POOLS.boosters.filter((b) => !banned.has(b.key));
  let cume = 0;
  for (const b of boosters) cume = cume + b.weight;
  const roll = () => {
    const poll = game.rng.random("shop_pack0") * cume;
    let it = 0;
    for (const b of boosters) {
      it = it + b.weight;
      if (it >= poll && it - b.weight <= poll) return b.key;
    }
    return boosters[boosters.length - 1].key;
  };
  return Array.from({ length: shops }, (_, i) =>
    i === 0 ? ["p_buffoon_normal_1", roll()] : [roll(), roll()],
  );
}

export const PACK_SIZES: Record<string, { size: number; choose: number }> =
  Object.fromEntries(
    POOLS.boosters.map((b) => [b.key, { size: b.size, choose: b.choose }]),
  );

/**
 * Every card the shop rolls, slot after slot across shops and rerolls (create_card_for_shop
 * with The Order's "cdt0"): its type by the shop's rates, then the card itself. Jokers here
 * share their queues with Buffoon Packs, so a Buffoon Pack opened in between moves them on.
 */
export function shopQueue(
  settings: ReaderSettings,
  count: number,
  mods: ShopModifiers = {},
): ShopItem[] {
  const game = new Game(settings);
  const rng = game.rng;
  const out: ShopItem[] = [];
  for (let slot = 1; slot <= count; slot++) {
    const has = (v: ShopVoucher) => (mods.vouchers?.[v] ?? Infinity) <= slot;
    const tarotRate = has("v_tarot_tycoon")
      ? 4 * (32 / 4)
      : has("v_tarot_merchant")
        ? 4 * (9.6 / 4)
        : 4;
    const planetRate = has("v_planet_tycoon")
      ? 4 * (32 / 4)
      : has("v_planet_merchant")
        ? 4 * (9.6 / 4)
        : 4;
    const illusion = has("v_illusion");
    const cardRate = illusion || has("v_magic_trick") ? 4 : 0;
    const spectralRate = mods.ghostDeck ? 2 : 0;
    const editionRate = has("v_glow_up") ? 4 : has("v_hone") ? 2 : 1;

    const total = 20 + tarotRate + planetRate + cardRate + spectralRate;
    const polled = rng.random("cdt0") * total;
    const cardType =
      illusion && rng.random("illusion") > 0.6 ? "Enhanced" : "Base";
    const rates: [string, number][] = [
      ["Joker", 20],
      ["Tarot", tarotRate],
      ["Planet", planetRate],
      [cardType, cardRate],
      ["Spectral", spectralRate],
    ];
    let check = 0;
    let type = "Joker";
    for (const [t, val] of rates) {
      if (polled > check && polled <= check + val) {
        type = t;
        break;
      }
      check = check + val;
    }

    if (type === "Joker") {
      const rarity = pollRarity(rng, "rarity0");
      out.push(game.shopJoker(rarity, editionRate));
    } else if (type === "Tarot" || type === "Planet" || type === "Spectral") {
      out.push({
        kind: "consumable",
        set: type,
        key: drawFrom(rng, game.pools[type], `${type}${type}0`),
      });
    } else {
      // Base / Enhanced keep their "sho" key_append under The Order.
      const enhancement =
        type === "Enhanced"
          ? drawFrom(rng, game.pools.enhancements, "Enhancedsho0")
          : undefined;
      const card = rng.element(game.pools.cards, "frontsho0");
      const edition =
        illusion && rng.random("illusion") > 0.8
          ? pollEdition(rng, "illusion", { noNegative: true, guaranteed: true })
          : undefined;
      out.push({ kind: "card", card, enhancement, edition });
    }
  }
  return out;
}

/** The Soul's legendary: the legendary queue, without stickers ("Joker4"). */
export function legendaryQueue(settings: ReaderSettings, count: number) {
  return jokerQueue(settings, 4, count);
}

/** Exposed for tests. */
export const _internal = { pollEdition, pollRarity, buildPools, Game };
