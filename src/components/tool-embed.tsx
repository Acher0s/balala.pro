import Link from "next/link";
import { getPublished, pageUrl } from "@/lib/guides";
import { compileGuideCached } from "@/lib/mdx/compile";

/**
 * Embeds a published tool inside a guide: <Tool id="interest-calculator" />.
 * Tools can't embed tools (checked when saving), so this never recurses.
 */
export async function Tool({ id }: { id: string }) {
  const tool = await getPublished("tool", id);
  if (!tool) {
    return (
      <p className="rounded-lg border border-dashed p-3 text-sm text-fd-muted-foreground">
        The tool "{id}" isn't available right now.
      </p>
    );
  }
  const { frontmatter, Body } = await compileGuideCached(
    `${tool.id}:${tool.publishedAt?.getTime()}`,
    tool.source,
  );
  // Imported here rather than at the top: the MDX component map itself includes <Tool>.
  const { getMDXComponents } = await import("@/components/mdx");

  return (
    <div className="my-6 rounded-xl border-2 border-fd-primary/30 bg-fd-card">
      <div className="not-prose flex items-center justify-between gap-2 border-b px-4 py-2">
        <span className="flex items-center gap-2">
          <span className="rounded bg-fd-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fd-primary-foreground">
            Tool
          </span>
          <span className="font-semibold">{frontmatter.title}</span>
        </span>
        <Link
          href={pageUrl("tool", tool.slug)}
          className="text-sm text-fd-muted-foreground hover:text-fd-foreground"
        >
          Open tool ↗
        </Link>
      </div>
      <div className="px-4 pb-2">
        <Body components={getMDXComponents()} />
      </div>
    </div>
  );
}
