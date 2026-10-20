import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TierBoard } from "@/components/tierlist/tier-board";
import { getCurrentUser } from "@/lib/auth";
import type { TierListData } from "@/lib/tierlist-shared";
import { canEditTierList, canSeeTierList, getTierList } from "@/lib/tierlists";

export default async function TierListPage({
  params,
}: PageProps<"/tierlists/[id]">) {
  const { id } = await params;
  const [found, user] = await Promise.all([getTierList(id), getCurrentUser()]);
  if (!found || !canSeeTierList(user, found.list)) notFound();
  const { list, ownerName } = found;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{list.title}</h1>
          <p className="text-sm text-fd-muted-foreground">
            by {ownerName}
            {list.status === "private" && " · Private: only you can see this"}
          </p>
          {list.description && <p className="mt-2">{list.description}</p>}
        </div>
        <div className="flex gap-2">
          {canEditTierList(user, list) && (
            <Link
              href={`/tierlists/${list.id}/edit`}
              className="rounded-md bg-fd-primary px-3 py-1.5 text-sm text-fd-primary-foreground"
            >
              Edit
            </Link>
          )}
          <Link
            href="/tierlists/new"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-fd-accent"
          >
            Make your own
          </Link>
        </div>
      </div>
      <TierBoard data={list.data as TierListData} />
    </main>
  );
}

export async function generateMetadata({
  params,
}: PageProps<"/tierlists/[id]">): Promise<Metadata> {
  const found = await getTierList((await params).id);
  if (!found || found.list.status !== "published") return {};
  return {
    title: found.list.title,
    description: found.list.description || undefined,
  };
}
