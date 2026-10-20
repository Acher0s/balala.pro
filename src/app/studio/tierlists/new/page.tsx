import { TierMaker } from "@/components/tierlist/tier-maker";
import { requireUser, STUDIO } from "@/lib/auth";
import { tierCatalog } from "@/lib/tierlists";

export default async function StudioNewTierListPage() {
  await requireUser("writer", `${STUDIO}/tierlists/new`);
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold">New tier list</h1>
      <TierMaker
        catalog={tierCatalog()}
        signedIn
        basePath={`${STUDIO}/tierlists`}
      />
    </main>
  );
}
