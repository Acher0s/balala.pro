"use client";

import { useState } from "react";
import { saveFallingSettings } from "@/app/studio/actions";
import { FallingCards } from "@/components/falling-cards";
import { chancesValid, FallingControls } from "@/components/falling-controls";
import {
  ErrorText,
  primaryButton,
  secondaryButton,
  useAction,
} from "@/components/studio/forms";
import {
  DEFAULT_FALLING,
  type FallingCatalogEntry,
  type FallingPool,
  type FallingSettings,
} from "@/lib/falling";

/**
 * Studio → Site → Home page background: settings for the falling cards, with a live preview.
 * Nothing changes on the home page until it's saved.
 */
export function FallingEditor({
  saved,
  pool,
  catalog,
}: {
  saved: FallingSettings;
  pool: FallingPool;
  /** Everything that can show up, for the blacklist. */
  catalog: FallingCatalogEntry[];
}) {
  const [settings, setSettings] = useState(saved);
  const [lastSaved, setLastSaved] = useState(saved);
  const { pending, error, run } = useAction();
  const changed = JSON.stringify(settings) !== JSON.stringify(lastSaved);
  const valid = chancesValid(settings.chances);

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) =>
            setSettings({ ...settings, enabled: e.target.checked })
          }
        />
        Show falling cards behind the home page
      </label>

      <div className="sticky top-16 z-10 h-72 overflow-hidden rounded-xl border bg-fd-background">
        <span className="absolute top-2 left-3 z-10 text-xs text-fd-muted-foreground">
          Preview
        </span>
        <div className="absolute inset-0">
          <FallingCards settings={settings} pool={pool} />
        </div>
      </div>

      <FallingControls
        settings={settings}
        onChange={setSettings}
        catalog={catalog}
      />

      <p className="text-xs text-fd-muted-foreground">
        Kept light for slow devices: it starts after the page has loaded, uses
        at most 24 different pictures, shows fewer cards when a device
        struggles, and is skipped with reduced motion or data saver.
      </p>
      <ErrorText error={error} />
      <span className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || !changed || !valid}
          onClick={() =>
            run(
              () => saveFallingSettings(settings),
              () => setLastSaved(settings),
            )
          }
          className={primaryButton}
        >
          {pending ? "Saving…" : "Save background"}
        </button>
        <button
          type="button"
          disabled={!changed}
          onClick={() => setSettings(lastSaved)}
          className={secondaryButton}
        >
          Undo changes
        </button>
        <button
          type="button"
          onClick={() =>
            setSettings({ ...DEFAULT_FALLING, enabled: settings.enabled })
          }
          className={secondaryButton}
        >
          Default values
        </button>
        {!changed && JSON.stringify(lastSaved) !== JSON.stringify(saved) && (
          <span className="text-sm text-fd-muted-foreground">Saved</span>
        )}
      </span>
    </div>
  );
}
