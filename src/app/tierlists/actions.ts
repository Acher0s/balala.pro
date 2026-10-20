"use server";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { LIMITS } from "@/lib/tierlist-shared";
import {
  canEditTierList,
  countOwnTierLists,
  getTierList,
  newTierListId,
  validateTierList,
} from "@/lib/tierlists";

export interface TierListResult {
  ok: boolean;
  id?: string;
  error?: string;
  /** Signed out: the maker keeps the list in the browser and sends them to log in. */
  needsLogin?: boolean;
}

/**
 * Creates or updates a tier list.
 * publish: true → public, false → private (only you), undefined → keep its current status.
 */
export async function saveTierList(
  input: unknown,
  { id, publish }: { id?: string; publish?: boolean } = {},
): Promise<TierListResult> {
  const user = await getCurrentUser();
  if (!user)
    return {
      ok: false,
      needsLogin: true,
      error: "Sign in to save tier lists.",
    };

  const checked = validateTierList(input);
  if (!checked.ok) return { ok: false, error: checked.error };
  const { title, description, data } = checked.value;
  const db = await getDb();
  const now = new Date();

  if (id) {
    const existing = await getTierList(id);
    if (!existing || !canEditTierList(user, existing.list))
      return { ok: false, error: "You can't edit this tier list." };
    const status =
      publish === undefined
        ? existing.list.status
        : publish
          ? "published"
          : "private";
    await db
      .update(schema.tierLists)
      .set({
        title,
        description,
        data,
        status,
        updatedAt: now,
        publishedAt:
          status === "published" ? (existing.list.publishedAt ?? now) : null,
      })
      .where(eq(schema.tierLists.id, id));
    return { ok: true, id };
  }

  if ((await countOwnTierLists(user.id)) >= LIMITS.listsPerUser) {
    return {
      ok: false,
      error: `You can keep up to ${LIMITS.listsPerUser} tier lists. Delete some to make room.`,
    };
  }
  const newId = newTierListId();
  await db.insert(schema.tierLists).values({
    id: newId,
    ownerId: user.id,
    title,
    description,
    data,
    status: publish ? "published" : "private",
    publishedAt: publish ? now : null,
  });
  return { ok: true, id: newId };
}

export async function deleteTierList(id: string): Promise<TierListResult> {
  const user = await getCurrentUser();
  const existing = await getTierList(id);
  if (!existing || !canEditTierList(user, existing.list))
    return { ok: false, error: "You can't delete this tier list." };
  const db = await getDb();
  await db.delete(schema.tierLists).where(eq(schema.tierLists.id, id));
  return { ok: true };
}

/** Owner or admin: make a tier list public or private without changing it. */
export async function setTierListStatus(
  id: string,
  publish: boolean,
): Promise<TierListResult> {
  const user = await getCurrentUser();
  const existing = await getTierList(id);
  if (!existing || !canEditTierList(user, existing.list))
    return { ok: false, error: "You can't change this tier list." };
  const db = await getDb();
  await db
    .update(schema.tierLists)
    .set({
      status: publish ? "published" : "private",
      publishedAt: publish ? (existing.list.publishedAt ?? new Date()) : null,
    })
    .where(eq(schema.tierLists.id, id));
  return { ok: true, id };
}
