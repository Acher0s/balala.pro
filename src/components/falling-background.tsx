"use client";

import dynamic from "next/dynamic";
import type { FallingPool, FallingSettings } from "@/lib/falling";

// Loaded on demand and only in the browser, so the effect never delays the page itself.
const FallingCards = dynamic(
  () => import("@/components/falling-cards").then((m) => m.FallingCards),
  { ssr: false },
);

/** The home page's falling cards, fixed behind everything else on the page. */
export function FallingBackground({
  settings,
  pool,
}: {
  settings: FallingSettings;
  pool: FallingPool;
}) {
  return (
    // The largest viewport height (lvh), so phones showing or hiding their address bar while
    // scrolling don't resize (and so clear) the canvas.
    <div className="pointer-events-none fixed top-0 left-0 -z-10 h-lvh w-full">
      <FallingCards settings={settings} pool={pool} />
    </div>
  );
}
