import "server-only";
import { baseCardImage, listItemEntries, listPlayingCards } from "@/data/game";
import type { ItemKind } from "@/data/game-types";
import type { FallingPool } from "@/lib/falling";

/** Up to `n` random entries, so the page only carries what a visit can use. */
function sample<T>(list: T[], n: number): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

/** A visit uses at most 24 pictures, so 40 of each kind is plenty to choose from. */
const PER_KIND = 40;

/**
 * Card pictures the falling-cards background can use: a fresh random sample per page load.
 * Multiplayer ruleset variants of vanilla cards are left out: they look the same and would only
 * add duplicates. Mod cards are kept apart in the sample so turning them off still leaves plenty.
 */
export function fallingPool(): FallingPool {
  const items = (...kinds: ItemKind[]) => {
    const all = kinds.flatMap((kind) =>
      listItemEntries(kind)
        .filter(([, item]) => ["vanilla", "multiplayer"].includes(item.source))
        .map(([, item]) => ({
          layers: [item.image],
          mod: item.source !== "vanilla",
        })),
    );
    return [
      ...sample(
        all.filter((c) => !c.mod),
        PER_KIND,
      ),
      ...sample(
        all.filter((c) => c.mod),
        PER_KIND / 4,
      ),
    ];
  };
  return {
    joker: items("joker"),
    card: sample(
      listPlayingCards().map(([, card]) => ({
        layers: [baseCardImage, card.image],
        mod: false,
      })),
      PER_KIND,
    ),
    consumable: items("tarot", "planet", "spectral"),
    voucher: items("voucher"),
    deck: items("deck"),
    stake: items("stake"),
  };
}
