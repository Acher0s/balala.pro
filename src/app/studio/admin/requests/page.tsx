import { desc, eq } from "drizzle-orm";
import { Panel, RequestDecision } from "@/components/studio/forms";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";

export default async function RequestsPage() {
  await requireUser("admin");
  const db = await getDb();
  const rows = await db
    .select({ request: schema.writerRequests, user: schema.users })
    .from(schema.writerRequests)
    .innerJoin(schema.users, eq(schema.users.id, schema.writerRequests.userId))
    .orderBy(desc(schema.writerRequests.createdAt))
    .limit(100);
  const pending = rows.filter((r) => r.request.status === "pending");
  const decided = rows.filter((r) => r.request.status !== "pending");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <h1 className="text-2xl font-bold">Writer requests</h1>
      <Panel title={`Waiting (${pending.length})`}>
        {pending.length === 0 && (
          <p className="text-sm text-fd-muted-foreground">Nothing to review.</p>
        )}
        <ul className="flex flex-col gap-3">
          {pending.map(({ request, user }) => (
            <li
              key={request.id}
              className="flex flex-col gap-2 rounded-xl border bg-fd-card p-4"
            >
              <span className="flex items-center gap-2">
                {user.avatarUrl && (
                  // biome-ignore lint/performance/noImgElement: Discord avatar
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="size-6 rounded-full"
                  />
                )}
                <span className="font-medium">{user.displayName}</span>
                <span className="text-xs text-fd-muted-foreground">
                  @{user.username} · {request.createdAt.toLocaleDateString()}
                </span>
              </span>
              <p className="whitespace-pre-line text-sm">{request.message}</p>
              <RequestDecision id={request.id} />
            </li>
          ))}
        </ul>
      </Panel>
      {decided.length > 0 && (
        <Panel title="Decided">
          <ul className="divide-y rounded-xl border text-sm">
            {decided.map(({ request, user }) => (
              <li
                key={request.id}
                className="flex justify-between gap-2 px-4 py-2"
              >
                <span>
                  {user.displayName}{" "}
                  <span className="text-fd-muted-foreground">
                    @{user.username}
                  </span>
                </span>
                <span
                  className={
                    request.status === "approved"
                      ? "text-green-600"
                      : "text-fd-muted-foreground"
                  }
                >
                  {request.status} {request.decidedAt?.toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </main>
  );
}
