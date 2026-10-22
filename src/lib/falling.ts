import { z } from "zod";

/** The kinds of card that can fall, in the order the settings list them. */
export const FALLING_KINDS = [
  "joker",
  "card",
  "consumable",
  "voucher",
  "deck",
  "stake",
] as const;
export type FallingKind = (typeof FALLING_KINDS)[number];

export const FALLING_KIND_LABELS: Record<FallingKind, string> = {
  joker: "Jokers",
  card: "Playing cards",
  consumable: "Consumables (tarots, planets, spectrals)",
  voucher: "Vouchers",
  deck: "Decks",
  stake: "Stake chips",
};

export const RARITIES = ["common", "uncommon", "rare", "legendary"] as const;
export type FallingRarity = (typeof RARITIES)[number];
/** Most likely first, so the chance table reads like the game's. */
export const EDITIONS = ["foil", "holo", "polychrome", "negative"] as const;
export type Edition = (typeof EDITIONS)[number];
/** Playing card codes as in "card:KH": rank then suit. */
export const RANKS = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
] as const;
export type Rank = (typeof RANKS)[number];
export const SUITS = ["H", "D", "C", "S"] as const;
export type Suit = (typeof SUITS)[number];
/** The game's seal and enhancement ids (the refs "seal:red", "enhancement:glass"). */
export const SEALS = ["red", "blue", "gold", "purple"] as const;
export const ENHANCEMENTS = [
  "bonus",
  "mult",
  "wild",
  "glass",
  "steel",
  "stone",
  "gold",
  "lucky",
] as const;

/** A number per key: relative weights, or percentages for edition tables. */
const table = <K extends string>(keys: readonly K[], max = 100) =>
  z.object(
    Object.fromEntries(keys.map((k) => [k, z.number().min(0).max(max)])) as {
      [P in K]: z.ZodNumber;
    },
  );

/** Edition chances in percent; whatever is left over means no edition. */
const editionOdds = table(EDITIONS).refine(
  (odds) => EDITIONS.reduce((sum, e) => sum + odds[e], 0) <= 100,
  "Edition chances add up to more than 100%.",
);
export type EditionOdds = z.infer<typeof editionOdds>;

/** A chance in percent that something happens at all, then which one by weight. */
const chanceThenWeights = <K extends string>(keys: readonly K[]) =>
  z.object({ chance: z.number().min(0).max(100), weights: table(keys) });

/**
 * How often each thing shows up. The defaults are the game's own odds (see DEFAULT_CHANCES), and
 * the advanced settings can change any of them. Weights are relative to the others in the same
 * table; edition tables and `chance` are percentages.
 */
export const chancesSchema = z.object({
  /** Which rarity a joker is, like the shop (legendaries only come from The Soul). */
  jokerRarity: table(RARITIES),
  /** A joker's edition, like the shop. */
  jokerEdition: editionOdds,
  ranks: table(RANKS),
  suits: table(SUITS),
  /** Playing cards from a Standard pack: seals, editions and enhancements. */
  seals: chanceThenWeights(SEALS),
  cardEdition: editionOdds,
  enhancements: chanceThenWeights(ENHANCEMENTS),
});
export type FallingChances = z.infer<typeof chancesSchema>;
export type ChanceSection = keyof FallingChances;

const evenly = <K extends string>(keys: readonly K[], weight = 1) =>
  Object.fromEntries(keys.map((k) => [k, weight])) as Record<K, number>;

/**
 * The game's odds: shop jokers are 70% common, 25% uncommon, 5% rare, and get an edition
 * through poll_edition (Negative and Polychrome 0.3%, Holographic 1.4%, Foil 2%). A Standard
 * pack (card.lua) deals any rank and suit evenly, enhances 40% of cards with any enhancement,
 * seals 20% with any seal, and polls editions at twice the rate without Negative (Polychrome
 * 1.2%, Holographic 2.8%, Foil 4%).
 */
export const DEFAULT_CHANCES: FallingChances = {
  jokerRarity: { common: 70, uncommon: 25, rare: 5, legendary: 0 },
  jokerEdition: { foil: 2, holo: 1.4, polychrome: 0.3, negative: 0.3 },
  ranks: evenly(RANKS),
  suits: evenly(SUITS),
  seals: { chance: 20, weights: evenly(SEALS) },
  cardEdition: { foil: 4, holo: 2.8, polychrome: 1.2, negative: 0 },
  enhancements: { chance: 40, weights: evenly(ENHANCEMENTS) },
};

/**
 * The home page's falling cards (Studio → Site → Home page background), and the settings of a
 * card background overlay. Speeds are in pixels and degrees per second; "variation" is how much
 * each card may differ from the base value (0.5 = up to 50% slower or faster).
 */
