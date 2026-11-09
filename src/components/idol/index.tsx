import {
  baseCardImage,
  EDITION_IDS,
  getEdition,
  listItemEntries,
  listPlayingCards,
} from "@/data/game";
import { type IdolArt, IdolCalculator } from "./idol-calculator";

/** Seals in the game's own order. */
const SEAL_ORDER = ["red", "blue", "gold", "purple"];

/**
 * The Idol Sorting Weight Calculator: build a deck and see how The Order weighs and sorts each
 * card before the Idol picks its target. <IdolWeights /> to build one; in a guide,
 * <IdolWeights deck="KH*4-KSw-AHgRp" deckOnly /> shows just that deck.
 */
export function IdolWeights({
  deck,
  deckOnly,
}: {
  /** A deck to start with, as in the tool's link: deck="KH*4-KSw-AHgRp". */
  deck?: string;
  /** Show only that deck, for a guide highlighting a setup. */
  deckOnly?: boolean;
} = {}) {
  const art: IdolArt = {
    base: baseCardImage,
    fronts: Object.fromEntries(
      listPlayingCards().map(([, c]) => [`${c.value}_${c.suit}`, c.image]),
    ),
    // The game's own enhancements; the Multiplayer reworks look the same.
    enhancements: listItemEntries("enhancement")
      .filter(([, e]) => e.source === "vanilla")
      .map(([id, e]) => ({ id, name: e.name, image: e.image })),
    seals: SEAL_ORDER.flatMap((id) => {
      const s = listItemEntries("seal").find(([sid]) => sid === id)?.[1];
      return s?.overlay ? [{ id, name: s.name, image: s.overlay }] : [];
    }),
    // Playing cards can be Foil, Holographic or Polychrome, never Negative.
    editions: EDITION_IDS.filter((id) => id !== "negative").map((id) => ({
      id,
      name: getEdition(id).name,
    })),
  };
  return <IdolCalculator art={art} initialDeck={deck} deckOnly={deckOnly} />;
}
