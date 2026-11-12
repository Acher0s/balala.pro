/**
 * Stands in for the BMP site's @/shared/jokers and @/shared/vouchers, and for the sprite sheets
 * its deck view drew playing cards from: game key → name and picture, here filled from this
 * site's own game data (see ../index.tsx) with setCardArt. A log can only point at entries in
 * these tables, never at a picture address of its own.
 */
export interface CardArt {
  name: string;
  /** The picture's address on this site, e.g. /game/joker/mime.webp. */
  file: string;
}

/** Playing card layers, as <PlayingCard> draws them. */
export interface PlayingCardArt {
  /** The blank card a front sits on. */
  base: string;
  /** Fronts keyed suit_rank as in the game: "H_K", "S_T". */
  fronts: Record<string, string>;
  /** Enhancements by game key ("m_glass"): the card under the front. */
  enhancements: Record<string, string>;
  /** Seal overlays by game key ("Red"). */
  seals: Record<string, string>;
}

export const jokers: { [key: string]: CardArt } = {};
export const vouchers: { [key: string]: CardArt } = {};
export const playingCards: PlayingCardArt = {
  base: "",
  fronts: {},
  enhancements: {},
  seals: {},
};

export interface CardArtTables {
  jokers: Record<string, CardArt>;
  vouchers: Record<string, CardArt>;
  playingCards: PlayingCardArt;
}

export function setCardArt(art: CardArtTables) {
  Object.assign(jokers, art.jokers);
  Object.assign(vouchers, art.vouchers);
  Object.assign(playingCards, art.playingCards);
}
