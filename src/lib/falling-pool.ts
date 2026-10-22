import "server-only";
import { baseCardImage, listItemEntries, listPlayingCards } from "@/data/game";
import type { ItemKind } from "@/data/game-types";
import type {
  FallingCatalogEntry,
  FallingEntry,
  FallingPool,
  Rank,
  Suit,
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

/**
 * A visit on the site uses at most 24 pictures, so 40 of each kind (and of each joker rarity, so
 * rare ones can still show up) is plenty to choose from. Overlays run for hours and change
 * pictures as they go, so they get every card.
 */
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
export function fallingPool(
  blacklist: string[] = [],
  { everything = false }: { everything?: boolean } = {},
): FallingPool {
  const blocked = new Set(blacklist);
  const take = <T>(list: T[], n: number) =>
    everything ? list : sample(list, n);
  const items = (...kinds: ItemKind[]) => {
    const all: FallingEntry[] = gameCards(...kinds)
      .map(({ id, kind, item }) => ({
        ref: `${kind}:${id}`,
        layers: [item.image],
        mod: item.source !== "vanilla",
        ...(item.rarity && { rarity: item.rarity }),
      }))
      .filter((c) => !blocked.has(c.ref));
    // Sampled per rarity (jokers), so the rarity chances have every rarity to pick from.
    const groups = new Map<string, FallingEntry[]>();
    for (const c of all) {
      const key = `${c.mod}:${c.rarity ?? ""}`;
      groups.set(key, [...(groups.get(key) ?? []), c]);
    }
    return [...groups.values()].flatMap((group) =>
      take(group, group[0].mod ? PER_KIND / 4 : PER_KIND),
    );
  };
  return {
    kinds: {
      joker: items("joker"),
      // All 52, just the rank and suit: the base card or an enhancement goes under it when it
      // falls. Each is only downloaded once one shows.
      card: listPlayingCards()
        .map(([key, card]) => {
          const code = cardCode(key);
          return {
            ref: `card:${code}`,
            layers: [card.image],
            mod: false,
            rank: code.slice(0, -1) as Rank,
            suit: code.slice(-1) as Suit,
          };
        })
        .filter((c) => !blocked.has(c.ref)),
      consumable: items("tarot", "planet", "spectral"),
      voucher: items("voucher"),
      deck: items("deck"),
      stake: items("stake"),
    },
    baseCard: baseCardImage,
    enhancements: listItemEntries("enhancement").map(([id, item]) => ({
      id,
      ref: `enhancement:${id}`,
      image: item.image,
      stone: item.key === "m_stone",
    })),
    seals: listItemEntries("seal").flatMap(([id, item]) =>
      item.overlay ? [{ id, ref: `seal:${id}`, image: item.overlay }] : [],
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
