"use client";

import { useMemo, useState } from "react";
import { saveFallingSettings } from "@/app/studio/actions";
import { FallingCards } from "@/components/falling-cards";
import {
  ErrorText,
  primaryButton,
  secondaryButton,
  useAction,
} from "@/components/studio/forms";
import {
  DEFAULT_FALLING,
  FALLING_KIND_LABELS,
  FALLING_KINDS,
  type FallingCatalogEntry,
  type FallingPool,
  type FallingSettings,
} from "@/lib/falling";

type NumberKey = {
  [K in keyof FallingSettings]: FallingSettings[K] extends number ? K : never;
}[keyof FallingSettings];

/** Number settings: label, range and how to show the value. */
const SLIDERS: {
  key: NumberKey;
  label: string;
  min: number;
  max: number;
  step: number;
  show: (v: number) => string;
}[] = [
  {
    key: "count",
    label: "Cards on screen",
    min: 1,
    max: 150,
    step: 1,
    show: (v) => `${v} (on a 1280px wide screen)`,
  },
  {
    key: "speed",
    label: "Falling speed",
    min: 5,
    max: 600,
    step: 5,
    show: (v) => `${v} px/s`,
  },
  {
    key: "speedVariation",
    label: "Falling speed variation",
    min: 0,
    max: 1,
    step: 0.05,
    show: (v) => `±${Math.round(v * 100)}%`,
  },
  {
    key: "spin",
    label: "Rotation speed",
    min: 0,
    max: 360,
    step: 5,
    show: (v) => `${v}°/s`,
  },
  {
    key: "spinVariation",
    label: "Rotation speed variation",
    min: 0,
    max: 1,
    step: 0.05,
    show: (v) => `±${Math.round(v * 100)}%`,
  },
  {
    key: "size",
    label: "Card size",
    min: 16,
    max: 200,
    step: 1,
    show: (v) => `${v} px wide`,
  },
  {
    key: "sizeVariation",
    label: "Card size variation",
    min: 0,
    max: 1,
    step: 0.05,
    show: (v) => `±${Math.round(v * 100)}%`,
  },
  {
    key: "opacity",
    label: "Opacity",
    min: 0.02,
    max: 1,
    step: 0.01,
    show: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "sway",
    label: "Sideways sway",
    min: 0,
    max: 120,
    step: 1,
    show: (v) => `${v} px`,
  },
];

