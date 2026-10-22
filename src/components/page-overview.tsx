import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/notebook/page";
import Link from "next/link";
import type { PageKind } from "@/db/schema";
import { groupParts, listPublished, pageUrl } from "@/lib/guides";
import { findIcon } from "@/lib/mdx/compile";

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
              {list.map((p) => {
                const icon = p.frontmatter.icon
                  ? findIcon(p.frontmatter.icon)
                  : undefined;
                return (
                  <li key={p.id}>
                    <Link
                      href={pageUrl(kind, p.slug)}
                      className="group relative block h-full overflow-hidden rounded-xl border bg-fd-card p-4 transition-colors hover:bg-fd-accent"
                    >
                      {/* The page's card, large and faded in the corner behind the text. */}
                      {icon && (
                        // biome-ignore lint/performance/noImgElement: pixel art sprite, shown as is
                        <img
                          src={icon.image}
                          alt=""
                          width={120}
                          height={160}
                          style={{ imageRendering: "pixelated" }}
                          className="absolute -right-6 -bottom-10 h-40 w-[120px] -rotate-12 object-contain opacity-25 transition-opacity group-hover:opacity-50"
                        />
                      )}
                      <span className="relative block font-semibold">
                        {p.frontmatter.title}
                      </span>
                      {p.frontmatter.description && (
                        <span
                          className={`relative mt-1 block text-sm text-fd-muted-foreground ${icon ? "pr-16" : ""}`}
                        >
                          {p.frontmatter.description}
                        </span>
                      )}
                      {(p.frontmatter.tags.length > 0 || parts.has(p.id)) && (
                        <span className="relative mt-3 flex flex-wrap gap-1">
                          {parts.has(p.id) && (
                            <span className="rounded-full bg-fd-primary px-2 py-0.5 text-xs font-medium text-fd-primary-foreground">
                              {parts.get(p.id)?.length} parts
                            </span>
                          )}
                          {p.frontmatter.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full border px-2 py-0.5 text-xs text-fd-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </DocsBody>
    </DocsPage>
  );
}
