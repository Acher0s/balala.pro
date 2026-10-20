import Link from "next/link";
import { TierListCard } from "@/components/tierlist/tier-list-card";
import { requireUser, STUDIO } from "@/lib/auth";
import { listOwnTierLists } from "@/lib/tierlists";

/** Your tier lists, inside the studio (the same lists as /tierlists/mine). */
export default async function StudioTierListsPage() {
  const user = await requireUser("writer", `${STUDIO}/tierlists`);
  const lists = await listOwnTierLists(user.id);
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">Your tier lists</h1>
        <Link
          href={`${STUDIO}/tierlists/new`}
          className="rounded-md bg-fd-primary px-3 py-1.5 text-sm font-medium text-fd-primary-foreground"
        >
          New tier list
        </Link>
      </div>
      {lists.length === 0 && (
        <p className="text-fd-muted-foreground">
          You haven't made any tier lists yet.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lists.map((list) => (
          <TierListCard
            key={list.id}
            list={list}
            showStatus
            href={`${STUDIO}/tierlists/${list.id}/edit`}
          />
        ))}
      </div>
    </main>
  );
}
