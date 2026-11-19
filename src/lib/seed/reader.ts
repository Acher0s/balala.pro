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

import { LuaRandom } from "./lua-random";
import type { SeedPools } from "./pool-types";
import vanilla from "./pools.generated.json";
import { SeedRng } from "./pseudo";
import type { DeckId, GameModeDef, RulesetDef } from "./rulesets";

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
  /**
   * The roll landed on Cavendish first (or Gros Michel once it's extinct) and passed it by for
   * Gros Michel's pool flag: with the flag the other way, that joker would be here.
   */
  flagged?: string;
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
  /**
   * Stake number: 1 White … 4 Black (Eternals) … 7 Orange (Perishables), 8 Gold (Rentals),
   * 9 Spectral+ (all three, like Gold).
   */
  stake: number;
  /** Penny Pincher's slot is open (after the first PvP blind), where the ruleset has it. */
  pincherUnlocked?: boolean;
  /** A deck that changes a queue (Violet: vouchers, Orange: Standard Packs, Ghost: shop). */
  deck?: DeckId;
  /**
   * Enhancements the deck has a card with ("m_glass", …): Glass Joker, Steel Joker, Stone
   * Joker, Lucky Cat and Golden Ticket are only in the pool while it does.
   */
  enhancements?: readonly string[];
  /**
   * Planet X, Ceres and Eris whose hand hasn't been played yet (their softlock): never picked
   * while listed. Left out, they're read as unlocked.
   */
  softlocked?: readonly string[];
  /**
   * Gros Michel went extinct (G.GAME.pool_flags.gros_michel_extinct): Cavendish's
   * yes_pool_flag, Gros Michel's no_pool_flag. Until then Cavendish is never picked, and after
   * it Gros Michel isn't.
   */
  grosMichelExtinct?: boolean;
  /** Internal: both pool-flag jokers open (for reporting what a lock passed by). */
  poolFlagsOpen?: boolean;
  /**
   * A late start: read on from a point in a run (a replayed match log) instead of from its
   * first roll. Every queue goes on from these stream states, and skips `owned`.
   */
  start?: ReaderStart;
}

/** Where a late start picks up: the streams as they stood, and the cards that existed. */
export interface ReaderStart {
  /** pseudoseed state per stream key, for the streams rolled so far. */
  states: readonly (readonly [string, number])[];
  /** Cards that exist at that point (held, on screen, in use): every queue skips them. */
  owned: readonly string[];
  /** Shop vouchers redeemed by then (Overstock, Tarot Merchant, Hone, …). */
  vouchers: readonly ShopVoucher[];
  ante: number;
  /** Shops entered by then: the pack queue goes on from the next one. */
  shops: number;
  /** Where in the run, e.g. "Ante 3 · Shop after Big Blind". */
  place: string;
}

/** Why a roll passed a card by: it exists in the run, or its in_pool condition isn't met. */
export type SkipReason = "owned" | "locked";
/** Told about every card a roll lands on and passes by, with the stream it was rolled on. */
export type SkipHook = (
  key: string,
  reason: SkipReason,
  stream: string,
) => void;

/** A pool to report skips from: `open` is the same pool with every lock opened. */
interface Watch {
  open: readonly string[];
  onSkip: SkipHook;
}

/** Shop rates that vouchers and decks change, from a given shop slot on. */
/**
 * A card that is "blocked" from a position on: it exists in the run (you have it, or it's on
 * screen), so every roll from that position skips it, as get_current_pool skips cards in
 * G.GAME.used_jokers. Positions are 1-based: a shop slot, or a place in a queue.
 */
export interface Block {
  key: string;
  from: number;
  /** The last position it's blocked at; open-ended when absent. */
  to?: number;
}

/** The blocked keys at `position`. */
export function blockedAt(
  blocks: readonly Block[] | undefined,
  position: number,
): Set<string> {
  return new Set(
    (blocks ?? [])
      .filter((b) => b.from <= position && (b.to ?? Infinity) >= position)
      .map((b) => b.key),
  );
}

/** Makes `owned` hold exactly the keys blocked at `position`. */
function applyBlocks(
  owned: Set<string>,
  blocks: readonly Block[] | undefined,
  position: number,
  /** Cards that exist from the start (a late start's held cards). */
  held: ReadonlySet<string> = new Set(),
) {
  owned.clear();
  for (const key of held) owned.add(key);
  for (const key of blockedAt(blocks, position)) owned.add(key);
}

export interface ShopModifiers {
  /** Ghost Deck: Spectral cards in the shop from the start (spectral_rate = 2). */
  ghostDeck?: boolean;
  /** Voucher key → the first shop slot (1-based) it applies to. */
  vouchers?: Partial<Record<ShopVoucher, number>>;
  /** The first shop slot after the first PvP blind, from which Penny Pincher can show up. */
  pincherFrom?: number;
  /** Cards blocked from a shop slot on. */
  blocks?: readonly Block[];
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
  /**
   * Where a joker pool holds the joker Gros Michel's pool flag keeps out (Cavendish until it's
   * extinct, Gros Michel after): index → key, to show where it would have been.
   */
  flagged: Partial<Record<Rarity, { index: number; key: string }>>;
}

