import { ImportPackForm } from "@/components/studio/forms";
import { requireUser } from "@/lib/auth";
import { listImportPacks } from "@/lib/content-import";

export default async function ImportPage() {
  await requireUser("admin");
  const packs = await listImportPacks();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Import</h1>
        <p className="text-sm text-fd-muted-foreground">
          Guides and tools that came with the site&apos;s code. Importing makes
          them drafts; publish each one from its editor. Publish tools before
          the guides that embed them.
        </p>
      </div>
      {packs.length === 0 && (
        <p className="text-sm text-fd-muted-foreground">Nothing to import.</p>
      )}
      {packs.map((pack) => (
        <ImportPackForm
          key={pack.id}
          id={pack.id}
          title={pack.title}
          section={pack.section}
          pages={pack.pages.map(({ source: _source, ...p }) => p)}
        />
      ))}
    </main>
  );
}
