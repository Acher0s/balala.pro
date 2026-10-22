import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/notebook/page";
import { PageTile } from "@/components/page-tile";
import type { PageKind } from "@/db/schema";
import { groupParts, listPublished, pageUrl } from "@/lib/guides";

const COPY: Record<
  PageKind,
  { title: string; description: string; empty: string }
> = {
  guide: {
    title: "Guides",
    description:
      "Strategy guides for Balatro Multiplayer, from the basics to advanced maths.",
    empty: "No guides published yet.",
  },
  tool: {
    title: "Tools",
    description: "Calculators you can use while you play.",
    empty: "No tools published yet.",
  },
};

/**
 * /guides and /tools: the published pages of that kind, grouped by section. Parts of a main guide
 * aren't listed; readers reach them from the main guide.
 */
export async function PageOverview({ kind }: { kind: PageKind }) {
  const { main: pages, parts } = groupParts(await listPublished(kind));
  const sections = new Map<string, typeof pages>();
  for (const p of pages)
    sections.set(p.section, [...(sections.get(p.section) ?? []), p]);
  const copy = COPY[kind];

  return (
    <DocsPage>
      <DocsTitle>{copy.title}</DocsTitle>
      <DocsDescription>{copy.description}</DocsDescription>
      <DocsBody>
        {pages.length === 0 && <p>{copy.empty}</p>}
        {[...sections].map(([section, list]) => (
          <section key={section} className="not-prose mb-8 flex flex-col gap-3">
            {section && <h2 className="text-lg font-semibold">{section}</h2>}
            <ul className="grid gap-3 sm:grid-cols-2">
              {list.map((p) => (
                <li key={p.id}>
                  <PageTile
                    frontmatter={p.frontmatter}
                    href={pageUrl(kind, p.slug)}
                    parts={parts.get(p.id)?.length ?? 0}
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
