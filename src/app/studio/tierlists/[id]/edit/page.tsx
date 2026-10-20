import { notFound } from "next/navigation";
import { TierMaker } from "@/components/tierlist/tier-maker";
import { requireUser, STUDIO } from "@/lib/auth";
import type { TierListData } from "@/lib/tierlist-shared";
import { canEditTierList, getTierList, tierCatalog } from "@/lib/tierlists";

export default async function StudioEditTierListPage({
  params,
}: PageProps<"/studio/tierlists/[id]/edit">) {
  const { id } = await params;
  const user = await requireUser("writer", `${STUDIO}/tierlists/${id}/edit`);
  const found = await getTierList(id);
  if (!found || !canEditTierList(user, found.list)) notFound();
  const { list } = found;
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold">Edit tier list</h1>
      <TierMaker
        catalog={tierCatalog()}
        signedIn
        basePath={`${STUDIO}/tierlists`}
        initial={{
          id: list.id,
          title: list.title,
          description: list.description,
          data: list.data as TierListData,
          status: list.status,
        }}
      />
    </main>
  );
}
