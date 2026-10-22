import { and, count, eq, isNotNull } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PreviewScrollSync } from "@/components/editor/preview-scroll-sync";
import { GuideView } from "@/components/guide-view";
import { PageTile } from "@/components/page-tile";
import { getDb, schema } from "@/db";
import { canEditGuide, requireUser } from "@/lib/auth";
import { draftCacheKey, getGuideById } from "@/lib/guides";
import { GuideValidationError, parseFrontmatter } from "@/lib/mdx/compile";

export const metadata: Metadata = {
  title: "Preview",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

/** The editor's live preview: just the draft article, rendered like the public page. */
export default async function PreviewPage({
  params,
}: PageProps<"/preview/[id]">) {
  const user = await requireUser("writer");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const guide = await getGuideById(id);
  if (!guide || !canEditGuide(user, guide)) notFound();

  let content: React.ReactNode;
  try {
    content = await GuideView({
      cacheKey: draftCacheKey(guide.id, guide.updatedAt),
      sourceLines: true,
      articleOnly: true,
      source: guide.draftSource,
    });
  } catch (e) {
    const problems =
      e instanceof GuideValidationError ? e.problems : [(e as Error).message];
    content = (
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="mb-2 text-xl font-bold">
          This draft can't be shown yet
        </h1>
        <ul className="list-disc pl-5 text-sm text-red-500">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <>
      <ListPreview guide={guide} />
      {content}
      <PreviewScrollSync />
    </>
  );
}

/**
 * How the draft is listed on the Guides or Tools page, above the article. It scrolls away with
 * the article, so it only takes room at the top.
 */
async function ListPreview({
  guide,
}: {
  guide: NonNullable<Awaited<ReturnType<typeof getGuideById>>>;
}) {
  let frontmatter: ReturnType<typeof parseFrontmatter>;
  try {
    frontmatter = parseFrontmatter(guide.draftSource);
  } catch {
    // The article below lists what's wrong with the details block.
    return null;
  }
  const where = guide.kind === "tool" ? "Tools" : "Guides";
  const db = await getDb();
  const [{ parts }] = await db
    .select({ parts: count() })
    .from(schema.guides)
    .where(
      and(
        eq(schema.guides.parentId, guide.id),
        isNotNull(schema.guides.publishedSource),
      ),
    );
  return (
    <div className="mx-auto w-full max-w-3xl px-6 pt-6">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-fd-muted-foreground">
        On the {where} page
      </p>
      {guide.parentId ? (
        <p className="rounded-xl border border-dashed p-4 text-sm text-fd-muted-foreground">
          This guide is a part of another guide, so it isn't listed on its own.
          Readers reach it from the main guide.
        </p>
      ) : (
        <div className="max-w-sm">
          <PageTile frontmatter={frontmatter} parts={parts} />
        </div>
      )}
    </div>
  );
}
