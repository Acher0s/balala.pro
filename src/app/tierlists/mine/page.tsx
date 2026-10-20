import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TierListCard } from "@/components/tierlist/tier-list-card";
import { getCurrentUser, loginUrl } from "@/lib/auth";
import { listOwnTierLists } from "@/lib/tierlists";

export const metadata: Metadata = {
  title: "My tier lists",
  robots: { index: false },
};

export default async function MyTierListsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(loginUrl("/tierlists/mine"));
  const lists = await listOwnTierLists(user.id);
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-bold">My tier lists</h1>
        <Link
          href="/tierlists/new"
          className="rounded-md bg-fd-primary px-4 py-2 font-medium text-fd-primary-foreground"
        >
          Make a tier list
        </Link>
      </div>
      {lists.length === 0 && (
        <p className="text-fd-muted-foreground">
          You haven't saved any tier lists yet.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lists.map((list) => (
          <TierListCard key={list.id} list={list} showStatus />
        ))}
      </div>
    </main>
  );
}