export const fallingSchema = z.object({
  enabled: z.boolean(),
  /** Relative chance of each kind; 0 leaves it out. */
  weights: z.object(
    Object.fromEntries(
      FALLING_KINDS.map((k) => [k, z.number().min(0).max(100)]),
    ) as Record<FallingKind, z.ZodNumber>,
  ),
  /** Cards on screen at once, for a 1280px-wide window; scales with the width. */
  count: z.number().int().min(1).max(150),
  speed: z.number().min(5).max(600),
  speedVariation: z.number().min(0).max(1),
  spin: z.number().min(0).max(360),
  spinVariation: z.number().min(0).max(1),
  /** Card width in pixels. */
  size: z.number().min(16).max(200),
  sizeVariation: z.number().min(0).max(1),
  /** Of the whole background: cards block each other fully, whatever this is. */
  opacity: z.number().min(0.02).max(1),
  /** How far cards drift sideways, in pixels. */
  sway: z.number().min(0).max(120),
  /** Smaller cards fall slower, as if further away. */
  depth: z.boolean(),
  /** With depth: further cards also fade into the background. */
  depthFade: z.boolean().default(false),
  /** Include the Multiplayer mod's cards. */
  modCards: z.boolean(),
  /** Jokers can have editions (playing cards always roll a Standard pack's). */
  jokerEditions: z.boolean().default(true),
  /** Cards that never show up, as refs like joker:mime, card:KH or seal:red (see FallingEntry). */
  blacklist: z.array(z.string().max(80)).max(2000).default([]),
  chances: chancesSchema.default(DEFAULT_CHANCES),
});

export type FallingSettings = z.infer<typeof fallingSchema>;

export const DEFAULT_FALLING: FallingSettings = {
  enabled: false,
  weights: {
    joker: 50,
    card: 20,
    consumable: 15,
    voucher: 5,
    deck: 5,
    stake: 5,
  },
  count: 24,
  speed: 60,
  speedVariation: 0.4,
  spin: 25,
  spinVariation: 1,
  size: 71,
  sizeVariation: 0.3,
  opacity: 0.15,
  sway: 20,
  depth: true,
  depthFade: false,
  modCards: true,
  jokerEditions: true,
  blacklist: [],
  chances: DEFAULT_CHANCES,
};

/**
 * A card picture: image layers stacked bottom to top. `ref` names it for the blacklist: the
 * game id with its kind ("joker:mime", "tarot:hermit"), or "card:KH" for a playing card.
 * `mod` marks Multiplayer mod cards. Jokers carry their rarity; playing cards their rank and suit.
 */
export interface FallingEntry {
  ref: string;
  layers: string[];
  mod: boolean;
  rarity?: FallingRarity;
  rank?: Rank;
  suit?: Suit;
}

/** Everything that can be blacklisted, for the picker in Studio → Site. */
export interface FallingCatalogEntry {
  ref: string;
  name: string;
  /** Group in the picker, e.g. "Jokers". */
  group: string;
  layers: string[];
}

/**
 * Card pictures to draw from, per kind. Playing cards are only their rank and suit; a falling
 * card puts them on the base card or an enhancement, with maybe a seal (see rollStandardCard).
 */
export interface FallingPool {
  kinds: Record<FallingKind, FallingEntry[]>;
  baseCard: string;
  enhancements: { id: string; ref: string; image: string; stone: boolean }[];
  /** Seal overlays (full card size). */
  seals: { id: string; ref: string; image: string }[];
}

/**
 * The game's poll_edition (functions/common_events.lua) for one roll in [0, 1), with the chances
 * from a table: the rarest edition takes the top of the range, then the next, and so on.
 */
export function rollEdition(roll: number, odds: EditionOdds): Edition | null {
  let top = 1;
  for (const edition of [...EDITIONS].reverse()) {
    top -= odds[edition] / 100;
    if (roll > top) return edition;
  }
  return null;
}

/** One key by relative weight, for a roll in [0, 1); null if every weight is 0. */
export function pickWeighted<K extends string>(
  weights: Record<K, number>,
  roll: number,
): K | null {
  const keys = Object.keys(weights) as K[];
  const total = keys.reduce((sum, k) => sum + weights[k], 0);
  if (!total) return null;
  let left = roll * total;
  for (const k of keys) {
    left -= weights[k];
    if (left < 0 && weights[k] > 0) return k;
  }
  return keys.findLast((k) => weights[k] > 0) ?? null;
}

/**
 * A playing card from a Standard pack (card.lua): maybe an enhancement, an edition and a seal,
 * by the chance tables (the game's by default). Enhancements and seals come back as ids; null
 * when the card has none.
 */
export function rollStandardCard(
  random: () => number,
  chances: FallingChances = DEFAULT_CHANCES,
) {
  const { enhancements, seals } = chances;
  const enhancement =
    random() * 100 < enhancements.chance
      ? pickWeighted(enhancements.weights, random())
      : null;
  const edition = rollEdition(random(), chances.cardEdition);
  const seal =
    random() * 100 < seals.chance
      ? pickWeighted(seals.weights, random())
      : null;
  return { enhancement, edition, seal };
}
