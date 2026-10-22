"use server";

import { and, count, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { fallingSchema } from "@/lib/falling";
import { getOverlay, newOverlayId, OVERLAY_LIMIT } from "@/lib/overlays";

export interface OverlayResult {
  ok: boolean;
  id?: string;
  error?: string;
}

const NAME_MAX = 60;

function checkInput(name: unknown, settings: unknown) {
  const title = typeof name === "string" ? name.trim() : "";
  if (!title) return { error: "Give the overlay a name." } as const;
  if (title.length > NAME_MAX)
    return { error: `Keep the name under ${NAME_MAX} characters.` } as const;
  const parsed = fallingSchema.safeParse(settings);
  if (!parsed.success)
    return {
      error: parsed.error.issues[0]?.message ?? "These settings aren't valid.",
    } as const;
  return { name: title, settings: { ...parsed.data, enabled: true } } as const;
}

/** The signed-in user's own overlay, or an error message. */
async function ownOverlay(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to change overlays." } as const;
  const overlay = await getOverlay(id);
  if (!overlay || overlay.ownerId !== user.id)
    return { error: "This overlay isn't yours." } as const;
  return { user, overlay } as const;
}

/** Saves a card background overlay: a new one without `id`. */
export async function saveCardOverlay(
  name: unknown,
  settings: unknown,
  id?: string,
): Promise<OverlayResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to make overlays." };
  const input = checkInput(name, settings);
  if ("error" in input) return { ok: false, error: input.error };
  const db = await getDb();

  if (id) {
    const own = await ownOverlay(id);
    if ("error" in own) return { ok: false, error: own.error };
    await db
      .update(schema.overlays)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.overlays.id, id));
    return { ok: true, id };
  }

  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.overlays)
    .where(eq(schema.overlays.ownerId, user.id));
  if (n >= OVERLAY_LIMIT)
    return {
      ok: false,
      error: `You can have up to ${OVERLAY_LIMIT} overlays. Delete one first.`,
    };
  const newId = newOverlayId();
  await db.insert(schema.overlays).values({
    id: newId,
    ownerId: user.id,
    kind: "cards",
    ...input,
  });
  return { ok: true, id: newId };
}

/** A new link for an overlay, e.g. when the old one leaked; the old link stops working. */
export async function resetOverlayLink(id: string): Promise<OverlayResult> {
  const own = await ownOverlay(id);
  if ("error" in own) return { ok: false, error: own.error };
  const newId = newOverlayId();
  const db = await getDb();
  await db
    .update(schema.overlays)
    .set({ id: newId, updatedAt: new Date() })
    .where(eq(schema.overlays.id, id));
  return { ok: true, id: newId };
}

export async function deleteOverlay(id: string): Promise<OverlayResult> {
  const own = await ownOverlay(id);
  if ("error" in own) return { ok: false, error: own.error };
  const db = await getDb();
  await db
    .delete(schema.overlays)
    .where(
      and(eq(schema.overlays.id, id), eq(schema.overlays.ownerId, own.user.id)),
    );
  return { ok: true };
}
