import {
  baseCardImage,
  getEdition,
  type ItemKind,
  listItemEntries,
  listPlayingCards,
} from "@/data/game";
import pools from "@/lib/seed/pools.generated.json";
import { PATCHES } from "@/lib/seed/rulesets";
import type { ArtItem, SeedArt } from "./art";
import { SeedReader as SeedReaderClient } from "./seed-reader";

/** Every key the reader can show: the pools, the rulesets' own cards, and stickers. */
function wantedKeys(): Set<string> {
  const keys = new Set<string>([
    ...Object.values(pools.jokers).flat(),
    ...pools.tarots,
    ...pools.planets.map((p) => p.key),
    ...pools.spectrals.map((s) => s.key),
    ...pools.vouchers.map((v) => v.key),
    ...pools.boosters.map((b) => b.key),
    ...pools.enhancements,
    ...pools.tags.map((t) => t.key),
    "eternal",
    "perishable",
    "rental",
    "b_ghost",
    "stake_white",
  ]);
  for (const patch of PATCHES)
    for (const ruleset of patch.rulesets)
      for (const list of Object.values(ruleset.added.jokers ?? {}))
        for (const key of list ?? []) keys.add(key);
  return keys;
}

const KINDS: ItemKind[] = [
  "joker",
  "tarot",
  "planet",
  "spectral",
  "voucher",
  "booster",
  "enhancement",
  "tag",
  "sticker",
  "stake",
  "deck",
];

/** Card art and text for the reader, keyed the way the game names things, from the site's data. */
function seedArt(): SeedArt {
  const wanted = wantedKeys();
  const items: Record<string, ArtItem> = {};
  for (const kind of KINDS)
    for (const [, item] of listItemEntries(kind)) {
      if (
        !wanted.has(item.key) &&
        !(kind === "stake" && item.source === "vanilla")
      )
        continue;
      items[item.key] = {
        name: item.name,
        kind: item.kind,
        image: item.image,
        w: item.w,
        h: item.h,
        text: item.text,
        rarity: item.rarity,
        overlay: item.overlay,
        colour: item.colour,
        source: item.source,
      };
    }
  return {
    items,
    cards: Object.fromEntries(
      listPlayingCards().map(([key, c]) => [
        key,
        { image: c.image, name: `${c.value} of ${c.suit}` },
      ]),
    ),
    base: baseCardImage,
    editions: Object.fromEntries(
      ["foil", "holo", "polychrome", "negative"].map((e) => [e, getEdition(e)]),
    ),
  };
}

/** The seed reader (its own page, /seed-reader). Everything is worked out in the browser. */
export function SeedReader() {
  return <SeedReaderClient art={seedArt()} />;
}