/**
 * Everything banned in a match: the ruleset's bans and the game mode's, and on Small World the
 * cards it culled. `beforeCull` leaves the cull out: the ante-1 tags and voucher are rolled in
 * start_run, before Small World culls (lovely/ban_timing.toml applies only the declared bans).
 */
export function bannedKeys(
  settings: ReaderSettings,
  beforeCull = false,
): Set<string> {
  const keys = new Set([
    ...settings.ruleset.banned,
    ...settings.gameMode.banned,
  ]);
  if (settings.ruleset.smallWorld && !beforeCull)
    for (const k of smallWorldBans(settings)) keys.add(k);
  return keys;
}

/** By ruleset (each patch has its own Small World, with its own pools), then seed. */
const smallWorldCache = new WeakMap<object, Map<string, Set<string>>>();

/**
 * The cards Small World bans for a seed (layers/smallworld.lua, on apply_bans). Every pool of
 * cards not already banned (G.GAME.banned_keys: not the ones whose in_pool says no) is sorted
 * by key and shuffled with pseudoshuffle on "<pool>_mp_smallworld", and its first 75% (rounded)
 * are banned, one fewer for vouchers. The pools are each joker rarity ("Joker1" …), Tarot,
 * Planet, Spectral, base vouchers, packs and tags; upgrades, The Soul, Black Hole and Cavendish
 * aren't in them. An upgrade goes with its base voucher, Cavendish with Gros Michel.
 */
export function smallWorldBans(settings: ReaderSettings): Set<string> {
  const seed = normalizeSeed(settings.seed);
  const id = `${seed}|${settings.gameMode.id}`;
  let cache = smallWorldCache.get(settings.ruleset);
  if (!cache) {
    cache = new Map();
    smallWorldCache.set(settings.ruleset, cache);
  }
  const hit = cache.get(id);
  if (hit) return hit;

  const { pre, tables, vouchers } = smallWorldTables(settings);
  const rng = new SeedRng(seed);
  const lua = new LuaRandom();
  const out = new Set<string>();
  for (const [name, all] of Object.entries(tables)) {
    // table.sort compares strings byte by byte; the keys are ASCII.
    const list = all.filter((k) => !pre.has(k)).sort();
    // pseudoshuffle: math.randomseed(seed), then swap each i (from the end) with math.random(i).
    lua.seed(rng.pseudoseed(`${name}_mp_smallworld`));
    for (let i = list.length; i >= 2; i--) {
      const j = lua.randint(1, i);
      [list[i - 1], list[j - 1]] = [list[j - 1], list[i - 1]];
    }
    const threshold = Math.floor(0.5 + list.length * 0.75);
    // Vouchers start the count at 2 (unless legacy_smallworld), so one fewer is banned.
    const n = name === "Voucher" ? threshold - 1 : threshold;
    for (const k of list.slice(0, Math.max(0, n))) out.add(k);
  }
  for (const v of vouchers)
    if (v.requires.length > 0 && out.has(v.requires[0])) out.add(v.key);
  if (out.has("j_gros_michel")) out.add("j_cavendish");
  cache.set(id, out);
  return out;
}

/** The pools Small World culls, by its names for them ("Joker1", "Tarot", …). */
export const SMALL_WORLD_POOLS = [
  "Joker4",
  "Joker3",
  "Joker2",
  "Joker1",
  "Tarot",
  "Planet",
  "Spectral",
  "Voucher",
  "Booster",
  "Tag",
] as const;

/**
 * What's left of each pool after Small World's cull, in pool order: the cards you can still
 * get (base vouchers only; Cavendish is listed with the Commons when Gros Michel is left).
 */
export function smallWorldPools(
  settings: ReaderSettings,
): Record<(typeof SMALL_WORLD_POOLS)[number], string[]> {
  const { pre, tables } = smallWorldTables(settings);
  const bans = smallWorldBans(settings);
  const left = (name: string) =>
    (tables[name] ?? []).filter((k) => !pre.has(k) && !bans.has(k));
  const out = Object.fromEntries(
    SMALL_WORLD_POOLS.map((name) => [name, left(name)]),
  ) as Record<(typeof SMALL_WORLD_POOLS)[number], string[]>;
  if (!bans.has("j_cavendish") && !pre.has("j_cavendish"))
    out.Joker1.push("j_cavendish");
  return out;
}

