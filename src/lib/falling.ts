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

/**
 * The home page's falling cards (Studio → Site → Home page background). Speeds are in pixels and
 * degrees per second; "variation" is how much each card may differ from the base value (0.5 = up
 * to 50% slower or faster).
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
  opacity: z.number().min(0.02).max(1),
  /** How far cards drift sideways, in pixels. */
  sway: z.number().min(0).max(120),
  /** Smaller cards fall slower and fainter, as if further away. */
  depth: z.boolean(),
  /** Include the Multiplayer mod's cards. */
  modCards: z.boolean(),
  /** Jokers can have editions, at the shop's odds (playing cards always roll a Standard pack's). */
  jokerEditions: z.boolean().default(true),
  /** Cards that never show up, as refs like joker:mime, card:KH or seal:red (see FallingEntry). */
  blacklist: z.array(z.string().max(80)).max(2000).default([]),
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
  modCards: true,
  jokerEditions: true,
  blacklist: [],
};

/**
 * A card picture: image layers stacked bottom to top. `ref` names it for the blacklist: the
 * game id with its kind ("joker:mime", "tarot:hermit"), or "card:KH" for a playing card.
 * `mod` marks Multiplayer mod cards.
 */
export interface FallingEntry {
  ref: string;
  layers: string[];
  mod: boolean;
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
  enhancements: { ref: string; image: string; stone: boolean }[];
  /** Seal overlays (full card size). */
  seals: { ref: string; image: string }[];
}

export type Edition = "foil" | "holo" | "polychrome" | "negative";

/**
 * The game's poll_edition (functions/common_events.lua), for one roll in [0, 1). Jokers use
 * mod 1 with Negative allowed (Negative 0.3%, Polychrome 0.3%, Holographic 1.4%, Foil 2%);
 * Standard packs use mod 2 without Negative (Polychrome 1.2%, Holographic 2.8%, Foil 4%).
 */
export function rollEdition(
  roll: number,
  mod: number,
  allowNegative: boolean,
): Edition | null {
  if (allowNegative && roll > 1 - 0.003 * mod) return "negative";
  if (roll > 1 - 0.006 * mod) return "polychrome";
  if (roll > 1 - 0.02 * mod) return "holo";
  if (roll > 1 - 0.04 * mod) return "foil";
  return null;
}

/**
 * A playing card from a Standard pack (card.lua): enhanced 40% of the time (any enhancement),
 * a seal 20% of the time (Red, Blue, Gold or Purple, a quarter each), and an edition as above.
 * Returns indexes into the pool's enhancements and seals.
 */
export function rollStandardCard(random: () => number) {
  const enhancement = random() > 0.6 ? random() : null;
  const edition = rollEdition(random(), 2, false);
  const seal = random() > 1 - 0.02 * 10 ? random() : null;
  return { enhancement, edition, seal };
}

/** The odds of a joker's edition in the shop (poll_edition with mod 1). */
export const rollJokerEdition = (roll: number) => rollEdition(roll, 1, true);
