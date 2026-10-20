import type { Metadata } from "next";
import { TierMaker } from "@/components/tierlist/tier-maker";
import { getCurrentUser } from "@/lib/auth";
import { tierCatalog } from "@/lib/tierlists";

export const metadata: Metadata = { title: "Make a tier list" };

export default async function NewTierListPage() {
  const user = await getCurrentUser();
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold">Make a tier list</h1>
      <TierMaker catalog={tierCatalog()} signedIn={!!user} />
    </main>
  );
}