/** The pools Small World shuffles, and the bans it reads (G.GAME.banned_keys) before it does. */
function smallWorldTables(settings: ReaderSettings) {
  const { ruleset, gameMode } = settings;
  const closed = new Set(ruleset.closed ?? []);
  const pre = new Set([
    ...ruleset.banned.filter((k) => !closed.has(k)),
    ...gameMode.banned,
  ]);
  const vouchers = [...POOLS.vouchers, ...(ruleset.added.vouchers ?? [])];
  const tables: Record<string, string[]> = {
    Tarot: POOLS.tarots,
    Planet: [
      ...POOLS.planets.map((p) => p.key),
      ...(ruleset.added.Planet ?? []),
    ],
    Spectral: [
      ...POOLS.spectrals.filter((c) => !c.hidden).map((c) => c.key),
      ...(ruleset.added.Spectral ?? []),
    ],
    Voucher: vouchers.filter((v) => v.requires.length === 0).map((v) => v.key),
    Booster: [
      ...POOLS.boosters.map((b) => b.key),
      ...(ruleset.added.boosters ?? []),
    ],
    Tag: [...POOLS.tags.map((t) => t.key), ...(ruleset.added.tags ?? [])],
  };
  for (const r of [1, 2, 3, 4] as Rarity[])
    tables[`Joker${r}`] = [
      ...POOLS.jokers[r],
      ...(ruleset.added.jokers?.[r] ?? []),
    ].filter((k) => k !== "j_cavendish");
  return { pre, tables, vouchers };
}

/**
 * A set that never holds anything. On Small World duplicates are allowed (SMODS.showman is
 * always true), so a card in the run is never skipped.
 */
class NoneSet extends Set<string> {
  override add(): this {
    return this;
  }
}

/** Every slot that's never picked: the bans, and Penny Pincher while it's locked. */
function unavailableKeys(settings: ReaderSettings): Set<string> {
  const keys = bannedKeys(settings);
  if (settings.ruleset.pennyPincher && !settings.pincherUnlocked)
    keys.add("j_mp_penny_pincher");
  const has = new Set(settings.enhancements ?? []);
  for (const [joker, gate] of Object.entries(POOLS.enhancementGates))
    if (!has.has(gate)) keys.add(joker);
  for (const planet of settings.softlocked ?? []) keys.add(planet);
  if (!settings.poolFlagsOpen)
    keys.add(settings.grosMichelExtinct ? "j_gros_michel" : "j_cavendish");
  return keys;
}

/** Every enhancement a joker's slot waits for. */
export const GATE_ENHANCEMENTS = [
  ...new Set(Object.values(POOLS.enhancementGates)),
];

/** The pools with every lock open (gates, Penny Pincher, softlocks): bans only. */
function openPools(settings: ReaderSettings): Pools {
  return buildPools({
    ...settings,
    pincherUnlocked: true,
    enhancements: GATE_ENHANCEMENTS,
    softlocked: [],
    poolFlagsOpen: true,
  });
}

/** Tells `watch` about a card a roll landed on at `index` of `pool`, if it's passed by. */
function report(
  watch: Watch | undefined,
  pool: readonly string[],
  index: number,
  owned: ReadonlySet<string> | undefined,
  stream: string,
) {
  if (!watch) return;
  const center = pool[index];
  const real = watch.open[index];
  if (center === UNAVAILABLE) {
    if (real !== undefined && real !== UNAVAILABLE)
      watch.onSkip(real, "locked", stream);
  } else if (owned?.has(center)) watch.onSkip(center, "owned", stream);
}

