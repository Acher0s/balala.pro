import { asc, count } from "drizzle-orm";
import { RoleSelect } from "@/components/studio/forms";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";

export default async function UsersPage() {
  const me = await requireUser("admin");
  const db = await getDb();
  const users = await db
    .select()
    .from(schema.users)
    .orderBy(asc(schema.users.createdAt));
  const guideCounts = new Map(
    (
      await db
        .select({ authorId: schema.guides.authorId, n: count() })
        .from(schema.guides)
        .groupBy(schema.guides.authorId)
    ).map((r) => [r.authorId, r.n]),
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-bold">People</h1>
        <p className="text-sm text-fd-muted-foreground">
          Everyone who has signed in. Writers edit their own guides; admins can
          edit everything. Setting someone to "No access" also signs them out.
        </p>
      </div>
      <ul className="divide-y rounded-xl border bg-fd-card">
        {users.map((u) => (
          <li
            key={u.id}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
          >
            <span className="flex items-center gap-2">
              {u.avatarUrl && (
                // biome-ignore lint/performance/noImgElement: Discord avatar
                <img src={u.avatarUrl} alt="" className="size-7 rounded-full" />
              )}
              <span className="flex flex-col">
                <span className="font-medium">
                  {u.displayName}{" "}
                  {u.id === me.id && (
                    <span className="text-xs text-fd-muted-foreground">
                      (you)
                    </span>
                  )}
                </span>
                <span className="text-xs text-fd-muted-foreground">
                  @{u.username} · {guideCounts.get(u.id) ?? 0} guides · joined{" "}
                  {u.createdAt.toLocaleDateString()}
                </span>
              </span>
            </span>
            <RoleSelect userId={u.id} role={u.role} disabled={u.id === me.id} />
          </li>
        ))}
      </ul>
    </main>
  );
}
