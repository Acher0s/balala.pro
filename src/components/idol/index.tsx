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
 * card before the Idol picks its target. <IdolWeights />
 */
export function IdolWeights() {
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
    editions: EDITION_IDS.map((id) => ({ id, name: getEdition(id).name })),
  };
  return <IdolCalculator art={art} />;
}
