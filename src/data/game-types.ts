/** One run of effect text, styled like the game's localization codes ({C:mult}, {X:mult,C:white}, …). */
export interface TextSegment {
  t: string;
  /** Text colour name from the game, e.g. "mult", "chips", "money", "attention". */
  c?: string;
  /** Background colour name, for "X Mult" style badges. */
  x?: string;
}

export type EffectLine = TextSegment[];

export type ItemKind =
  | "joker"
  | "tarot"
  | "planet"
  | "spectral"
  | "voucher"
  | "enhancement"
  | "seal"
  | "deck"
  | "stake"
  | "tag"
  | "booster"
  | "sticker";

export type Rarity = "common" | "uncommon" | "rare" | "legendary";

export interface GameItem {
  /** The game's own key, e.g. "j_mime". */
  key: string;
  name: string;
  kind: ItemKind;
  rarity?: Rarity;
  cost?: number;
  text: EffectLine[];
  /** Public path of the sprite, e.g. "/game/joker/mime.webp". */
  image: string;
  /** Native sprite size in pixels (the game's 2x textures). */
  w: number;
  h: number;
  /** Seals and stickers: the full-card-sized layer that sits on top of a card. */
  overlay?: string;
  /** Stickers: the colour of their badge under a card's text, as in the game (#rrggbb). */
  colour?: string;
  /** "vanilla", or the ruleset a Multiplayer mod card belongs to ("multiplayer", "standard", "sandbox", …). */
  source: string;
}

export interface PlayingCardData {
  suit: string;
  value: string;
  image: string;
}

export interface GameData {
  version: string;
  /** Version of the Multiplayer mod the mp_ cards were imported from. */
  modVersion?: string;
  items: Record<ItemKind, Record<string, GameItem>>;
  /** Playing card fronts keyed like "H_K" (suit initial + value). */
  cards: Record<string, PlayingCardData>;
  /** The blank card the fronts are drawn on. */
  baseCard: string;
  /**
   * Editions' names and effect text, keyed foil, holo, polychrome, negative, plus
   * negative_consumable (Negative's text on a tarot, planet or spectral).
   */
  editions: Record<string, { name: string; text: EffectLine[] }>;
}

/** The editions a card can have, as written in guides: <Joker id="mime" edition="foil" />. */
export const EDITION_IDS = ["foil", "holo", "polychrome", "negative"] as const;
export type EditionId = (typeof EDITION_IDS)[number];
