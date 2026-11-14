import { PageTile } from "@/components/page-tile";
import { CategoriesForm } from "@/components/studio/categories-form";
import { FallingEditor } from "@/components/studio/falling-editor";
import { SiteSettingsForm } from "@/components/studio/forms";
import { SiteToolForm } from "@/components/studio/site-tool-form";
import { requireUser } from "@/lib/auth";
import { fallingCatalog, fallingPool } from "@/lib/falling-pool";
import { listPublished } from "@/lib/guides";
import { getCategories, getFalling, getSettings } from "@/lib/settings";
import { getSiteTools } from "@/lib/site-tools-settings";

export default async function SiteSettingsPage() {
  await requireUser("admin");
  const [settings, categories, published, falling, siteTools] =
    await Promise.all([
      getSettings(),
      getCategories(),
      listPublished(),
      getFalling(),
      getSiteTools(),
    ]);
  // Tags on published guides and tools, most used first, to help set up categories.
  const counts = new Map<string, number>();
  for (const p of published)
    for (const tag of p.frontmatter.tags)
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
  const tagsInUse = [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-bold">Site settings</h1>
      <SiteSettingsForm
        siteName={settings.siteName}
        homeIntro={settings.homeIntro}
        announcement={settings.announcement}
        guidesIntro={settings.guidesIntro}
        toolsIntro={settings.toolsIntro}
      />
      <section className="flex flex-col gap-3 border-t pt-6">
        <h2 className="text-lg font-semibold">Categories</h2>
        <CategoriesForm initial={categories} tagsInUse={tagsInUse} />
      </section>
      <section className="flex flex-col gap-3 border-t pt-6">
        <h2 className="text-lg font-semibold">Built-in tools</h2>
        <p className="text-sm text-fd-muted-foreground">
          Tools that are part of the site rather than written in the Studio.
          Their tile on the Tools page: the description, tags and banner cards.
        </p>
        {siteTools.map((t) => (
          <div
            key={t.href}
            className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
          >
            <div className="not-prose">
              <PageTile frontmatter={t.frontmatter} href={t.href} />
            </div>
            <SiteToolForm
              href={t.href}
              description={t.frontmatter.description ?? ""}
              tags={t.frontmatter.tags}
              icon={t.frontmatter.icon}
            />
          </div>
        ))}
      </section>
      <section className="flex flex-col gap-3 border-t pt-6">
        <h2 className="text-lg font-semibold">Home page background</h2>
        <FallingEditor
          saved={falling}
          // The preview keeps every card in its sample, so blacklisting applies there live.
          pool={fallingPool()}
          catalog={fallingCatalog()}
        />
      </section>
    </main>
  );
}
