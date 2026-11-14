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
import { getSiteTools } from "@/lib/site-tools-settings";

/** A published page or one of the site's own tools, as listed. */
interface Tile {
  key: string;
  href: string;
  frontmatter: PublishedPage["frontmatter"];
  parts: number;
  ownerName: string | null;
}

const COPY: Record<PageKind, { title: string; empty: string }> = {
  guide: { title: "Guides", empty: "No guides published yet." },
  tool: { title: "Tools", empty: "No tools published yet." },
};

/**
 * /guides and /tools: the published pages of that kind, grouped by the categories set in
 * Studio → Site (by their tags), or in one list without headings if there are none. Parts of a
 * main guide aren't listed; readers reach them from the main guide.
 */
export async function PageOverview({ kind }: { kind: PageKind }) {
  const [all, settings, categories] = await Promise.all([
    listPublished(kind),
    getSettings(),
    getCategories(kind),
  ]);
  const { main: pages, parts } = groupParts(all);
  // The line under the title is set in Studio → Site; empty hides it.
  const description =
    kind === "tool" ? settings.toolsIntro : settings.guidesIntro;
  const copy = COPY[kind];

  // The site's own tools (like the log parser) are listed with the others, and grouped by their
  // tags the same way.
  const siteTools = kind === "tool" ? await getSiteTools() : [];
  const tiles: Tile[] = [
    ...pages.map((p) => ({
      key: p.id,
      href: pageUrl(kind, p.slug),
      frontmatter: p.frontmatter,
      parts: parts.get(p.id)?.length ?? 0,
      ownerName: p.ownerName,
    })),
    ...siteTools.map((t) => ({
      key: t.href,
      href: t.href,
      frontmatter: t.frontmatter,
      parts: 0,
      ownerName: null,
    })),
  ];
  // Without categories, everything is one list without headings.
  const groups: { name: string; tiles: Tile[] }[] =
    categories.categories.length > 0
      ? groupByCategory(
          tiles.map((t) => ({ tile: t, tags: t.frontmatter.tags })),
          categories,
        ).map((g) => ({ name: g.name, tiles: g.pages.map((x) => x.tile) }))
      : [{ name: "", tiles }];

  return (
    <DocsPage>
      <DocsTitle>{copy.title}</DocsTitle>
      {description && <DocsDescription>{description}</DocsDescription>}
      <DocsBody>
        {tiles.length === 0 && <p>{copy.empty}</p>}
        {groups.map((group) => (
          <section
            key={group.name || "_"}
            className="not-prose mb-8 flex flex-col gap-3"
          >
            {group.name && (
              <h2 className="text-lg font-semibold">{group.name}</h2>
            )}
            <ul className="grid gap-3 sm:grid-cols-2">
              {group.tiles.map((t) => (
                <li key={t.key}>
                  <PageTile
                    frontmatter={t.frontmatter}
                    href={t.href}
                    parts={t.parts}
                    ownerName={t.ownerName}
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
