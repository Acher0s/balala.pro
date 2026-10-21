import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  type FooterProps,
} from "fumadocs-ui/layouts/notebook/page";
import { GuideMeta } from "@/components/guide-meta";
import { getMDXComponents } from "@/components/mdx";
import { ensureCardOverrides } from "@/lib/card-overrides";
import { compileGuideCached } from "@/lib/mdx/compile";

/** Renders a guide's MDX source in the docs page layout (used for live pages and draft previews). */
export async function GuideView({
  cacheKey,
  source,
  sourceLines = false,
  articleOnly = false,
  pager = {},
}: {
  cacheKey: string;
  source: string;
  /** Tag blocks with their source line, for the editor preview's scroll sync. */
  sourceLines?: boolean;
  /** Just the article, without the docs page chrome (table of contents etc.). */
  articleOnly?: boolean;
  /** Previous/next page links at the bottom; none unless given. */
  pager?: FooterProps["items"];
}) {
  await ensureCardOverrides();
  const { frontmatter, Body, toc } = await compileGuideCached(
    cacheKey,
    source,
    {
      sourceLines,
    },
  );

  if (articleOnly) {
    return (
      <article className="mx-auto w-full max-w-3xl px-6 py-8">
        <h1 className="mb-2 text-3xl font-semibold">{frontmatter.title}</h1>
        {frontmatter.description && (
          <p className="mb-2 text-lg text-fd-muted-foreground">
            {frontmatter.description}
          </p>
        )}
        <div className="mb-6 border-b pb-6">
          <GuideMeta
            author={frontmatter.author}
            patch={frontmatter.patch}
            tags={frontmatter.tags}
          />
        </div>
        <DocsBody>
          <Body components={getMDXComponents()} />
        </DocsBody>
      </article>
    );
  }

  return (
    <DocsPage toc={toc} footer={{ items: pager }}>
      <DocsTitle>{frontmatter.title}</DocsTitle>
      {frontmatter.description && (
        <DocsDescription className="mb-0">
          {frontmatter.description}
        </DocsDescription>
      )}
      <div className="border-b pb-6">
        <GuideMeta
          author={frontmatter.author}
          patch={frontmatter.patch}
          tags={frontmatter.tags}
        />
      </div>
      <DocsBody>
        <Body components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}
