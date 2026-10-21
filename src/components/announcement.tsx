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
      <aside className="rounded-xl border border-fd-primary/30 bg-fd-primary/5 px-5 py-1">
        <DocsBody>
          <Body components={getMDXComponents()} />
        </DocsBody>
      </aside>
    );
  } catch {
    // Checked when saving, so this only happens if card data changed since; show nothing rather than break the page.
    return null;
  }
}
