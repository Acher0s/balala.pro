import "server-only";
import { asc, desc, eq, isNotNull } from "drizzle-orm";
import type * as PageTree from "fumadocs-core/page-tree";
import { getDb, schema } from "@/db";
import type { Guide, PageKind } from "@/db/schema";
import { type Frontmatter, parseFrontmatter } from "@/lib/mdx/compile";

/** Cache key for a compiled draft; shared by autosave (which compiles it) and the preview. */
export function draftCacheKey(id: string, updatedAt: Date) {
  return `draft:${id}:${updatedAt.getTime()}`;
}

/** /guides/<slug> or /tools/<slug> */
export function pageUrl(kind: PageKind, slug: string) {
  return `/${kind}s/${slug}`;
}

/** Frontmatter without throwing: a broken draft still gets a title in lists. */
export function safeFrontmatter(
  source: string | null,
  fallbackTitle: string,
): Frontmatter {
  try {
    if (source) return parseFrontmatter(source);
  } catch {
    // fall through
  }
  return { title: fallbackTitle, tags: [] };
}

export interface PublishedPage {
  id: string;
  kind: PageKind;
  slug: string;
  section: string;
  position: number;
  /** The main guide this is a part of, if any (see schema.guides.parentId). */
  parentId: string | null;
  source: string;
  publishedAt: Date | null;
  frontmatter: Frontmatter;
}

function toPublished(g: Guide): PublishedPage {
  return {
    id: g.id,
    kind: g.kind,
    slug: g.slug,
    section: g.section,
    position: g.position,
    parentId: g.parentId,
    source: g.publishedSource as string,
    publishedAt: g.publishedAt,
    frontmatter: safeFrontmatter(g.publishedSource, g.slug),
  };
}

/** Published guides and/or tools, ordered by section ("" first), position, slug. */
export async function listPublished(kind?: PageKind): Promise<PublishedPage[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.guides)
    .where(isNotNull(schema.guides.publishedSource))
    .orderBy(
      asc(schema.guides.section),
      asc(schema.guides.position),
      asc(schema.guides.slug),
    );
  return rows.filter((g) => !kind || g.kind === kind).map(toPublished);
}

/**
 * Splits pages into main pages and the parts of each main guide. A part whose main guide isn't
 * published is treated as a main page, so it never becomes unreachable.
 */
export function groupParts(pages: PublishedPage[]) {
  const ids = new Set(pages.map((p) => p.id));
  const isPart = (p: PublishedPage) =>
    p.parentId !== null && ids.has(p.parentId);
  const parts = new Map<string, PublishedPage[]>();
  for (const p of pages.filter(isPart)) {
    const parentId = p.parentId as string;
    parts.set(parentId, [...(parts.get(parentId) ?? []), p]);
  }
  for (const list of parts.values())
    list.sort(
      (a, b) => a.position - b.position || a.slug.localeCompare(b.slug),
    );
  return { main: pages.filter((p) => !isPart(p)), parts };
}

const footerLink = (p: PublishedPage | undefined) =>
  p && {
    name: p.frontmatter.title,
    description: p.frontmatter.description,
    url: pageUrl(p.kind, p.slug),
  };

/**
 * Previous/next links. A main guide and its parts read as one series (main guide first); other
 * pages link to the main pages next to them in their section. Pages outside a section get none.
 */
export async function pageNeighbours(page: PublishedPage) {
  const all = await listPublished(page.kind);
  const { main, parts } = groupParts(all);
  const parentId =
    page.parentId && parts.has(page.parentId) ? page.parentId : null;
  const seriesId = parentId ?? (parts.has(page.id) ? page.id : null);
  let list: PublishedPage[];
  if (seriesId) {
    const head = all.find((p) => p.id === seriesId) as PublishedPage;
    list = [head, ...(parts.get(seriesId) ?? [])];
  } else if (page.section) {
    list = main.filter((p) => p.section === page.section && !parts.has(p.id));
  } else return {};
  const i = list.findIndex((p) => p.id === page.id);
  return { previous: footerLink(list[i - 1]), next: footerLink(list[i + 1]) };
}

/** The published main guide a page is part of, for the "Part of …" link above its title. */
export async function publishedParent(page: PublishedPage) {
  if (!page.parentId) return null;
  const db = await getDb();
  const [g] = await db
    .select()
    .from(schema.guides)
    .where(eq(schema.guides.id, page.parentId))
    .limit(1);
  if (!g?.publishedSource) return null;
  return {
    title: safeFrontmatter(g.publishedSource, g.slug).title,
    url: pageUrl(g.kind, g.slug),
  };
}

export async function getPublished(
  kind: PageKind,
  slug: string,
): Promise<PublishedPage | null> {
  const db = await getDb();
  const [g] = await db
    .select()
    .from(schema.guides)
    .where(eq(schema.guides.slug, slug))
    .limit(1);
  if (!g?.publishedSource || g.kind !== kind) return null;
  return toPublished(g);
}

/**
 * Sidebar (the phone menu): main guides (top level, then one separator per section), a main
 * guide with parts as a folder, then a "Tools" group.
 */
export async function getPageTree(): Promise<PageTree.Root> {
  const pages = await listPublished();
  const { main, parts } = groupParts(pages.filter((p) => p.kind === "guide"));
  const item = (p: PublishedPage): PageTree.Item => ({
    type: "page",
    name: p.frontmatter.title,
    url: pageUrl(p.kind, p.slug),
  });
  const children: PageTree.Node[] = [];
  let section: string | null = null;
  for (const g of main) {
    if (g.section !== section && g.section !== "")
      children.push({ type: "separator", name: g.section });
    section = g.section;
    const own = parts.get(g.id);
    children.push(
      own
        ? {
            type: "folder",
            name: g.frontmatter.title,
            index: item(g),
            children: own.map(item),
          }
        : item(g),
    );
  }
  const tools = pages.filter((p) => p.kind === "tool");
  if (tools.length) {
    children.push({ type: "separator", name: "Tools" });
    for (const t of tools) children.push(item(t));
  }
  return { name: "Guides", children };
}

export interface StudioGuide {
  guide: Guide;
  title: string;
  status: "draft" | "published" | "changed";
}

export function guideStatus(g: Guide): StudioGuide["status"] {
  if (!g.publishedSource) return "draft";
  return g.publishedSource === g.draftSource ? "published" : "changed";
}

export async function listStudioGuides(
  authorId?: string,
): Promise<StudioGuide[]> {
  const db = await getDb();
  const query = db
    .select()
    .from(schema.guides)
    .orderBy(desc(schema.guides.updatedAt));
  const rows = authorId
    ? await query.where(eq(schema.guides.authorId, authorId))
    : await query;
  return rows.map((g) => ({
    guide: g,
    title: safeFrontmatter(g.draftSource, g.slug).title,
    status: guideStatus(g),
  }));
}

export async function getGuideById(id: string): Promise<Guide | null> {
  const db = await getDb();
  const [g] = await db
    .select()
    .from(schema.guides)
    .where(eq(schema.guides.id, id))
    .limit(1);
  return g ?? null;
}

/** Slugs of published tools, for checking <Tool id="…"> embeds. */
export async function publishedToolSlugs(): Promise<Set<string>> {
  return new Set((await listPublished("tool")).map((t) => t.slug));
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function toSlug(title: string) {
  return title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}
