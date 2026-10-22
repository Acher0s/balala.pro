import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { OverlayEditor } from "@/components/overlay-editor";
import { getCurrentUser, loginUrl } from "@/lib/auth";
import { fallingCatalog, fallingPool } from "@/lib/falling-pool";
import {
  DEFAULT_OVERLAY,
  listOwnOverlays,
  OVERLAY_LIMIT,
} from "@/lib/overlays";

export const metadata: Metadata = {
  title: "New card background overlay",
  robots: { index: false },
};

export default async function NewCardOverlayPage() {
  const user = await getCurrentUser();
  if (!user) redirect(loginUrl("/overlays/cards"));
  const full = (await listOwnOverlays(user.id)).length >= OVERLAY_LIMIT;
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <div>
        <Link
          href="/overlays"
          className="text-sm text-fd-muted-foreground hover:underline"
        >
          ← Overlays
        </Link>
        <h1 className="text-3xl font-bold">New card background overlay</h1>
        <p className="text-fd-muted-foreground">
          Set it up, save it, and you get a link to add to OBS as a browser
          source.
        </p>
      </div>
      {full ? (
        <p className="text-fd-muted-foreground">
          You already have {OVERLAY_LIMIT} overlays. Delete one on the{" "}
          <Link href="/overlays" className="underline">
            Overlays
          </Link>{" "}
          page to make another.
        </p>
      ) : (
        <OverlayEditor
          initialName="Card background"
          initial={DEFAULT_OVERLAY}
          pool={fallingPool([], { everything: true })}
          catalog={fallingCatalog()}
        />
      )}
    </main>
  );
}
