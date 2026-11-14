import type { EffectLine, ItemKind, Rarity } from "@/data/game-types";

/** What the reader draws a card with: picture, name and effect text, by game key ("j_mime"). */
export interface ArtItem {
  name: string;
  kind: ItemKind;
  image: string;
  w: number;
  h: number;
  text: EffectLine[];
  rarity?: Rarity;
  /** Stickers: the full-card layer drawn over a card. */
  overlay?: string;
  /** Stickers: badge colour. */
  colour?: string;
  /** Mod cards: which ruleset they come from ("standard", …). */
  source: string;
}

export interface SeedArt {
  items: Record<string, ArtItem>;
  /** Playing card fronts keyed like "H_K". */
  cards: Record<string, { image: string; name: string }>;
  /** The blank card fronts sit on. */
  base: string;
  editions: Record<string, { name: string; text: EffectLine[] }>;
}
