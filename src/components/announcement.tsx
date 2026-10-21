import { createHash } from "node:crypto";
import { DocsBody } from "fumadocs-ui/layouts/notebook/page";
import { getMDXComponents } from "@/components/mdx";
import { ensureCardOverrides } from "@/lib/card-overrides";
import { compileGuideCached } from "@/lib/mdx/compile";
import { introMarkup, siteTextSource } from "@/lib/settings";

/** Admin-written text from Studio → Site, in guide markup (links, bold, cards, …). */
async function SiteText({
  text,
  className,
}: {
  text: string;
  className: string;
}) {
  const source = siteTextSource(text);
  const key = `site-text:${createHash("sha1").update(source).digest("hex").slice(0, 12)}`;
  try {
    await ensureCardOverrides();
    const { Body } = await compileGuideCached(key, source);
    return (
      <DocsBody className={className}>
        <Body components={getMDXComponents()} />
      </DocsBody>
    );
  } catch {
    // Checked when saving, so this only happens if card data changed since; show nothing rather than break the page.
    return null;
  }
}

/** The home page's intro under the site name. */
export function HomeIntro({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <SiteText
      text={introMarkup(text)}
      className="text-fd-muted-foreground [&_p]:my-0 [&_p+p]:mt-2"
    />
  );
}

/** The admin's home page announcement. Small and quiet: it sits below the site's main buttons. */
export function Announcement({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <aside className="rounded-lg border bg-fd-card px-4 py-0.5 text-sm text-fd-muted-foreground [&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-base [&_h2]:text-fd-foreground [&_h3]:text-sm [&_li]:my-0.5 [&_ol]:my-2 [&_p]:my-2 [&_ul]:my-2">
      <SiteText text={text} className="text-sm" />
    </aside>
  );
}
