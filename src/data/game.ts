/**
 * Game data for guides: vanilla data imported from the game (`npm run import-game`)
 * with BMP changes from ./overrides.ts applied on top.
 */
import { parseEffectLine } from "@/lib/effect-text";
import generated from "./game.generated.json";
import {
  EDITION_IDS,
  type GameData,
  type GameItem,
  type ItemKind,
  type PlayingCardData,
} from "./game-types";
import { type ItemOverride, overrides } from "./overrides";

export type {
  EditionId,
  GameItem,
  ItemKind,
  Rarity,
  TextSegment,
} from "./game-types";
export { EDITION_IDS };

const data = generated as GameData;

export interface CardOverride {
  kind: ItemKind;
  id: string;
  data: ItemOverride;
}

function applyOverride(
  items: GameData["items"],
  kind: ItemKind,
  id: string,
  o: ItemOverride,
) {
  const item = items[kind]?.[id];
  if (!item) return false;
  const { text, ...rest } = o;
  Object.assign(item, rest);
  if (text) item.text = text.map((line) => parseEffectLine(line));
  return true;
}

/** Imported data + overrides.ts (code). Admin edits from the database go on top of this. */
const baseItems = structuredClone(data.items);
for (const [kind, entries] of Object.entries(overrides) as [
  ItemKind,
  Record<string, ItemOverride>,
][]) {
  for (const [id, o] of Object.entries(entries)) {
    if (!applyOverride(baseItems, kind, id, o))
      throw new Error(`overrides.ts: unknown ${kind} "${id}"`);
  }
}

let items = baseItems;
let bySlug = new Map<string, GameItem>();

/** "Oops! All 6s" → "oops_all_6s", so authors can refer to items by name. */
export function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/['’!.]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function indexNames() {
  bySlug = new Map();
  for (const kind of Object.keys(items) as ItemKind[]) {
    for (const item of Object.values(items[kind])) {
      // "The Hierophant" can also be written "hierophant"
      for (const name of [item.name, item.name.replace(/^The /, "")]) {
        const slug = `${kind}:${slugify(name)}`;
        // Vanilla cards come first and keep their names; mod variants of the same card
        // (e.g. the Multiplayer ruleset's Golden Ticket) are reached by id: "mp_ticket".
        if (!bySlug.has(slug)) bySlug.set(slug, item);
      }
    }
  }
}
indexNames();

/** Applies the admin's card edits (from the database) on top of the base data. */
export function setRuntimeOverrides(list: CardOverride[]) {
  const next = structuredClone(baseItems);
  for (const o of list) applyOverride(next, o.kind, o.id, o.data);
  items = next;
  indexNames();
}

/** The card as imported (plus overrides.ts), ignoring admin edits. */
export function getBaseItem(kind: ItemKind, id: string): GameItem | undefined {
  return baseItems[kind]?.[id];
}

/** Human label for where a card comes from. */
export function sourceLabel(source: string): string | null {
  if (source === "vanilla") return null;
  if (source === "multiplayer") return "Multiplayer";
  return `MP ${source[0].toUpperCase()}${source.slice(1)}`;
}

/** Finds an item by its id ("oops") or its name ("oops_all_6s", "Oops! All 6s"). */
export function findItem(kind: ItemKind, id: string): GameItem | undefined {
  return items[kind][id] ?? bySlug.get(`${kind}:${slugify(id)}`);
}

export function getItem(kind: ItemKind, id: string): GameItem {
  const item = findItem(kind, id);
  if (!item) {
    // Throwing here fails the static build, so a typo never reaches the site.
    throw new Error(
      `Unknown ${kind} "${id}". Use the card's name (e.g. "oops_all_6s") or its game id (e.g. "oops").`,
    );
  }
  return item;
}

export function listItems(kind: ItemKind): GameItem[] {
  return Object.values(items[kind]);
}

/** [id, item] pairs; the id is what guides and overrides use. */
export function listItemEntries(kind: ItemKind): [string, GameItem][] {
  return Object.entries(items[kind]);
}

const SUITS: Record<string, string> = {
  H: "H",
  D: "D",
  C: "C",
  S: "S",
  HEARTS: "H",
  DIAMONDS: "D",
  CLUBS: "C",
  SPADES: "S",
};

/** Looks up a playing card from "KH", "10S", "AS", "2d"… (rank then suit initial). */
export function getPlayingCard(card: string): PlayingCardData {
  const m = /^(10|[2-9TJQKA])\s*([HDCS])$/i.exec(card.trim());
  const key = m
    ? `${SUITS[m[2].toUpperCase()]}_${m[1] === "10" ? "T" : m[1].toUpperCase()}`
    : "";
  const found = data.cards[key];
  if (!found)
    throw new Error(
      `Unknown playing card "${card}". Write rank then suit, e.g. "KH", "10S", "AD".`,
    );
  return found;
}

export const baseCardImage = data.baseCard;
export const gameVersion = data.version;

/**
 * An edition's name and text as the game shows them. Negative on a consumable gives a consumable
 * slot instead of a Joker slot. Unknown editions throw, so a typo fails the build.
 */
export function getEdition(id: string, kind?: ItemKind | "card") {
  const consumable =
    kind === "tarot" || kind === "planet" || kind === "spectral";
  const key = id === "negative" && consumable ? "negative_consumable" : id;
  const edition =
    (EDITION_IDS as readonly string[]).includes(id) &&
    Object.hasOwn(data.editions, key)
      ? data.editions[key]
      : undefined;
  if (!edition)
    throw new Error(
      `Unknown edition "${id}". Use one of: ${EDITION_IDS.join(", ")}.`,
    );
  return edition;
}

/** The item with exactly this id (no name matching), or undefined. */
export function getItemExact(kind: ItemKind, id: string): GameItem | undefined {
  return Object.hasOwn(items, kind) && Object.hasOwn(items[kind], id)
    ? items[kind][id]
    : undefined;
}

/** Playing cards keyed like "H_K", in deck order. */
export function listPlayingCards(): [string, PlayingCardData][] {
  return Object.entries(data.cards);
}

export function getPlayingCardByKey(key: string): PlayingCardData | undefined {
  return Object.hasOwn(data.cards, key) ? data.cards[key] : undefined;
}
