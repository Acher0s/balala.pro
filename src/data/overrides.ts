import type { ItemKind, Rarity } from "./game-types";

export interface ItemOverride {
  name?: string;
  rarity?: Rarity;
  cost?: number;
  /** Replaces the effect text. One string per line, using the game's codes: "{C:mult}+4{} Mult". */
  text?: string[];
}

/**
 * Changes on top of the vanilla data imported from the game (src/data/game.generated.json),
 * for cards BMP balances differently or values that depend on the run ("?").
 * Keyed by item id, e.g. overrides.joker.ticket.
 */
export const overrides: Partial<
  Record<ItemKind, Record<string, ItemOverride>>
> = {
  joker: {
    // Example of a BMP balance change (from the White Stake Guide's changelog, 0.5.1):
    // ticket: { rarity: "uncommon", text: ["Played {C:attention}Gold{} cards", "earn {C:money}$4{} when scored"] },
  },
  tag: {
    // The hand is picked when the tag appears; the game shows "[Poker Hand]" until then.
    orbital: {
      text: ["Upgrade {C:attention}[Poker Hand]", "by {C:attention}3{} levels"],
    },
  },
};
