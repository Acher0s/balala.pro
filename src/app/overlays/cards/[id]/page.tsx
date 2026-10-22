import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OverlayEditor } from "@/components/overlay-editor";
import { getCurrentUser, loginUrl } from "@/lib/auth";
import { fallingCatalog, fallingPool } from "@/lib/falling-pool";
import { cardSettings, getOverlay } from "@/lib/overlays";

export const metadata: Metadata = {
  title: "Card background overlay",
  robots: { index: false },
};

export default async function EditCardOverlayPage({
  params,
}: PageProps<"/overlays/cards/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(loginUrl(`/overlays/cards/${id}`));
  const overlay = await getOverlay(id);
  // Someone else's overlay looks the same as a missing one, so ids can't be probed.
  if (!overlay || overlay.ownerId !== user.id) notFound();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <div>
        <Link
          href="/overlays"
          className="text-sm text-fd-muted-foreground hover:underline"
        >
          ← Overlays
        </Link>
        <h1 className="text-3xl font-bold">{overlay.name}</h1>
      </div>
      <OverlayEditor
        // A reset link gives a new id: start fresh from what's saved.
        key={overlay.id}
        id={overlay.id}
        initialName={overlay.name}
        initial={cardSettings(overlay)}
        pool={fallingPool([], { everything: true })}
        catalog={fallingCatalog()}
      />
    </main>
  );
}
