import Link from "next/link";
import { listPublished, pageUrl } from "@/lib/guides";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [guides, settings] = await Promise.all([
    listPublished(),
    getSettings(),
  ]);
  // Guides grouped by their sidebar section, then all tools under "Tools".
  const sections = new Map<string, typeof guides>();
  for (const g of guides.filter((p) => p.kind === "guide"))
    sections.set(g.section, [...(sections.get(g.section) ?? []), g]);
  const tools = guides.filter((p) => p.kind === "tool");
  if (tools.length) sections.set("Tools", tools);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-16">
      <div>
        <h1 className="mb-3 text-3xl font-bold">{settings.siteName}</h1>
        <p className="whitespace-pre-line text-fd-muted-foreground">
          {settings.homeIntro}
        </p>
      </div>
      {guides.length === 0 && (
        <p className="text-fd-muted-foreground">No guides yet.</p>
      )}
      {[...sections].map(([section, list]) => (
        <section key={section} className="flex flex-col gap-3">
          {section && <h2 className="text-lg font-semibold">{section}</h2>}
          <ul className="grid gap-3 sm:grid-cols-2">
            {list.map((g) => (
              <li key={g.id}>
                <Link
                  href={pageUrl(g.kind, g.slug)}
                  className="block h-full rounded-xl border bg-fd-card p-4 transition-colors hover:bg-fd-accent"
                >
                  <span className="block font-semibold">
                    {g.frontmatter.title}
                  </span>
                  {g.frontmatter.description && (
                    <span className="mt-1 block text-sm text-fd-muted-foreground">
                      {g.frontmatter.description}
                    </span>
                  )}
                  {g.frontmatter.tags.length > 0 && (
                    <span className="mt-3 flex flex-wrap gap-1">
                      {g.frontmatter.tags.map((tag) => (
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
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
