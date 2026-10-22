import { desc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { GuideEditor } from "@/components/editor/guide-editor";
import type { CatalogEntry } from "@/components/editor/snippets";
import { listItemEntries, slugify, sourceLabel } from "@/data/game";
import type { ItemKind } from "@/data/game-types";
import { getDb, schema } from "@/db";
import { canEditGuide, requireUser } from "@/lib/auth";
import {
  getGuideById,
  guideStatus,
  listPublished,
  pageUrl,
  safeFrontmatter,
} from "@/lib/guides";
import { listPublishedTierLists } from "@/lib/tierlists";

const KINDS: ItemKind[] = [
  "joker",
  "tarot",
  "planet",
  "spectral",
  "voucher",
  "enhancement",
  "seal",
  "deck",
  "stake",
];

export default async function EditGuidePage({
  params,
}: PageProps<"/studio/guides/[id]">) {
  const user = await requireUser("writer");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const guide = await getGuideById(id);
  if (!guide || !canEditGuide(user, guide)) notFound();

  const db = await getDb();
  const revisions = await db
    .select({
      id: schema.guideRevisions.id,
      createdAt: schema.guideRevisions.createdAt,
      by: schema.users.displayName,
    })
    .from(schema.guideRevisions)
    .leftJoin(
      schema.users,
      eq(schema.users.id, schema.guideRevisions.publishedBy),
    )
    .where(eq(schema.guideRevisions.guideId, id))
    .orderBy(desc(schema.guideRevisions.createdAt))
    .limit(30);
  const authors =
    user.role === "admin"
      ? await db
          .select({ id: schema.users.id, name: schema.users.displayName })
          .from(schema.users)
          .where(inArray(schema.users.role, ["writer", "admin"]))
      : [];

  // Guides this one can become a part of: main guides (one level only) the user may edit.
  const allGuides = await db
    .select()
    .from(schema.guides)
    .where(eq(schema.guides.kind, "guide"));
  const hasParts = allGuides.some((g) => g.parentId === guide.id);
  const parentOptions =
    guide.kind === "guide" && !hasParts
      ? allGuides
          .filter(
            (g) =>
              g.id !== guide.id && g.parentId === null && canEditGuide(user, g),
          )
          .map((g) => ({
            id: g.id,
            title: safeFrontmatter(g.draftSource, g.slug).title,
          }))
          .sort((a, b) => a.title.localeCompare(b.title))
      : [];

  const catalog: CatalogEntry[] = KINDS.flatMap((kind) =>
    listItemEntries(kind).map(([itemId, item]) => ({
      kind,
      // Vanilla cards by readable name ("The Hierophant" → "hierophant"); mod cards by id ("mp_pizza").
      id:
        item.source === "vanilla" && kind !== "seal"
          ? slugify(item.name.replace(/^The /, ""))
          : itemId,
      name: item.name,
      image: item.image,
      source: sourceLabel(item.source),
    })),
  );

  return (
    <GuideEditor
      guide={{
        id: guide.id,
        slug: guide.slug,
        section: guide.section,
        position: guide.position,
        parentId: guide.parentId,
        hasParts,
        authorId: guide.authorId,
        status: guideStatus(guide),
        kind: guide.kind,
        url: pageUrl(guide.kind, guide.slug),
      }}
      initialSource={guide.draftSource}
      parentOptions={parentOptions}
      catalog={catalog}
      revisions={revisions.map((r) => ({
        id: r.id,
        at: r.createdAt.toISOString(),
        by: r.by ?? "someone",
      }))}
      authors={authors}
      isAdmin={user.role === "admin"}
      tierLists={(await listPublishedTierLists(300)).map(
        ({ list, ownerName }) => ({
          id: list.id,
          title: list.title,
          owner: ownerName,
        }),
      )}
      tools={
        guide.kind === "tool"
          ? []
          : (await listPublished("tool")).map((t) => ({
              slug: t.slug,
              title: t.frontmatter.title,
            }))
      }
    />
  );
}
