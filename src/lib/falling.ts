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
};

/**
 * Card pictures to draw from, per kind. Each card is a list of image layers stacked bottom to top
 * (one for a joker, two for a playing card). `mod` marks Multiplayer mod cards.
 */
export type FallingPool = Record<
  FallingKind,
  { layers: string[]; mod: boolean }[]
>;
