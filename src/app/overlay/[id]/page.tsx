import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OverlayView } from "@/components/overlay-view";
import { fallingPool } from "@/lib/falling-pool";
import { cardSettings, getOverlay, OVERLAY_REFRESH } from "@/lib/overlays";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Overlay",
  robots: { index: false, follow: false },
};

/**
 * An overlay as a browser source: no header or page, a transparent background, only the effect.
 * Opened by its link alone, as OBS isn't signed in; making one needs an account.
 */
export default async function OverlayPage({
  params,
}: PageProps<"/overlay/[id]">) {
  const { id } = await params;
  const overlay = await getOverlay(id);
  if (!overlay) notFound();
  return (
    <>
      {/* Whatever the site's theme, the stream sees through everything but the cards. */}
      <style>
        {"html,body{background:transparent!important;overflow:hidden}"}
      </style>
      <OverlayView
        id={overlay.id}
        initial={cardSettings(overlay)}
        pool={fallingPool([], { everything: true })}
        refresh={OVERLAY_REFRESH}
      />
    </>
  );
}
