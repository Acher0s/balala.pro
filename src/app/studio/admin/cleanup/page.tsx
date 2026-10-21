import { BulkDeleteForm } from "@/components/studio/bulk-delete";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { listStudioGuides, pageUrl } from "@/lib/guides";

export default async function CleanupPage() {
  await requireUser("admin");
  const db = await getDb();
  const [guides, users] = await Promise.all([
    listStudioGuides(),
    db.select().from(schema.users),
  ]);
  const authors = new Map(users.map((u) => [u.id, u.displayName]));
  const titles = new Map(guides.map((g) => [g.guide.id, g.title]));
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Clean up</h1>
        <p className="text-sm text-fd-muted-foreground">
          Delete guides and tools in bulk. Filter the list, tick what should go,
          and delete it together with its version history.
        </p>
      </div>
      <BulkDeleteForm
        rows={guides.map(({ guide, title, status }) => ({
          id: guide.id,
          kind: guide.kind,
          title,
          url: pageUrl(guide.kind, guide.slug),
          partOf: guide.parentId ? (titles.get(guide.parentId) ?? null) : null,
          status,
          author: guide.authorId
            ? (authors.get(guide.authorId) ?? "Unknown")
            : "Nobody",
          updatedAt: guide.updatedAt.toISOString(),
        }))}
      />
    </main>
  );
}
