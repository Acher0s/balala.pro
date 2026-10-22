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
    <div className="pointer-events-none fixed inset-0 -z-10">
      <FallingCards settings={settings} pool={pool} />
    </div>
  );
}
