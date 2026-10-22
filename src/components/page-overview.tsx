import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/notebook/page";
import { PageTile } from "@/components/page-tile";
import type { PageKind } from "@/db/schema";
import { groupByCategory } from "@/lib/categories";
import {
  groupParts,
  listPublished,
  type PublishedPage,
  pageUrl,
} from "@/lib/guides";
import { getCategories, getSettings } from "@/lib/settings";

const COPY: Record<PageKind, { title: string; empty: string }> = {
  guide: { title: "Guides", empty: "No guides published yet." },
  tool: { title: "Tools", empty: "No tools published yet." },
};

/**
 * /guides and /tools: the published pages of that kind, grouped by the categories set in
 * Studio → Site (by their tags), or by section until categories are set up. Parts of a main
 * guide aren't listed; readers reach them from the main guide.
 */
export async function PageOverview({ kind }: { kind: PageKind }) {
  const [all, settings, categories] = await Promise.all([
    listPublished(kind),
    getSettings(),
    getCategories(),
  ]);
  const { main: pages, parts } = groupParts(all);
  // The line under the title is set in Studio → Site; empty hides it.
  const description =
    kind === "tool" ? settings.toolsIntro : settings.guidesIntro;
  const copy = COPY[kind];

  let groups: { name: string; pages: PublishedPage[] }[];
  if (categories.categories.length > 0) {
    groups = groupByCategory(
      pages.map((p) => ({ page: p, tags: p.frontmatter.tags })),
      categories,
    ).map((g) => ({ name: g.name, pages: g.pages.map((x) => x.page) }));
  } else {
    const sections = new Map<string, PublishedPage[]>();
    for (const p of pages)
      sections.set(p.section, [...(sections.get(p.section) ?? []), p]);
    groups = [...sections].map(([name, list]) => ({ name, pages: list }));
  }

  return (
    <DocsPage>
      <DocsTitle>{copy.title}</DocsTitle>
      {description && <DocsDescription>{description}</DocsDescription>}
      <DocsBody>
        {pages.length === 0 && <p>{copy.empty}</p>}
        {groups.map((group) => (
          <section
            key={group.name || "_"}
            className="not-prose mb-8 flex flex-col gap-3"
          >
            {group.name && (
              <h2 className="text-lg font-semibold">{group.name}</h2>
            )}
            <ul className="grid gap-3 sm:grid-cols-2">
              {group.pages.map((p) => (
                <li key={p.id}>
                  <PageTile
                    frontmatter={p.frontmatter}
                    href={pageUrl(kind, p.slug)}
                    parts={parts.get(p.id)?.length ?? 0}
                    ownerName={p.ownerName}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </DocsBody>
    </DocsPage>
  );
}