/** The pools as get_current_pool builds them, with the bans and the ruleset's additions. */
function buildPools(settings: ReaderSettings): Pools {
  const { ruleset } = settings;
  const banned = unavailableKeys(settings);
  const mark = (key: string) => (banned.has(key) ? UNAVAILABLE : key);
  const jokers = {} as Record<Rarity, string[]>;
  const flagged: Pools["flagged"] = {};
  const flagKey = settings.poolFlagsOpen
    ? undefined
    : settings.grosMichelExtinct
      ? "j_gros_michel"
      : "j_cavendish";
  const otherwise = flagKey
    ? unavailableKeys({ ...settings, poolFlagsOpen: true })
    : undefined;
  for (const r of [1, 2, 3, 4] as Rarity[]) {
    const all = [...POOLS.jokers[r], ...(ruleset.added.jokers?.[r] ?? [])];
    jokers[r] = all.map(mark);
    const index = flagKey ? all.indexOf(flagKey) : -1;
    if (flagKey && index >= 0 && !otherwise?.has(flagKey))
      flagged[r] = { index, key: flagKey };
  }
  return {
    jokers,
    flagged,
    Tarot: POOLS.tarots.map(mark),
    // Planet X, Ceres and Eris need their hand played first (softlock); like the gated
    // jokers, they're read as in the pool.
    Planet: [
      ...POOLS.planets.map((p) => p.key),
      ...(ruleset.added.Planet ?? []),
    ].map(mark),
    // The Soul and Black Hole are never picked from the pool, only by their own roll.
    Spectral: [
      ...POOLS.spectrals.map((s) => (s.hidden ? UNAVAILABLE : s.key)),
      ...(ruleset.added.Spectral ?? []),
    ].map(mark),
    enhancements: POOLS.enhancements.map(mark),
    cards: POOLS.cards,
    noEternal: new Set([...POOLS.noEternal, ...(ruleset.noEternal ?? [])]),
    noPerishable: new Set([
      ...POOLS.noPerishable,
      ...(ruleset.noPerishable ?? []),
    ]),
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

/**
 * pseudorandom_element over a pool, taking the next entry while it's UNAVAILABLE, or a card
 * that already exists in the run (`owned`: get_current_pool's used_jokers check).
 */
function drawFrom(
  rng: SeedRng,
  pool: readonly string[],
  key: string,
  owned?: ReadonlySet<string>,
  watch?: Watch,
): string {
  const gone = (c: string) => c === UNAVAILABLE || (owned?.has(c) ?? false);
  const pick = (stream: string) => {
    const i = rng.index(pool.length, stream);
    report(watch, pool, i, owned, stream);
    return pool[i];
  };
  let center = pick(key);
  for (let it = 2; gone(center); it++) {
    center = pick(key);
    if (it > 1000) center = pick(`${key}_resample${it}`);
  }
  return center;
}

class Game {
  readonly rng: SeedRng;
  /** Replaced mid-run when a pool opens up (Penny Pincher). */
  pools: Pools;
  /** Cards that exist in the run right now: skipped like unavailable ones. */
  readonly owned: Set<string>;
  readonly stake: number;

  /** Cards a late start begins with (settings.start.owned). */
  readonly held: ReadonlySet<string>;

  constructor(settings: ReaderSettings) {
    this.held = new Set(
      settings.ruleset.smallWorld ? [] : (settings.start?.owned ?? []),
    );
    this.owned = settings.ruleset.smallWorld
      ? new NoneSet()
      : new Set(this.held);
    this.rng = new SeedRng(
      normalizeSeed(settings.seed),
      settings.start && new Map(settings.start.states),
    );
    this.pools = buildPools(settings);
    this.stake = settings.stake;
  }

  /** Reports every card a roll passes by, from `open` (the pools with every lock open). */
  watch?: { open: Pools; onSkip: SkipHook };

  /** The watch for one of the pools, if anything is watching. */
  watchOf(pick: (p: Pools) => readonly string[]): Watch | undefined {
    return (
      this.watch && { open: pick(this.watch.open), onSkip: this.watch.onSkip }
    );
  }

  /** A copy whose streams and owned cards go on from here without touching this one. */
  clone(): Game {
    const copy = Object.create(Game.prototype) as Game;
    Object.assign(copy, this, {
      rng: this.rng.clone(),
      owned:
        this.owned instanceof NoneSet ? new NoneSet() : new Set(this.owned),
    });
    return copy;
  }

  /**
   * A joker made in the shop or a pack (lovely/TheOrder.toml, "stable shop"): roll its
   * stickers, take it from the sticker queue if it got any, then roll its edition. A roll that
   * hits an unavailable joker rolls the stickers again and moves the edition queue on with it.
   */
  shopJoker(rarity: Rarity, editionRate: number): ShopJoker {
    const pk = `Joker${rarity}0`;
    const pool = this.pools.jokers[rarity];
    let flagged: string | undefined;
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
      const watch = this.watchOf((p) => p.jokers[rarity]);
      const pick = (stream: string) => {
        const i = this.rng.index(pool.length, stream);
        report(watch, pool, i, this.owned, stream);
        return pool[i];
      };
      const index = this.rng.index(pool.length, pk + s);
      report(watch, pool, index, this.owned, pk + s);
      let key = pool[index];
      const flag = this.pools.flagged[rarity];
      if (flag?.index === index) flagged ??= flag.key;
      if (it > 1000) key = pick(`${pk}${s}_resample${it}`);
      if (key !== UNAVAILABLE && !this.owned.has(key)) {
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
          ...(flagged ? { flagged } : {}),
        };
      }
      this.rng.random(`edi${pk}${s}`);
    }
  }

  /** A joker that isn't made in the shop or a pack: no stickers, the stickerless queue. */
  plainJoker(rarity: Rarity, editionRate = 1): JokerRoll {
    const pk = rarity === 4 ? "Joker4" : `Joker${rarity}0`;
    const pool = this.pools.jokers[rarity];
    const watch = this.watchOf((p) => p.jokers[rarity]);
    for (;;) {
      const i = this.rng.index(pool.length, pk);
      report(watch, pool, i, this.owned, pk);
      const key = pool[i];
      if (key !== UNAVAILABLE && !this.owned.has(key))
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

/**
 * One of a rarity's two raw queues: stickerless (`stickers` false) or the sticker queue, as
 * the pool stream and its edition stream give them.
 */
export function rawJokerQueue(
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

/**
 * The jokers of one rarity the shop and Buffoon Packs give, in order: each rolls its stickers
 * first (Black Stake and up), and takes the next joker from the sticker queue if it got one,
 * from the stickerless queue if not. Legendaries (The Soul) never get stickers.
 */
export function jokerQueue(
  settings: ReaderSettings,
  rarity: Rarity,
  count: number,
  /** edition_rate: 1, Hone 2, Glow Up 4. */
  editionRate = 1,
  /** Jokers blocked from a place in this queue on. */
  blocks?: readonly Block[],
): ShopJoker[] {
  const game = new Game(settings);
  return Array.from({ length: count }, (_, i) => {
    applyBlocks(game.owned, blocks, i + 1, game.held);
    return rarity === 4
      ? {
          ...game.plainJoker(4, editionRate),
          kind: "joker" as const,
          stickers: [],
          stickerQueue: false,
        }
      : game.shopJoker(rarity, editionRate);
  });
}

/** Consumables from the shop ("Tarot", "Planet", "Spectral" with key_append = the set). */
export function shopConsumableQueue(
  settings: ReaderSettings,
  set: ConsumableSet,
  count: number,
  /** Cards blocked from a place in this queue on. */
  blocks?: readonly Block[],
): string[] {
  const game = new Game(settings);
  const key = `${set}${set}0`;
  return Array.from({ length: count }, (_, i) => {
    applyBlocks(game.owned, blocks, i + 1, game.held);
    return drawFrom(game.rng, game.pools[set], key, game.owned);
  });
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
  /** Cards blocked from a place in this queue on. */
  blocks?: readonly Block[],
): string[] {
  const game = new Game(settings);
  const soulKey = `soul_${set}0`;
  const poolKey = `${set}${set}_pack0`;
  const banned = bannedKeys(settings);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    applyBlocks(game.owned, blocks, i + 1, game.held);
    let forced: string | undefined;
    // A Soul or Black Hole that exists isn't rolled for at all (create_card's used_jokers check).
    if (!banned.has("c_soul")) {
      if ((set === "Tarot" || set === "Spectral") && !game.owned.has("c_soul"))
        if (game.rng.random(soulKey) > 0.997) forced = "c_soul";
      if (
        (set === "Planet" || set === "Spectral") &&
        !game.owned.has("c_black_hole")
      )
        if (game.rng.random(soulKey) > 0.997) forced = "c_black_hole";
    }
    out.push(
      forced ?? drawFrom(game.rng, game.pools[set], poolKey, game.owned),
    );
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
  const all = [
    ...POOLS.tags,
    ...(settings.ruleset.added.tags ?? []).map((key) => ({
      key,
      minAnte: undefined as number | undefined,
    })),
  ];
  const draw = (bans: Set<string>, ante: number, key: string) => {
    const pool = all.map((t) =>
      (t.minAnte ?? 0) > ante || bans.has(t.key) ? UNAVAILABLE : t.key,
    );
    let tag = game.rng.element(pool, key);
    for (let it = 2; tag === UNAVAILABLE; it++)
      tag = game.rng.element(pool, `${key}_resample${it}`);
    return tag;
  };
  for (let ante = 1; ante <= antes; ante++) {
    // Small World culls after start_run has rolled the first ante's tags.
    const bans =
      ante === 1 && settings.ruleset.smallWorld
        ? bannedKeys(settings, true)
        : banned;
    let small = draw(bans, ante, `Tag${ante}`);
    let big = draw(bans, ante, `Tag${ante}`);
    if (ante === 1 && settings.ruleset.smallWorld) {
      // Small World's Tag:init swaps a banned tag for get_next_tag_key("replace"), with the
      // ante set to 10 under The Order: "Tagreplace10". The blind screen makes the Small
      // Blind's tag first, then the Big Blind's.
      if (banned.has(small)) small = draw(banned, 10, "Tagreplace10");
      if (banned.has(big)) big = draw(banned, 10, "Tagreplace10");
    }
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
  /** Whether the voucher `key` offered in `ante` is bought; true buys all of them. */
  bought: boolean | ((ante: number, key: string) => boolean),
  owned: readonly string[] = [],
  /** Told about a roll that lands on a slot passed by because its vouchers are owned. */
  onOwned?: (ante: number, keys: string[]) => void,
): string[][] {
  const game = new Game(settings);
  const have = new Set(owned);
  const all = [...POOLS.vouchers, ...(settings.ruleset.added.vouchers ?? [])];
  const culledBans = bannedKeys(settings);
  // Small World culls after start_run has rolled the first ante's vouchers.
  const firstBans = bannedKeys(settings, true);
  // vouchers_in_shop + extra_vouchers: Violet Deck adds one (SMODS.change_voucher_limit(1)),
  // before the first ante's vouchers are rolled.
  const perAnte = 1 + (settings.deck === "violet" ? 1 : 0);
  const out: string[][] = [];
  for (let ante = 1; ante <= antes; ante++) {
    const banned = ante === 1 ? firstBans : culledBans;
    const pool = [
      ...POOLS.vouchers,
      ...(settings.ruleset.added.vouchers ?? []),
    ].map((v) =>
      have.has(v.key) ||
      banned.has(v.key) ||
      v.requires.some((r) => !have.has(r))
        ? UNAVAILABLE
        : v.key,
    );
    const culled = cull(pool);
    const sources = cullSources(
      pool,
      all.map((v) => v.key),
    );
    const size = pool.filter((v) => v !== UNAVAILABLE).length;
    const offered: string[] = [];
    const pick = (stream: string) => {
      const i = game.rng.index(culled.length, stream);
      if (culled[i] === UNAVAILABLE && onOwned) {
        const mine = sources[i].filter((k) => have.has(k));
        if (mine.length > 0) onOwned(ante, mine);
      }
      return culled[i];
    };
    for (let i = 0; i < Math.min(size, perAnte); i++) {
      // The mod's guard: stop when no slot is left that this ante hasn't offered.
      if (!culled.some((v) => v !== UNAVAILABLE && !offered.includes(v))) break;
      let center = pick("Voucher0");
      for (
        let it = 2;
        center === UNAVAILABLE || offered.includes(center);
        it++
      ) {
        center = pick("Voucher0");
        if (it > 1000) center = pick(`Voucher0${it}`);
      }
      offered.push(center);
    }
    out.push(offered);
    for (const v of offered)
      if (bought === true || (typeof bought === "function" && bought(ante, v)))
        have.add(v);
  }
  return out;
}

/** For each entry `cull(pool)` gives, the keys of `keys` it stands for. */
function cullSources(pool: string[], keys: string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < pool.length; i += 2) {
    const first = pool[i];
    const second = pool[i + 1];
    if (second === undefined) out.push([keys[i]]);
    else if (first !== UNAVAILABLE && second !== UNAVAILABLE)
      out.push([keys[i]], [keys[i + 1]]);
    else if (first !== UNAVAILABLE) out.push([keys[i]]);
    else if (second !== UNAVAILABLE) out.push([keys[i + 1]]);
    else out.push([keys[i], keys[i + 1]]);
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
  // get_pack's first-shop Buffoon Pack is skipped when p_buffoon_normal_1 is banned.
  const buffoon = !banned.has("p_buffoon_normal_1");
  // A late start reads on from the next shop (the log doesn't roll this stream, so it's
  // rolled here from the first shop).
  const skip = settings.start?.shops ?? 0;
  return Array.from({ length: shops + skip }, (_, i) =>
    i === 0 && buffoon ? ["p_buffoon_normal_1", roll()] : [roll(), roll()],
  ).slice(skip);
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
  const sim = new ShopSim(settings, mods);
  return Array.from({ length: count }, (_, i) => {
    applyBlocks(sim.owned, mods.blocks, i + 1, sim.held);
    return sim.next();
  });
}

/**
 * The shop rolled one step at a time, so other things that draw from the same queues can be
 * put in between: `next()` is one shop slot, `buffoonCard()` one card in a Buffoon Pack.
 * Cards in `owned` (on screen, held, in a pack) are skipped like the game skips them.
 */
export class ShopSim {
  private readonly game: Game;
  private locked: Pools;
  private unlocked: Pools;
  private settings: ReaderSettings;
  private slotNo = 0;
  readonly mods: ShopModifiers;

  private readonly ghost: boolean;

  constructor(settings: ReaderSettings, mods: ShopModifiers = {}) {
    this.game = new Game(settings);
    this.ghost = settings.deck === "ghost";
    this.mods = mods;
    this.settings = settings;
    this.locked = this.game.pools;
    this.unlocked = settings.ruleset.pennyPincher
      ? buildPools({ ...settings, pincherUnlocked: true })
      : this.locked;
    this.pincherUnlocked = settings.pincherUnlocked ?? false;
  }

  /** Penny Pincher's slot is open from now on. */
  pincherUnlocked: boolean;

  /** The deck's enhancements changed (a Glass Card bought, …): gated jokers follow. */
  setEnhancements(enhancements: readonly string[]): void {
    this.setLocks({ enhancements });
  }

  /** The deck's enhancements or the softlocked planets changed: the pools follow. */
  setLocks(
    locks: Pick<
      ReaderSettings,
      "enhancements" | "softlocked" | "grosMichelExtinct"
    >,
  ): void {
    this.settings = { ...this.settings, ...locks };
    this.locked = buildPools({ ...this.settings, pincherUnlocked: false });
    this.unlocked = this.settings.ruleset.pennyPincher
      ? buildPools({ ...this.settings, pincherUnlocked: true })
      : this.locked;
  }

  /**
   * Reports every card a roll lands on and passes by from now on: one that exists in the run
   * ("owned"), or one whose in_pool says no yet ("locked": a gated joker, Penny Pincher, a
   * softlocked planet). Bans aren't reported.
   */
  watch(onSkip: SkipHook | undefined): void {
    this.game.watch = onSkip && {
      open: openPools(this.settings),
      onSkip,
    };
  }

  /** A copy that rolls on from here without moving this one's streams. */
  fork(): ShopSim {
    const copy = Object.create(ShopSim.prototype) as ShopSim;
    Object.assign(copy, this, {
      game: this.game.clone(),
      mods: { ...this.mods, vouchers: { ...this.mods.vouchers } },
    });
    return copy;
  }

  /** Moves a stream on `n` draws without using them. */
  skip(stream: string, n: number): void {
    for (let i = 0; i < n; i++) this.game.rng.random(stream);
  }

  /** One draw from a stream, for a chance roll (Hallucination's "halu0", …). */
  chance(stream: string): number {
    return this.game.rng.random(stream);
  }

  /**
   * A Tarot, Planet or Spectral made outside the shop and packs (The Emperor, Cartomancer,
   * Vagabond, Purple Seals, Séance, …): under The Order it takes the shop's queue.
   */
  consumable(set: ConsumableSet): string {
    this.selectPools(this.slotNo + 1);
    const { game } = this;
    return drawFrom(
      game.rng,
      game.pools[set],
      `${set}${set}0`,
      game.owned,
      game.watchOf((p) => p[set]),
    );
  }

  /**
   * One card of an Arcana (Tarot), Celestial (Planet) or Spectral Pack: The Soul / Black Hole
   * roll on "soul_<set>0" first (skipped while one exists), then the pack queue.
   */
  packConsumable(set: ConsumableSet): string {
    this.selectPools(this.slotNo + 1);
    const { game } = this;
    const rng = game.rng;
    let forced: string | undefined;
    const soulKey = `soul_${set}0`;
    if (!this.banned.has("c_soul")) {
      if ((set === "Tarot" || set === "Spectral") && !game.owned.has("c_soul"))
        if (rng.random(soulKey) > 0.997) forced = "c_soul";
      if (
        (set === "Planet" || set === "Spectral") &&
        !game.owned.has("c_black_hole")
      )
        if (rng.random(soulKey) > 0.997) forced = "c_black_hole";
    }
    return (
      forced ??
      drawFrom(
        rng,
        game.pools[set],
        `${set}${set}_pack0`,
        game.owned,
        game.watchOf((p) => p[set]),
      )
    );
  }

  private get banned(): Set<string> {
    return bannedKeys(this.settings);
  }

  /** Cards that exist in the run: the shop and packs skip them. */
  get owned(): Set<string> {
    return this.game.owned;
  }

  /** Cards a late start begins with. */
  get held(): ReadonlySet<string> {
    return this.game.held;
  }

  /**
   * A late start from here: the streams as they are now, with `owned` existing, and the
   * locks (enhancements, softlocked planets, pool flags, Penny Pincher) as they are now.
   */
  lateStart(
    owned: readonly string[],
    ante: number,
    shops: number,
    place: string,
  ): ReaderSettings {
    const vouchers = SHOP_VOUCHERS.filter(
      (v) => (this.mods.vouchers?.[v] ?? Infinity) <= this.slotNo + 1,
    );
    return {
      ...this.settings,
      pincherUnlocked: this.pincherUnlocked,
      start: {
        states: this.game.rng.snapshot(),
        owned,
        vouchers,
        ante,
        shops,
        place,
      },
    };
  }

  /** The number of shop slots rolled so far. */
  get slots(): number {
    return this.slotNo;
  }

  private has(v: ShopVoucher, slot: number): boolean {
    return (this.mods.vouchers?.[v] ?? Infinity) <= slot;
  }

  private editionRate(slot: number): number {
    return this.has("v_glow_up", slot) ? 4 : this.has("v_hone", slot) ? 2 : 1;
  }

  private selectPools(slot: number) {
    this.game.pools =
      this.pincherUnlocked || (this.mods.pincherFrom ?? Infinity) <= slot
        ? this.unlocked
        : this.locked;
  }

  /** A card in a Buffoon Pack: a joker rolled exactly like the shop's (stickers included). */
  buffoonCard(): ShopJoker {
    this.selectPools(this.slotNo + 1);
    const rarity = pollRarity(this.game.rng, "rarity0");
    return this.game.shopJoker(rarity, this.editionRate(this.slotNo + 1));
  }

  /**
   * A joker made outside the shop and packs, from the stickerless queue: Riff-raff (always
   * Common), Judgement (rarity from "rarity0" below Black Stake, from "order_jud_rarity" on
   * it and up), Wraith (Rare).
   */
  otherJoker(rarity?: Rarity | "judgement"): ShopJoker {
    this.selectPools(this.slotNo + 1);
    const rng = this.game.rng;
    const r =
      rarity === "judgement"
        ? this.game.stake >= 4
          ? rarityOf(rng.random("order_jud_rarity"))
          : pollRarity(rng, "rarity0")
        : (rarity ?? pollRarity(rng, "rarity0"));
    return {
      ...this.game.plainJoker(r, this.editionRate(this.slotNo + 1)),
      kind: "joker",
      stickers: [],
      stickerQueue: false,
    };
  }

  /**
   * The Uncommon or Rare Tag's joker in the next shop (api/the_order/tags.lua): a forced rarity,
   * made in G.shop_jokers, so like any shop joker it rolls its stickers first and on Black Stake
   * and up can come from the sticker queue.
   */
  tagJoker(rarity: 2 | 3): ShopJoker {
    const slot = ++this.slotNo;
    this.selectPools(slot);
    return this.game.shopJoker(rarity, this.editionRate(slot));
  }

  /** The next shop slot. */
  next(): ShopItem {
    const slot = ++this.slotNo;
    const { game } = this;
    const rng = game.rng;
    this.selectPools(slot);
    const has = (v: ShopVoucher) => this.has(v, slot);
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
    const spectralRate = this.mods.ghostDeck || this.ghost ? 2 : 0;
    const editionRate = this.editionRate(slot);

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
      return game.shopJoker(rarity, editionRate);
    }
    if (type === "Tarot" || type === "Planet" || type === "Spectral")
      return {
        kind: "consumable",
        set: type,
        key: drawFrom(
          rng,
          game.pools[type],
          `${type}${type}0`,
          game.owned,
          game.watchOf((p) => p[type]),
        ),
      };
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
    return { kind: "card", card, enhancement, edition };
  }
}

// ---------------------------------------------------------------------------
// Playing cards

export interface PlayingCardRoll {
  /** Playing card key, e.g. "H_K". */
  card: string;
  enhancement?: string;
  edition?: Edition;
  /** "Gold", "Red", "Blue" or "Purple". */
  seal?: string;
  /** Shop slot it came from (Illusion), 1-based. */
  slot?: number;
  /** Orange Deck's Giga Standard Pack, opened before any Standard Pack. */
  giga?: boolean;
}

/**
 * Which seal SMODS.poll_seal picks once it has decided on one: the seal pool in order (Gold,
 * Red, Blue, Purple), weight 10 each, walked down from the top.
 */
function pollSealType(rng: SeedRng, key: string): string {
  const seals = ["Gold", "Red", "Blue", "Purple"];
  const typeWeight = seals.length * 10;
  const poll = rng.random(key);
  let acc = 0;
  for (const seal of seals) {
    acc = acc + 10;
    if (poll > 1 - acc / typeWeight) return seal;
  }
  return seals[seals.length - 1];
}

/**
 * Cards shown in Standard Packs, one after another across packs (MultiplayerAPI's
 * api/the_order/standard_pack.lua): edition on "standard_edition0" (twice the usual odds, no
 * Negative, Hone/Glow Up apply), a seal on "stdseal0" (1 in 5) with its type on
 * "stdsealtype0", Enhanced or not on "stdset0" (over 0.6), then the enhancement from
 * "Enhancedsta0" and the card from "frontsta0".
 */
export function standardPackQueue(
  settings: ReaderSettings,
  count: number,
  editionRate = 1,
): PlayingCardRoll[] {
  const game = new Game(settings);
  const rng = game.rng;
  // poll_seal's chance: type_weight * mod / total_weight, total = 40 + 40 / 2 * 98.
  const sealChance = (40 * 10) / (40 + (40 / 2) * 98);
  const roll = (sealKey: string, sealTypeKey: string): PlayingCardRoll => {
    const edition = pollEdition(rng, "standard_edition0", {
      rate: editionRate,
      mod: 2,
      noNegative: true,
    });
    const seal =
      rng.random(sealKey) > 1 - sealChance
        ? pollSealType(rng, sealTypeKey)
        : undefined;
    const enhanced = rng.random("stdset0") > 0.6;
    const enhancement = enhanced
      ? drawFrom(rng, game.pools.enhancements, "Enhancedsta0")
      : undefined;
    const card = rng.element(game.pools.cards, "frontsta0");
    return { card, enhancement, edition, seal };
  };
  // Orange Deck opens the mod's Giga Standard Pack (10 cards) at the start: its cards take
  // the same edition, Enhanced, enhancement and card streams; its seal key is passed in as
  // "stdseal0", to which poll_seal adds the ante again (objects/boosters/standard_giga.lua).
  const giga =
    settings.deck === "orange"
      ? Array.from({ length: 10 }, () => ({
          ...roll("stdseal00", "stdseal0type0"),
          giga: true,
        }))
      : [];
  return [
    ...giga,
    ...Array.from({ length: count }, () => roll("stdseal0", "stdsealtype0")),
  ];
}

/**
 * Playing cards the shop rolls with Magic Trick, in order: plain cards, the card from
 * "frontsho0". (With Illusion, see illusionQueue.)
 */
export function magicTrickQueue(
  settings: ReaderSettings,
  count: number,
): PlayingCardRoll[] {
  const game = new Game(settings);
  return Array.from({ length: count }, () => ({
    card: game.rng.element(game.pools.cards, "frontsho0"),
  }));
}

/**
 * Playing cards the shop rolls with Magic Trick and Illusion from the first slot. Illusion
 * rolls on every shop slot, not just the playing card ones, so these come from reading the
 * shop slot by slot, and each says which slot it's in.
 */
export function illusionQueue(
  settings: ReaderSettings,
  slots: number,
  mods: ShopModifiers = {},
): PlayingCardRoll[] {
  const shop = shopQueue(settings, slots, {
    ...mods,
    vouchers: { ...mods.vouchers, v_magic_trick: 1, v_illusion: 1 },
  });
  return shop.flatMap((item, i) =>
    item.kind === "card"
      ? [
          {
            card: item.card,
            enhancement: item.enhancement,
            edition: item.edition,
            slot: i + 1,
          },
        ]
      : [],
  );
}

/**
 * Certificate's cards, in order: the card from "cert_fr" and a guaranteed seal (Steamodded's
 * poll_seal; under The Order a guaranteed seal skips its chance roll) with its type on "certsl".
 */
export function certificateQueue(
  settings: ReaderSettings,
  count: number,
): PlayingCardRoll[] {
  const game = new Game(settings);
  return Array.from({ length: count }, () => {
    const card = game.rng.element(game.pools.cards, "cert_fr");
    const seal = pollSealType(game.rng, "certsl");
    return { card, seal };
  });
}

/** Exposed for tests. */
export const _internal = { pollEdition, pollRarity, buildPools, Game };
