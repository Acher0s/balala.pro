import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { TierListModeration } from "@/components/studio/tier-list-moderation";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";

export default async function TierListModerationPage() {
  await requireUser("admin");
  const db = await getDb();
  const rows = await db
    .select({ list: schema.tierLists, owner: schema.users.displayName })
    .from(schema.tierLists)
    .innerJoin(schema.users, eq(schema.users.id, schema.tierLists.ownerId))
    .orderBy(desc(schema.tierLists.status), desc(schema.tierLists.updatedAt))
    .limit(500);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-bold">Tier lists</h1>
        <p className="text-sm text-fd-muted-foreground">
          Anyone signed in can publish tier lists. Unpublish or delete ones that
          shouldn't be on the site.
        </p>
      </div>
      <ul className="divide-y rounded-xl border bg-fd-card">
        {rows.length === 0 && (
          <li className="p-4 text-sm text-fd-muted-foreground">
            No tier lists yet.
          </li>
        )}
        {rows.map(({ list, owner }) => (
          <li
            key={list.id}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
          >
            <span className="flex flex-col">
              <Link
                href={`/tierlists/${list.id}`}
                className="font-medium hover:underline"
              >
                {list.title}
              </Link>
              <span className="text-xs text-fd-muted-foreground">
                by {owner} ·{" "}
                {list.status === "published" ? "Published" : "Private"} ·{" "}
                {list.updatedAt.toLocaleDateString()}
              </span>
            </span>
            <TierListModeration
              id={list.id}
              published={list.status === "published"}
            />
          </li>
        ))}
      </ul>
    </main>
  );
}
