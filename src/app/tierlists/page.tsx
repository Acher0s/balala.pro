import type { Metadata } from "next";
import Link from "next/link";
import { TierListCard } from "@/components/tierlist/tier-list-card";
import { listPublishedTierLists } from "@/lib/tierlists";

export const metadata: Metadata = { title: "Tier lists" };

export default async function TierListsPage() {
  const lists = await listPublishedTierLists();
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Tier lists</h1>
          <p className="text-fd-muted-foreground">
            Rank jokers, tarots, vouchers or any other card, and share it.
          </p>
        </div>
        <Link
          href="/tierlists/new"
          className="rounded-md bg-fd-primary px-4 py-2 font-medium text-fd-primary-foreground"
        >
          Make a tier list
        </Link>
      </div>
      {lists.length === 0 && (
        <p className="text-fd-muted-foreground">
          No tier lists published yet. Be the first!
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lists.map(({ list, ownerName }) => (
          <TierListCard key={list.id} list={list} ownerName={ownerName} />
        ))}
      </div>
    </main>
  );
}
