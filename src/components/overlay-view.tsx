"use client";

import { useEffect, useState } from "react";
import { FallingCards } from "@/components/falling-cards";
import type { FallingPool, FallingSettings } from "@/lib/falling";

/**
 * A card background overlay as a browser source: just the cards on a transparent page. There's
 * no mouse in OBS, so edition shine wobbles on its own like the game's cards that aren't hovered.
 * It checks for changed settings every `refresh` ms, so edits reach the stream without a reload.
 */
export function OverlayView({
  id,
  initial,
  pool,
  refresh,
}: {
  id: string;
  initial: FallingSettings;
  pool: FallingPool;
  refresh: number;
}) {
  const [settings, setSettings] = useState(initial);

  useEffect(() => {
    let last = JSON.stringify(initial);
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/overlays/${id}`, { cache: "no-store" });
        if (!res.ok) return;
        const { settings: next } = (await res.json()) as {
          settings: FallingSettings;
        };
        const key = JSON.stringify(next);
        if (key !== last) {
          last = key;
          setSettings(next);
        }
      } catch {
        // Offline for a moment: keep showing what we have.
      }
    }, refresh);
    return () => window.clearInterval(timer);
  }, [id, initial, refresh]);

  return (
    <div className="fixed inset-0">
      <FallingCards
        settings={settings}
        pool={pool}
        interactive={false}
        freshPictures
        ignoreReducedMotion
      />
    </div>
  );
}
