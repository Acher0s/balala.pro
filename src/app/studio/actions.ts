"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ItemKind } from "@/data/game-types";
import type { ItemOverride } from "@/data/overrides";
import { getDb, schema } from "@/db";
import type { Guide, PageKind, Role } from "@/db/schema";
import {
  assertUser,
  canEditGuide,
  destroySession,
  STUDIO,
  safeNext,
} from "@/lib/auth";
import { reloadCardOverrides } from "@/lib/card-overrides";
import { categoriesSchema } from "@/lib/categories";
import { getImportPack } from "@/lib/content-import";
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
import {
  introMarkup,
  type SiteSettings,
  saveCategories,
  saveSettings,
  saveTheme,
  siteTextSource,
} from "@/lib/settings";
import { siteThemeSchema } from "@/lib/theme";
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
    /** The main guide this one is a part of; null makes it a main guide. */
    parentId?: string | null;
  },
): Promise<ActionResult> {
  const { user, guide } = await editableGuide(id);
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

  if (settings.parentId) {
    const problem = await parentProblem(guide, settings.parentId, user);
    if (problem) return { ok: false, error: problem };
  }

  await db
    .update(schema.guides)
    .set({
      slug,
      ...(settings.parentId !== undefined
        ? { parentId: settings.parentId }
        : {}),
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

/** Why `guide` can't become a part of `parentId`, or null if it can. One level of parts only. */
async function parentProblem(
  guide: Guide,
  parentId: string,
  user: Awaited<ReturnType<typeof assertUser>>,
): Promise<string | null> {
  if (guide.kind !== "guide") return "Only guides can be part of a guide.";
  if (parentId === guide.id) return "A guide can't be a part of itself.";
  const db = await getDb();
  const [parent] = await db
    .select()
    .from(schema.guides)
    .where(eq(schema.guides.id, parentId));
  if (!parent || parent.kind !== "guide" || !canEditGuide(user, parent))
    return "That main guide wasn't found.";
  if (parent.parentId)
    return "That guide is itself a part of another guide; pick its main guide.";
  const [part] = await db
    .select({ id: schema.guides.id })
    .from(schema.guides)
    .where(eq(schema.guides.parentId, guide.id))
    .limit(1);
  if (part)
    return "Other guides are parts of this one, so it can't become a part itself.";
  return null;
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

/** Admins: delete many guides and tools at once (their version history goes with them). */
export async function deleteGuides(ids: string[]): Promise<ActionResult> {
  await assertUser("admin");
  if (ids.length === 0) return { ok: false, error: "Nothing selected." };
  const db = await getDb();
  await db.delete(schema.guides).where(inArray(schema.guides.id, ids));
  return { ok: true };
}

// --- Admin: content import -----------------------------------------------

/**
 * Imports the chosen pages of a content pack as drafts: new pages are created (owned by the
 * admin), changed ones get the file as their draft, and all get the pack's placement (section,
 * order, main guide). What's published is never touched.
 */
export async function importPages(
  packId: string,
  slugs: string[],
): Promise<ActionResult> {
  const admin = await assertUser("admin");
  const pack = await getImportPack(packId);
  const chosen = pack.pages.filter((p) => slugs.includes(p.slug));
  const conflicts = chosen.filter((p) => p.status === "conflict");
  if (conflicts.length)
    return {
      ok: false,
      error: conflicts
        .map((p) => `"${p.slug}" is already used by a page of another kind.`)
        .join("\n"),
    };
  const db = await getDb();
  const now = new Date();
  for (const p of chosen) {
    const placement = {
      section: pack.section,
      position: p.position,
      updatedAt: now,
    };
    if (p.status === "new")
      await db.insert(schema.guides).values({
        kind: p.kind,
        slug: p.slug,
        authorId: admin.id,
        draftSource: p.source,
        ...placement,
      });
    else
      await db
        .update(schema.guides)
        .set({
          ...(p.status === "changed" ? { draftSource: p.source } : {}),
          ...placement,
        })
        .where(eq(schema.guides.slug, p.slug));
  }
  // Main guides may have been created just now, so link parts once everything exists.
  const parentSlugs = chosen.flatMap((p) => (p.parent ? [p.parent] : []));
  const parents = parentSlugs.length
    ? await db
        .select({ id: schema.guides.id, slug: schema.guides.slug })
        .from(schema.guides)
        .where(inArray(schema.guides.slug, parentSlugs))
    : [];
  const parentIds = new Map(parents.map((r) => [r.slug, r.id]));
  for (const p of chosen)
    await db
      .update(schema.guides)
      .set({ parentId: p.parent ? (parentIds.get(p.parent) ?? null) : null })
      .where(eq(schema.guides.slug, p.slug));
  return { ok: true };
}

// --- Admin: site ---------------------------------------------------------

export async function saveSiteSettings(
  values: SiteSettings,
): Promise<ActionResult> {
  await assertUser("admin");
  const siteName = values.siteName.trim().slice(0, 80);
  if (!siteName) return { ok: false, error: "The site needs a name." };
  const homeIntro = values.homeIntro.trim().slice(0, 2000);
  const announcement = values.announcement.trim().slice(0, 5000);
  // Same checks as a guide; line numbers counted from the top of each box.
  const offset = siteTextSource("").split("\n").length - 2;
  const problems: string[] = [];
  for (const [field, markup] of [
    ["Intro", introMarkup(homeIntro)],
    ["Announcement", announcement],
  ] as const) {
    if (!markup) continue;
    for (const p of await problemsOf(siteTextSource(markup), "guide"))
      problems.push(
        `${field}: ${p.replace(/^line (\d+)/, (_m, n: string) => `line ${Number(n) - offset}`)}`,
      );
  }
  if (problems.length) return { ok: false, error: problems.join("\n") };
  await saveSettings({
    siteName,
    homeIntro,
    announcement,
    guidesIntro: values.guidesIntro.trim().slice(0, 300),
    toolsIntro: values.toolsIntro.trim().slice(0, 300),
  });
  return { ok: true };
}

/** Studio → Site → Categories: how the Guides and Tools pages are grouped, by tags. */
export async function saveSiteCategories(
  value: unknown,
): Promise<ActionResult> {
  await assertUser("admin");
  const parsed = categoriesSchema.safeParse(value);
  if (!parsed.success)
    return {
      ok: false,
      error: "Every category needs a name and at least one tag.",
    };
  await saveCategories(parsed.data);
  return { ok: true };
}

/** Studio → Style: the site's colours, roundness and heading font. */
export async function saveSiteTheme(theme: unknown): Promise<ActionResult> {
  await assertUser("admin");
  const parsed = siteThemeSchema.safeParse(theme);
  if (!parsed.success) return { ok: false, error: "That theme isn't valid." };
  await saveTheme(parsed.data);
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
