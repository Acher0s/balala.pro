import { createHash } from "node:crypto";
import { DocsBody } from "fumadocs-ui/layouts/notebook/page";
import { getMDXComponents } from "@/components/mdx";
import { ensureCardOverrides } from "@/lib/card-overrides";
import { compileGuideCached } from "@/lib/mdx/compile";
import { announcementSource } from "@/lib/settings";

/** The admin's home page announcement (Studio → Site), in guide markup. */
export async function Announcement({ text }: { text: string }) {
  if (!text.trim()) return null;
  const source = announcementSource(text);
  const key = `announcement:${createHash("sha1").update(source).digest("hex").slice(0, 12)}`;
  try {
    await ensureCardOverrides();
    const { Body } = await compileGuideCached(key, source);
    return (
      // Small and quiet: it sits below the site's main buttons.
      <aside className="rounded-lg border bg-fd-card px-4 py-0.5 text-sm text-fd-muted-foreground [&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-base [&_h2]:text-fd-foreground [&_h3]:text-sm [&_li]:my-0.5 [&_ol]:my-2 [&_p]:my-2 [&_ul]:my-2">
        <DocsBody className="text-sm">
          <Body components={getMDXComponents()} />
        </DocsBody>
      </aside>
    );
  } catch {
    // Checked when saving, so this only happens if card data changed since; show nothing rather than break the page.
    return null;
  }
}
