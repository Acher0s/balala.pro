"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { type CreatorInput, creatorInputSchema } from "@/lib/creators-shared";

export interface CreatorResult {
  ok: boolean;
  error?: string;
}

const fresh = () => {
  revalidatePath("/creators");
  revalidatePath("/studio/admin/creators");
};

/** Adds a creator (no id) or saves one. Admins only. */
export async function saveCreator(
  input: CreatorInput,
  id?: string,
): Promise<CreatorResult> {
  await assertUser("admin");
  const parsed = creatorInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message };
  const { name, twitch, bio, avatarUrl, links } = parsed.data;
  const values = {
    name,
    twitch: twitch || null,
    bio,
    avatarUrl: avatarUrl || null,
    links,
  };
  const db = await getDb();
  if (id) {
    await db
      .update(schema.creators)
      .set(values)
      .where(eq(schema.creators.id, id));
  } else {
    // New creators go last.
    const all = await db.select().from(schema.creators);
    const last = Math.max(0, ...all.map((c) => c.position));
    await db.insert(schema.creators).values({ ...values, position: last + 1 });
  }
  fresh();
  return { ok: true };
}

export async function deleteCreator(id: string): Promise<CreatorResult> {
  await assertUser("admin");
  const db = await getDb();
  await db.delete(schema.creators).where(eq(schema.creators.id, id));
  fresh();
  return { ok: true };
}

/** Moves a creator one place up (-1) or down (1) on the page. */
export async function moveCreator(
  id: string,
  by: -1 | 1,
): Promise<CreatorResult> {
  await assertUser("admin");
  const db = await getDb();
  const all = await db
    .select()
    .from(schema.creators)
    .orderBy(asc(schema.creators.position), asc(schema.creators.createdAt));
  const from = all.findIndex((c) => c.id === id);
  const to = from + by;
  if (from === -1 || to < 0 || to >= all.length) return { ok: true };
  [all[from], all[to]] = [all[to], all[from]];
  // Renumber everyone, so positions stay unique after creators come and go.
  for (const [i, c] of all.entries())
    if (c.position !== i)
      await db
        .update(schema.creators)
        .set({ position: i })
        .where(eq(schema.creators.id, c.id));
  fresh();
  return { ok: true };
}
