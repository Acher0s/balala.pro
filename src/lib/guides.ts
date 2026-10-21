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
 * The pages before and after this one in its section, so a series of guides (e.g. "White Stake")
 * reads in order. Pages outside a section get no links.
 */
export async function sectionNeighbours(page: PublishedPage) {
  if (!page.section) return {};
  const pages = (await listPublished(page.kind)).filter(
    (p) => p.section === page.section,
  );
  const i = pages.findIndex((p) => p.id === page.id);
  const link = (p: PublishedPage | undefined) =>
    p && {
      name: p.frontmatter.title,
      description: p.frontmatter.description,
      url: pageUrl(p.kind, p.slug),
    };
  return { previous: link(pages[i - 1]), next: link(pages[i + 1]) };
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

/** Sidebar: guides (top level, then one separator per section), then a "Tools" group. */
export async function getPageTree(): Promise<PageTree.Root> {
  const pages = await listPublished();
  const children: PageTree.Node[] = [];
  let section: string | null = null;
  for (const g of pages.filter((p) => p.kind === "guide")) {
    if (g.section !== section && g.section !== "")
      children.push({ type: "separator", name: g.section });
    section = g.section;
    children.push({
      type: "page",
      name: g.frontmatter.title,
      url: pageUrl("guide", g.slug),
    });
  }
  const tools = pages.filter((p) => p.kind === "tool");
  if (tools.length) {
    children.push({ type: "separator", name: "Tools" });
    for (const t of tools)
      children.push({
        type: "page",
        name: t.frontmatter.title,
        url: pageUrl("tool", t.slug),
      });
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
