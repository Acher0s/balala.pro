import type { SortedResult } from "fumadocs-core/search";
import { NextResponse } from "next/server";
import { listPublished, pageUrl } from "@/lib/guides";
import { splitFrontmatter } from "@/lib/mdx/compile";

export const dynamic = "force-dynamic";

/** Turns MDX into searchable plain text: drops tags and markdown symbols. */
function plainText(body: string) {
  return body
    .replace(/<[^>]*>/g, " ")
    .replace(/[#*_`>|[\]()]/g, " ")
    .replace(/\s+/g, " ");
}

/** Search for the site's search dialog: matches guide titles, then headings, then text. */
export async function GET(req: Request) {
  const query =
    new URL(req.url).searchParams.get("query")?.trim().toLowerCase() ?? "";
  if (!query) return NextResponse.json([]);

  const results: SortedResult[] = [];
  for (const g of await listPublished()) {
    const url = pageUrl(g.kind, g.slug);
    const { body } = splitFrontmatter(g.source);
    const titleHit = g.frontmatter.title.toLowerCase().includes(query);
    const headings = [...body.matchAll(/^#{2,4}\s+(.+)$/gm)]
      .map((m) => m[1].trim())
      .filter((h) => h.toLowerCase().includes(query));
    const text = plainText(body);
    const at = text.toLowerCase().indexOf(query);
    if (!titleHit && headings.length === 0 && at === -1) continue;

    results.push({ id: url, url, type: "page", content: g.frontmatter.title });
    for (const h of headings.slice(0, 5)) {
      const anchor = h
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-");
      results.push({
        id: `${url}#${anchor}`,
        url: `${url}#${anchor}`,
        type: "heading",
        content: h,
      });
    }
    if (at !== -1) {
      const snippet = text.slice(Math.max(0, at - 40), at + 80).trim();
      results.push({
        id: `${url}:text`,
        url,
        type: "text",
        content: `…${snippet}…`,
      });
    }
  }
  return NextResponse.json(results);
}
