import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PreviewScrollSync } from "@/components/editor/preview-scroll-sync";
import { GuideView } from "@/components/guide-view";
import { canEditGuide, requireUser } from "@/lib/auth";
import { draftCacheKey, getGuideById } from "@/lib/guides";
import { GuideValidationError } from "@/lib/mdx/compile";

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
      {content}
      <PreviewScrollSync />
    </>
  );
}
