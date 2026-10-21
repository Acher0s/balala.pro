import { and, count, desc, eq } from "drizzle-orm";
import Link from "next/link";
import {
  NewGuideForm,
  Panel,
  RequestAccessForm,
} from "@/components/studio/forms";
import { getDb, schema } from "@/db";
import { hasRole, requireUser, STUDIO } from "@/lib/auth";
import { listStudioGuides, pageUrl, type StudioGuide } from "@/lib/guides";

const STATUS_LABEL: Record<StudioGuide["status"], string> = {
  draft: "Draft",
  published: "Published",
  changed: "Unpublished changes",
};

export default async function StudioHome() {
  const user = await requireUser();
  const db = await getDb();

  if (!hasRole(user, "writer")) {
    const [latest] = await db
      .select()
      .from(schema.writerRequests)
      .where(eq(schema.writerRequests.userId, user.id))
      .orderBy(desc(schema.writerRequests.createdAt))
      .limit(1);
    return (
      <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-12">
        <h1 className="text-2xl font-bold">Welcome, {user.displayName}</h1>
        {latest?.status === "pending" ? (
          <p className="rounded-xl border bg-fd-card p-4">
            Your request to become an author is waiting for an admin. You'll get
            access as soon as it's approved.
          </p>
        ) : (
          <>
            {latest?.status === "denied" && (
              <p className="rounded-xl border p-4 text-sm text-fd-muted-foreground">
                Your last request wasn't approved. You can send a new one.
              </p>
            )}
            <p className="text-fd-muted-foreground">
              You can read guides, but writing guides needs approval from an
              admin.
            </p>
            <RequestAccessForm />
          </>
        )}
      </main>
    );
  }

  const isAdmin = user.role === "admin";
  const guides = await listStudioGuides(isAdmin ? undefined : user.id);
  const authors = isAdmin
    ? new Map(
        (await db.select().from(schema.users)).map((u) => [
          u.id,
          u.displayName,
        ]),
      )
    : new Map<string, string>();
  const [{ pending }] = isAdmin
    ? await db
        .select({ pending: count() })
        .from(schema.writerRequests)
        .where(and(eq(schema.writerRequests.status, "pending")))
    : [{ pending: 0 }];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10">
      <h1 className="text-2xl font-bold">
        {isAdmin ? "All guides and tools" : "Your guides and tools"}
      </h1>
      {pending > 0 && (
        <Link
          href={`${STUDIO}/admin/requests`}
          className="rounded-xl border border-fd-primary/40 bg-fd-primary/10 p-3 text-sm"
        >
          {pending} author request{pending === 1 ? "" : "s"} waiting for a
          decision →
        </Link>
      )}
      <NewGuideForm />
      <Panel title={`${guides.length} guide${guides.length === 1 ? "" : "s"}`}>
        <ul className="divide-y rounded-xl border bg-fd-card">
          {guides.length === 0 && (
            <li className="p-4 text-sm text-fd-muted-foreground">
              No guides yet.
            </li>
          )}
          {guides.map(({ guide, title, status }) => (
            <li
              key={guide.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <span className="flex flex-col">
                <span className="font-medium">{title}</span>
                <span className="text-xs text-fd-muted-foreground">
                  {guide.kind === "tool" ? "Tool" : "Guide"} ·{" "}
                  {pageUrl(guide.kind, guide.slug)} · {STATUS_LABEL[status]}
                  {isAdmin &&
                    ` · by ${guide.authorId ? (authors.get(guide.authorId) ?? "?") : "nobody"}`}
                </span>
              </span>
              <span className="flex gap-2 text-sm">
                {status !== "draft" && (
                  <Link
                    href={pageUrl(guide.kind, guide.slug)}
                    className="rounded-md border px-2 py-1 hover:bg-fd-accent"
                  >
                    View
                  </Link>
                )}
                <Link
                  href={`${STUDIO}/guides/${guide.id}`}
                  className="rounded-md bg-fd-primary px-2 py-1 text-fd-primary-foreground hover:opacity-90"
                >
                  Edit
                </Link>
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </main>
  );
}
