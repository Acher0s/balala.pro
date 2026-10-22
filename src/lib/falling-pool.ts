import "server-only";
import { baseCardImage, listItemEntries, listPlayingCards } from "@/data/game";
import type { ItemKind } from "@/data/game-types";
import type {
  FallingCatalogEntry,
  FallingEntry,
  FallingPool,
} from "@/lib/falling";

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

/** Vanilla cards and the Multiplayer mod's own; its ruleset variants look the same as vanilla. */
const shown = (source: string) => ["vanilla", "multiplayer"].includes(source);

/** Game cards of these kinds, with their blacklist refs (e.g. "joker:mime"). */
function gameCards(...kinds: ItemKind[]) {
  return kinds.flatMap((kind) =>
    listItemEntries(kind)
      .filter(([, item]) => shown(item.source))
      .map(([id, item]) => ({ id, kind, item })),
  );
}

/** "H_K" → "KH", "S_T" → "10S": the same codes as <PlayingCard card="…">. */
const cardCode = (key: string) => {
  const [suit, rank] = key.split("_");
  return `${rank === "T" ? "10" : rank}${suit}`;
};

/**
 * Card pictures the falling-cards background can use: a fresh random sample per page load,
 * without blacklisted cards. Mod cards are sampled apart so turning them off still leaves plenty.
 */
export function fallingPool(blacklist: string[] = []): FallingPool {
  const blocked = new Set(blacklist);
  const items = (...kinds: ItemKind[]) => {
    const all: FallingEntry[] = gameCards(...kinds)
      .map(({ id, kind, item }) => ({
        ref: `${kind}:${id}`,
        layers: [item.image],
        mod: item.source !== "vanilla",
      }))
      .filter((c) => !blocked.has(c.ref));
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
    kinds: {
      joker: items("joker"),
      // Just the rank and suit: the base card or an enhancement goes under it when it falls.
      card: sample(
        listPlayingCards()
          .map(([key, card]) => ({
            ref: `card:${cardCode(key)}`,
            layers: [card.image],
            mod: false,
          }))
          .filter((c) => !blocked.has(c.ref)),
        PER_KIND,
      ),
      consumable: items("tarot", "planet", "spectral"),
      voucher: items("voucher"),
      deck: items("deck"),
      stake: items("stake"),
    },
    baseCard: baseCardImage,
    enhancements: listItemEntries("enhancement").map(([id, item]) => ({
      ref: `enhancement:${id}`,
      image: item.image,
      stone: item.key === "m_stone",
    })),
    seals: listItemEntries("seal").flatMap(([id, item]) =>
      item.overlay ? [{ ref: `seal:${id}`, image: item.overlay }] : [],
    ),
  };
}

const GROUPS: [ItemKind, string][] = [
  ["joker", "Jokers"],
  ["tarot", "Tarots"],
  ["planet", "Planets"],
  ["spectral", "Spectrals"],
  ["voucher", "Vouchers"],
  ["deck", "Decks"],
  ["stake", "Stake chips"],
  ["enhancement", "Enhancements"],
  ["seal", "Seals"],
];

/** Everything that can show up in the falling cards, for the blacklist picker. */
export function fallingCatalog(): FallingCatalogEntry[] {
  return [
    ...GROUPS.flatMap(([kind, group]) =>
      gameCards(kind).map(({ id, item }) => ({
        ref: `${kind}:${id}`,
        name: item.name,
        group,
        layers: [item.image],
      })),
    ),
    ...listPlayingCards().map(([key, card]) => ({
      ref: `card:${cardCode(key)}`,
      name: `${card.value} of ${card.suit}`,
      group: "Playing cards",
      layers: [baseCardImage, card.image],
    })),
  ];
}
