import "server-only";
import { randomBytes } from "node:crypto";
import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  baseCardImage,
  getItemExact,
  getPlayingCardByKey,
  listItemEntries,
  listPlayingCards,
  sourceLabel,
} from "@/data/game";
import type { ItemKind } from "@/data/game-types";
import { getDb, schema } from "@/db";
import type { TierListRow, User } from "@/db/schema";
import {
  allRefs,
  LIMITS,
  type TierItem,
  type TierListData,
} from "@/lib/tierlist-shared";

const KINDS: ItemKind[] = [
  "joker",
  "tarot",
  "planet",
  "spectral",
  "voucher",
  "enhancement",
  "seal",
  "deck",
];

/** Everything that can go in a tier list: every card sprite in the game and the Multiplayer mod. */
export function tierCatalog(): TierItem[] {
  const out: TierItem[] = [];
  for (const kind of KINDS) {
    for (const [id, item] of listItemEntries(kind)) {
      // Presets: vanilla cards by kind; new Multiplayer jokers together; ruleset variants by ruleset.
      const group =
        item.source === "vanilla"
          ? kind
          : item.source === "multiplayer" && kind === "joker"
            ? "multiplayer"
            : `mp-${item.source}`;
      out.push({
        ref: `${kind}:${id}`,
        name: item.name,
        group,
        source: sourceLabel(item.source),
        layers: [item.image],
      });
    }
  }
  for (const [key, card] of listPlayingCards()) {
    out.push({
      ref: `card:${key}`,
      name: `${card.value} of ${card.suit}`,
      group: "card",
      source: null,
      layers: [baseCardImage, card.image],
    });
  }
  return out;
}

/** The card behind a ref, for display. */
export function resolveRef(ref: string): TierItem | null {
  const at = ref.indexOf(":");
  const kind = ref.slice(0, at);
  const id = ref.slice(at + 1);
  if (kind === "card") {
    const card = getPlayingCardByKey(id);
    return card
      ? {
          ref,
          name: `${card.value} of ${card.suit}`,
          group: "card",
          source: null,
          layers: [baseCardImage, card.image],
        }
      : null;
  }
  const item = (KINDS as string[]).includes(kind)
    ? getItemExact(kind as ItemKind, id)
    : undefined;
  return item
    ? {
        ref,
        name: item.name,
        group: kind,
        source: sourceLabel(item.source),
        layers: [item.image],
      }
    : null;
}

const hex = /^#[0-9a-f]{6}$/i;

export const tierListInput = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give the tier list a title")
    .max(LIMITS.title),
  description: z.string().trim().max(LIMITS.description).default(""),
  data: z.object({
    tiers: z
      .array(
        z.object({
          id: z.string().max(20),
          label: z.string().max(LIMITS.label),
          color: z.string().regex(hex, "Colours must look like #ff7f7f"),
          items: z.array(z.string().max(80)),
        }),
      )
      .min(1, "A tier list needs at least one tier")
      .max(LIMITS.tiers),
    pool: z.array(z.string().max(80)),
  }),
});

export type TierListInput = z.input<typeof tierListInput>;

/** Validates a tier list from the browser. Returns the cleaned list or an error message. */
export function validateTierList(input: unknown):
  | {
      ok: true;
      value: { title: string; description: string; data: TierListData };
    }
  | { ok: false; error: string } {
  const parsed = tierListInput.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid tier list",
    };
  const refs = allRefs(parsed.data.data);
  if (refs.length > LIMITS.items)
    return {
      ok: false,
      error: `A tier list can hold at most ${LIMITS.items} cards`,
    };
  if (new Set(refs).size !== refs.length)
    return { ok: false, error: "A card appears twice" };
  const unknown = refs.find((r) => !resolveRef(r));
  if (unknown) return { ok: false, error: `Unknown card "${unknown}"` };
  return { ok: true, value: parsed.data };
}

export function newTierListId() {
  return randomBytes(6).toString("base64url");
}

export interface TierListWithOwner {
  list: TierListRow;
  ownerName: string;
}

export async function getTierList(
  id: string,
): Promise<TierListWithOwner | null> {
  if (!/^[\w-]{1,20}$/.test(id)) return null;
  const db = await getDb();
  const [row] = await db
    .select({ list: schema.tierLists, ownerName: schema.users.displayName })
    .from(schema.tierLists)
    .innerJoin(schema.users, eq(schema.users.id, schema.tierLists.ownerId))
    .where(eq(schema.tierLists.id, id))
    .limit(1);
  return row ?? null;
}

export function canSeeTierList(user: User | null, list: TierListRow) {
  return (
    list.status === "published" ||
    (!!user && (user.id === list.ownerId || user.role === "admin"))
  );
}

export function canEditTierList(user: User | null, list: TierListRow) {
  return !!user && (user.id === list.ownerId || user.role === "admin");
}

export async function listPublishedTierLists(
  limit = 100,
): Promise<TierListWithOwner[]> {
  const db = await getDb();
  return db
    .select({ list: schema.tierLists, ownerName: schema.users.displayName })
    .from(schema.tierLists)
    .innerJoin(schema.users, eq(schema.users.id, schema.tierLists.ownerId))
    .where(eq(schema.tierLists.status, "published"))
    .orderBy(desc(schema.tierLists.publishedAt))
    .limit(limit);
}

export async function listOwnTierLists(
  ownerId: string,
): Promise<TierListRow[]> {
  const db = await getDb();
  return db
    .select()
    .from(schema.tierLists)
    .where(eq(schema.tierLists.ownerId, ownerId))
    .orderBy(desc(schema.tierLists.updatedAt));
}

export async function countOwnTierLists(ownerId: string) {
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.tierLists)
    .where(eq(schema.tierLists.ownerId, ownerId));
  return n;
}

/** Ids of published tier lists, for checking <TierList id="…"> embeds. */
export async function publishedTierListIds(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db
    .select({ id: schema.tierLists.id })
    .from(schema.tierLists)
    .where(and(eq(schema.tierLists.status, "published")));
  return new Set(rows.map((r) => r.id));
}
