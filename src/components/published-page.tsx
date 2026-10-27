import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuideView } from "@/components/guide-view";
import type { PageKind } from "@/db/schema";
import { canEditGuide, getCurrentUser } from "@/lib/auth";
import { getPublished, pageNeighbours, publishedParent } from "@/lib/guides";

/** The public page for a published guide or tool; its owner and admins get an Edit button. */
export async function PublishedPage({
  kind,
  slug,
}: {
  kind: PageKind;
  slug: string;
}) {
  const page = await getPublished(kind, slug);
  if (!page) notFound();
  const user = await getCurrentUser();
  const canEdit = user !== null && canEditGuide(user, page);
  return (
    <GuideView
      cacheKey={`${page.id}:${page.publishedAt?.getTime()}`}
      source={page.source}
      pager={await pageNeighbours(page)}
      partOf={await publishedParent(page)}
      editUrl={canEdit ? `/studio/guides/${page.id}` : undefined}
    />
  );
}

export async function publishedPageMetadata(
  kind: PageKind,
  slug: string,
): Promise<Metadata> {
  const page = await getPublished(kind, slug);
  if (!page) return {};
  return {
    title: page.frontmatter.title,
    description: page.frontmatter.description,
  };
}
