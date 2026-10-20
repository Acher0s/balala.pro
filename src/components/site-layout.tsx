import type * as PageTree from "fumadocs-core/page-tree";
import { DocsLayout } from "fumadocs-ui/layouts/notebook";
import type { ReactNode } from "react";
import { getPageTree } from "@/lib/guides";
import { siteLayoutOptions } from "@/lib/site-layout";

/**
 * The one layout every public page uses, so the top bar looks the same everywhere:
 * header with the site sections on top, the guides/tools sidebar on the left (it also holds the
 * header links on phones).
 *
 * `plain` is for pages that aren't articles (home, tier lists): their content isn't wrapped in a
 * docs page, so it's placed in the layout's main area here.
 */
export async function SiteLayout({
  children,
  tree,
  plain = false,
}: {
  children: ReactNode;
  tree?: PageTree.Root;
  plain?: boolean;
}) {
  const [siteTree, options] = await Promise.all([
    tree ? Promise.resolve(tree) : getPageTree(),
    siteLayoutOptions(),
  ]);
  return (
    <DocsLayout
      tree={siteTree}
      {...options}
      nav={{ ...options.nav, mode: "top" }}
    >
      {plain ? (
        <div className="flex min-w-0 flex-col [grid-area:main]">{children}</div>
      ) : (
        children
      )}
    </DocsLayout>
  );
}