/** Cards, enhancements and seals that never show up: search, click to add, click a chip to remove. */
function Blacklist({
  catalog,
  refs,
  onChange,
}: {
  catalog: FallingCatalogEntry[];
  refs: string[];
  onChange: (refs: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const byRef = useMemo(
    () => new Map(catalog.map((c) => [c.ref, c])),
    [catalog],
  );
  const listed = new Set(refs);
  const q = query.trim().toLowerCase();
  const results = q
    ? catalog
        .filter(
          (c) =>
            !listed.has(c.ref) &&
            (c.name.toLowerCase().includes(q) ||
              c.group.toLowerCase().includes(q)),
        )
        .slice(0, 40)
    : [];
  const thumb = (c: FallingCatalogEntry) => (
    <span className="relative inline-block h-8 w-6 shrink-0">
      {c.layers.map((src) => (
        // biome-ignore lint/performance/noImgElement: tiny sprite thumbnail
        <img
          key={src}
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-contain"
          loading="lazy"
        />
      ))}
    </span>
  );

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-semibold">Blacklist</legend>
      <p className="text-xs text-fd-muted-foreground">
        These never show up. Enhancements and seals here are left off playing
        cards.
      </p>
      {refs.length > 0 && (
        <span className="flex flex-wrap gap-1.5">
          {refs.map((ref) => {
            const c = byRef.get(ref);
            return (
              <button
                key={ref}
                type="button"
                title="Remove from the blacklist"
                onClick={() => onChange(refs.filter((r) => r !== ref))}
                className="flex items-center gap-1.5 rounded-full border py-0.5 pr-2 pl-1 text-xs hover:bg-fd-accent"
              >
                {c && thumb(c)}
                {c?.name ?? ref}
                <span aria-hidden>✕</span>
              </button>
            );
          })}
        </span>
      )}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search cards to blacklist, e.g. Joker, Hermit, King of Hearts, Stone"
        className="w-full rounded-md border bg-fd-background px-2 py-1.5 text-sm"
      />
      {q && (
        <ul className="grid max-h-64 grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3">
          {results.length === 0 && (
            <li className="text-xs text-fd-muted-foreground">No matches</li>
          )}
          {results.map((c) => (
            <li key={c.ref}>
              <button
                type="button"
                onClick={() => onChange([...refs, c.ref])}
                className="flex w-full items-center gap-2 rounded-md p-1 text-left text-xs hover:bg-fd-accent"
              >
                {thumb(c)}
                <span className="min-w-0">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="block text-fd-muted-foreground">
                    {c.group}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

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
  const totalWeight = FALLING_KINDS.reduce(
    (sum, k) => sum + settings.weights[k],
    0,
  );
  const set = (patch: Partial<FallingSettings>) =>
    setSettings({ ...settings, ...patch });

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
        />
        Show falling cards behind the home page
      </label>

      <div className="relative h-72 overflow-hidden rounded-xl border bg-fd-background">
        <span className="absolute top-2 left-3 z-10 text-xs text-fd-muted-foreground">
          Preview
        </span>
        <div className="absolute inset-0">
          <FallingCards settings={settings} pool={pool} />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Mix</legend>
        {FALLING_KINDS.map((kind) => (
          <label
            key={kind}
            className="grid grid-cols-[1fr_8rem_3rem] items-center gap-3 text-sm"
          >
            {FALLING_KIND_LABELS[kind]}
            <input
              type="range"
              min={0}
              max={100}
              value={settings.weights[kind]}
              onChange={(e) =>
                set({
                  weights: {
                    ...settings.weights,
                    [kind]: Number(e.target.value),
                  },
                })
              }
            />
            <span className="text-right text-xs text-fd-muted-foreground tabular-nums">
              {totalWeight
                ? `${Math.round((settings.weights[kind] / totalWeight) * 100)}%`
                : "—"}
            </span>
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.modCards}
            onChange={(e) => set({ modCards: e.target.checked })}
          />
          Include Multiplayer mod cards
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.jokerEditions}
            onChange={(e) => set({ jokerEditions: e.target.checked })}
            className="mt-1"
          />
          <span>
            Jokers can have editions
            <span className="block text-xs text-fd-muted-foreground">
              Foil, Holographic, Polychrome or Negative, as often as in the
              shop. Playing cards always get enhancements, seals and editions as
              often as from a Standard pack.
            </span>
          </span>
        </label>
      </fieldset>

      <Blacklist
        catalog={catalog}
        refs={settings.blacklist}
        onChange={(blacklist) => set({ blacklist })}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Motion and look</legend>
        {SLIDERS.map((s) => (
          <label key={s.key} className="flex flex-col gap-1 text-sm">
            <span className="flex justify-between gap-2">
              {s.label}
              <span className="text-xs text-fd-muted-foreground tabular-nums">
                {s.show(settings[s.key])}
              </span>
            </span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={settings[s.key]}
              onChange={(e) => set({ [s.key]: Number(e.target.value) })}
            />
          </label>
        ))}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.depth}
            onChange={(e) => set({ depth: e.target.checked })}
            className="mt-1"
          />
          <span>
            Depth
            <span className="block text-xs text-fd-muted-foreground">
              Smaller cards fall slower, as if further away.
            </span>
          </span>
        </label>
      </fieldset>

      <p className="text-xs text-fd-muted-foreground">
        Kept light for slow devices: it starts after the page has loaded, uses
        at most 24 different pictures, shows fewer cards when a device
        struggles, and is skipped with reduced motion or data saver.
      </p>
      <ErrorText error={error} />
      <span className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || !changed}
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
          onClick={() => set({ ...DEFAULT_FALLING, enabled: settings.enabled })}
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
