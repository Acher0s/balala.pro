"use server";

import { and, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ItemKind } from "@/data/game-types";
import type { ItemOverride } from "@/data/overrides";
import { getDb, schema } from "@/db";
import type { PageKind, Role } from "@/db/schema";
import {
  assertUser,
  canEditGuide,
  destroySession,
  STUDIO,
  safeNext,
} from "@/lib/auth";
import { reloadCardOverrides } from "@/lib/card-overrides";
import { toolTemplate, tutorialGuide } from "@/lib/guide-template";
import {
  draftCacheKey,
  getGuideById,
  pageUrl,
  publishedToolSlugs,
  SLUG_RE,
  toSlug,
} from "@/lib/guides";
import {
  compileGuide,
  compileGuideCached,
  GuideValidationError,
} from "@/lib/mdx/compile";
import { type SiteSettings, saveSettings } from "@/lib/settings";
import { publishedTierListIds } from "@/lib/tierlists";

export interface ActionResult {
  ok: boolean;
  problems?: string[];
  error?: string;
}

/**
 * Problems that block publishing. With a cache key, the compiled draft is kept so the
 * editor preview (which renders the same draft) doesn't compile it again.
 */
async function problemsOf(
  source: string,
  kind: PageKind,
  previewKey?: string,
): Promise<string[]> {
  // Embedded tools and tier lists must exist and be published.
  const [knownTools, knownTierLists] = await Promise.all([
    publishedToolSlugs(),
    publishedTierListIds(),
  ]);
  const options = { kind, knownTools, knownTierLists };
  try {
    if (previewKey)
      await compileGuideCached(previewKey, source, {
        ...options,
        sourceLines: true,
      });
    else await compileGuide(source, options);
    return [];
  } catch (e) {
    if (e instanceof GuideValidationError) return e.problems;
    return [(e as Error).message];
  }
}

async function editableGuide(id: string) {
  const user = await assertUser("writer");
  const guide = await getGuideById(id);
  if (!guide || !canEditGuide(user, guide))
    throw new Error("You can't edit this guide.");
  return { user, guide };
}

// --- Account -------------------------------------------------------------

/** Signs out and returns to the page given as "next" in the form (default: home). */
export async function signOut(formData?: FormData) {
  await destroySession();
  redirect(safeNext(formData?.get("next") ?? "/"));
}

export async function requestWriterAccess(
  formData: FormData,
): Promise<ActionResult> {
  const user = await assertUser("none");
  if (user.role !== "none")
    return { ok: false, error: "You already have access." };
  const message = String(formData.get("message") ?? "")
    .trim()
    .slice(0, 2000);
  if (message.length < 10)
    return {
      ok: false,
      error: "Tell the admins a bit about what you'd like to write.",
    };
  const db = await getDb();
  const [pending] = await db
    .select()
    .from(schema.writerRequests)
    .where(
      and(
        eq(schema.writerRequests.userId, user.id),
        eq(schema.writerRequests.status, "pending"),
      ),
    );
  if (pending)
    return {
      ok: false,
      error: "Your request is already waiting for an admin.",
    };
  await db.insert(schema.writerRequests).values({ userId: user.id, message });
  return { ok: true };
}

// --- Admin: people -------------------------------------------------------

export async function decideRequest(
  requestId: string,
  approve: boolean,
): Promise<ActionResult> {
  const admin = await assertUser("admin");
  const db = await getDb();
  const [request] = await db
    .update(schema.writerRequests)
    .set({
      status: approve ? "approved" : "denied",
      decidedAt: new Date(),
      decidedBy: admin.id,
    })
    .where(
      and(
        eq(schema.writerRequests.id, requestId),
        eq(schema.writerRequests.status, "pending"),
      ),
    )
    .returning();
  if (!request)
    return { ok: false, error: "That request was already handled." };
  if (approve) {
    await db
      .update(schema.users)
      .set({ role: "writer" })
      .where(
        and(eq(schema.users.id, request.userId), eq(schema.users.role, "none")),
      );
  }
  return { ok: true };
}

export async function setUserRole(
  userId: string,
  role: Role,
): Promise<ActionResult> {
  const admin = await assertUser("admin");
  if (!["none", "writer", "admin"].includes(role))
    return { ok: false, error: "Unknown role" };
  if (userId === admin.id)
    return { ok: false, error: "You can't change your own role." };
  const db = await getDb();
  await db
    .update(schema.users)
    .set({ role })
    .where(eq(schema.users.id, userId));
  if (role === "none") {
    // Removing access also signs them out everywhere.
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
  }
  return { ok: true };
}

// --- Guides --------------------------------------------------------------

export async function createGuide(formData: FormData): Promise<ActionResult> {
  const user = await assertUser("writer");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "A title is required." };
  const kind: PageKind = formData.get("kind") === "tool" ? "tool" : "guide";
  const slug = toSlug(String(formData.get("slug") || title));
  if (!SLUG_RE.test(slug))
    return {
      ok: false,
      error: "The URL name may only use a–z, 0–9 and dashes.",
    };

  const db = await getDb();
  const [taken] = await db
    .select()
    .from(schema.guides)
    .where(eq(schema.guides.slug, slug));
  if (taken)
    return { ok: false, error: `${pageUrl(taken.kind, slug)} already exists.` };

  const [guide] = await db
    .insert(schema.guides)
    .values({
      kind,
      slug,
      authorId: user.id,
      draftSource:
        kind === "tool"
          ? toolTemplate({ title, author: user.displayName })
          : tutorialGuide({ title, author: user.displayName }),
    })
    .returning();
  redirect(`${STUDIO}/guides/${guide.id}`);
}

