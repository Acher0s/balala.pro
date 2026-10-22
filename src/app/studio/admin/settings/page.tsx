import { CategoriesForm } from "@/components/studio/categories-form";
import { FallingEditor } from "@/components/studio/falling-editor";
import { SiteSettingsForm } from "@/components/studio/forms";
import { requireUser } from "@/lib/auth";
import { fallingPool } from "@/lib/falling-pool";
import { listPublished } from "@/lib/guides";
import { getCategories, getFalling, getSettings } from "@/lib/settings";

export default async function SiteSettingsPage() {
  await requireUser("admin");
  const [settings, categories, published, falling] = await Promise.all([
    getSettings(),
    getCategories(),
    listPublished(),
    getFalling(),
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
        <h2 className="text-lg font-semibold">Home page background</h2>
        <FallingEditor saved={falling} pool={fallingPool()} />
      </section>
    </main>
  );
}
