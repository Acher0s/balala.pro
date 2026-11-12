/**
 * Stands in for the BMP site's @/shared/jokers and @/shared/vouchers: game key → name and
 * picture, here filled from this site's own game data (see ../index.tsx) with setCardArt. A
 * log can only point at entries in these tables, never at a picture address of its own.
 */
export interface CardArt {
  name: string;
  /** The picture's address on this site, e.g. /game/joker/mime.webp. */
  file: string;
}

export const jokers: { [key: string]: CardArt } = {};
export const vouchers: { [key: string]: CardArt } = {};

export interface CardArtTables {
  jokers: Record<string, CardArt>;
  vouchers: Record<string, CardArt>;
}

export function setCardArt(art: CardArtTables) {
  Object.assign(jokers, art.jokers);
  Object.assign(vouchers, art.vouchers);
}