/** Autosave: always stores the draft, and reports problems that would block publishing. */
export async function saveDraft(
  id: string,
  source: string,
): Promise<ActionResult> {
  const { guide } = await editableGuide(id);
  const db = await getDb();
  const updatedAt = new Date();
  await db
    .update(schema.guides)
    .set({ draftSource: source, updatedAt })
    .where(eq(schema.guides.id, id));
  return {
    ok: true,
    problems: await problemsOf(
      source,
      guide.kind,
      draftCacheKey(id, updatedAt),
    ),
  };
}

export async function publishGuide(
  id: string,
  source: string,
): Promise<ActionResult> {
  const { user, guide } = await editableGuide(id);
  const problems = await problemsOf(source, guide.kind);
  if (problems.length) return { ok: false, problems };
  const db = await getDb();
  const now = new Date();
  await db
    .update(schema.guides)
    .set({
      draftSource: source,
      publishedSource: source,
      publishedAt: now,
      updatedAt: now,
    })
    .where(eq(schema.guides.id, id));
  await db
    .insert(schema.guideRevisions)
    .values({ guideId: id, source, publishedBy: user.id });
  return { ok: true, problems: [] };
}

export async function unpublishGuide(id: string): Promise<ActionResult> {
  await editableGuide(id);
  const db = await getDb();
  await db
    .update(schema.guides)
    .set({ publishedSource: null, publishedAt: null, updatedAt: new Date() })
    .where(eq(schema.guides.id, id));
  return { ok: true };
}

export async function updateGuideSettings(
  id: string,
  settings: {
    slug: string;
    section: string;
    position: number;
    authorId?: string | null;
  },
): Promise<ActionResult> {
  const { user } = await editableGuide(id);
  const slug = settings.slug.trim();
  if (!SLUG_RE.test(slug))
    return {
      ok: false,
      error: "The URL name may only use a–z, 0–9 and dashes.",
    };
  const db = await getDb();
  const [taken] = await db
    .select()
    .from(schema.guides)
    .where(and(eq(schema.guides.slug, slug), ne(schema.guides.id, id)));
  if (taken)
    return { ok: false, error: `${pageUrl(taken.kind, slug)} already exists.` };

  await db
    .update(schema.guides)
    .set({
      slug,
      section: settings.section.trim().slice(0, 60),
      position: Number.isFinite(settings.position)
        ? Math.trunc(settings.position)
        : 0,
      // Only admins can hand a guide to someone else.
      ...(user.role === "admin" && settings.authorId !== undefined
        ? { authorId: settings.authorId }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.guides.id, id));
  return { ok: true };
}

export async function restoreRevision(
  guideId: string,
  revisionId: string,
): Promise<ActionResult> {
  await editableGuide(guideId);
  const db = await getDb();
  const [rev] = await db
    .select()
    .from(schema.guideRevisions)
    .where(
      and(
        eq(schema.guideRevisions.id, revisionId),
        eq(schema.guideRevisions.guideId, guideId),
      ),
    );
  if (!rev) return { ok: false, error: "Version not found." };
  await db
    .update(schema.guides)
    .set({ draftSource: rev.source, updatedAt: new Date() })
    .where(eq(schema.guides.id, guideId));
  return { ok: true };
}

export async function deleteGuide(id: string) {
  await editableGuide(id);
  const db = await getDb();
  await db.delete(schema.guides).where(eq(schema.guides.id, id));
  redirect(STUDIO);
}

// --- Admin: site ---------------------------------------------------------

export async function saveSiteSettings(
  values: SiteSettings,
): Promise<ActionResult> {
  await assertUser("admin");
  const siteName = values.siteName.trim().slice(0, 80);
  if (!siteName) return { ok: false, error: "The site needs a name." };
  await saveSettings({ siteName, homeIntro: values.homeIntro.slice(0, 2000) });
  return { ok: true };
}

export async function saveCardOverride(
  kind: ItemKind,
  itemId: string,
  data: ItemOverride | null,
): Promise<ActionResult> {
  await assertUser("admin");
  const db = await getDb();
  if (data === null) {
    await db
      .delete(schema.cardOverrides)
      .where(
        and(
          eq(schema.cardOverrides.kind, kind),
          eq(schema.cardOverrides.itemId, itemId),
        ),
      );
  } else {
    const clean: ItemOverride = {};
    if (data.name?.trim()) clean.name = data.name.trim();
    if (data.rarity) clean.rarity = data.rarity;
    if (typeof data.cost === "number" && Number.isFinite(data.cost))
      clean.cost = data.cost;
    if (data.text?.length)
      clean.text = data.text.map((l) => l.slice(0, 200)).slice(0, 12);
    await db
      .insert(schema.cardOverrides)
      .values({ kind, itemId, data: clean })
      .onConflictDoUpdate({
        target: [schema.cardOverrides.kind, schema.cardOverrides.itemId],
        set: { data: clean, updatedAt: new Date() },
      });
  }
  await reloadCardOverrides();
  return { ok: true };
}
