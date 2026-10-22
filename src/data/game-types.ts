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
  | "stake";

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
  /** Seals only: the full-card-sized layer that sits on top of a playing card. */
  overlay?: string;
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
}
