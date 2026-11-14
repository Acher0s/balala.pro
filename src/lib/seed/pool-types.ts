/** The game's item pools in the order its RNG walks them (see scripts/import-seed-pools.ts). */
export interface SeedPools {
  /** Version of Balatro the pools were read from. */
  version: string;
  /** Joker keys per rarity (1 common … 4 legendary). */
  jokers: Record<1 | 2 | 3 | 4, string[]>;
  tarots: string[];
  /** Planet X, Ceres and Eris are soft-locked until their hand has been played. */
  planets: { key: string; softlock: boolean }[];
  /** The Soul and Black Hole are hidden: in the pool, but never picked from it. */
  spectrals: { key: string; hidden: boolean }[];
  /** Upgrades require their base voucher. Base and upgrade sit next to each other. */
  vouchers: { key: string; requires: string[] }[];
  boosters: {
    key: string;
    kind: string;
    weight: number;
    size: number;
    choose: number;
  }[];
  enhancements: string[];
  /** Jokers that can't be Eternal (set_eternal checks eternal_compat). */
  noEternal: string[];
  /** Jokers that can't be Perishable. */
  noPerishable: string[];
  /**
   * Jokers only in the pool while the deck has a card with this enhancement
   * (get_current_pool's enhancement_gate): Glass Joker needs a Glass Card, and so on.
   */
  enhancementGates: Record<string, string>;
  tags: { key: string; minAnte?: number }[];
  /** Playing card keys ("H_2", "S_A", …), sorted the way pseudorandom_element sorts them. */
  cards: string[];
}
