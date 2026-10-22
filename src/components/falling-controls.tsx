"use client";

import { useMemo, useState } from "react";
import { secondaryButton } from "@/components/studio/forms";
import {
  type ChanceSection,
  DEFAULT_CHANCES,
  EDITIONS,
  ENHANCEMENTS,
  FALLING_KIND_LABELS,
  FALLING_KINDS,
  type FallingCatalogEntry,
  type FallingChances,
  type FallingSettings,
  RANKS,
  RARITIES,
  SEALS,
  SUITS,
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
    label: "Opacity of the whole background",
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

const EDITION_LABELS: Record<string, string> = {
  foil: "Foil",
  holo: "Holographic",
  polychrome: "Polychrome",
  negative: "Negative",
};
const RANK_LABELS: Record<string, string> = {
  J: "Jack",
  Q: "Queen",
  K: "King",
  A: "Ace",
};
const SUIT_LABELS: Record<string, string> = {
  H: "Hearts",
  D: "Diamonds",
  C: "Clubs",
  S: "Spades",
};
const capital = (s: string) => s[0].toUpperCase() + s.slice(1);

/**
 * The chance tables, in the order of the advanced tab. "weights" are relative to each other,
 * "percent" tables are chances out of 100 (what's left is "none"), and "chance" tables have a
 * percentage for whether it happens at all, then weights for which one.
 */
const SECTIONS: {
  key: ChanceSection;
  title: string;
  hint: string;
  type: "weights" | "percent" | "chance";
  keys: readonly string[];
  label: (key: string) => string;
  /** Name for "a seal", "an enhancement" in the chance row. */
  what?: string;
}[] = [
  {
    key: "jokerRarity",
    title: "Joker rarity",
    hint: "Like the shop: 70% Common, 25% Uncommon, 5% Rare. Legendaries only come from The Soul, so 0 by default.",
    type: "weights",
    keys: RARITIES,
    label: capital,
  },
  {
    key: "jokerEdition",
    title: "Joker editions",
    hint: "Like the shop. Only used while “Jokers can have editions” is on.",
    type: "percent",
    keys: EDITIONS,
    label: (k) => EDITION_LABELS[k],
  },
  {
    key: "ranks",
    title: "Playing card ranks",
    hint: "Every rank equally likely, like a Standard pack.",
    type: "weights",
    keys: RANKS,
    label: (k) => RANK_LABELS[k] ?? k,
  },
  {
    key: "suits",
    title: "Playing card suits",
    hint: "Every suit equally likely, like a Standard pack.",
    type: "weights",
    keys: SUITS,
    label: (k) => SUIT_LABELS[k],
  },
  {
    key: "seals",
    title: "Seals",
    hint: "Standard pack: 20% of cards get a seal, any seal equally likely.",
    type: "chance",
    keys: SEALS,
    label: capital,
    what: "a seal",
  },
  {
    key: "cardEdition",
    title: "Playing card editions",
    hint: "Standard pack: twice the shop's odds, and never Negative.",
    type: "percent",
    keys: EDITIONS,
    label: (k) => EDITION_LABELS[k],
  },
  {
    key: "enhancements",
    title: "Enhancements",
    hint: "Standard pack: 40% of cards are enhanced, any enhancement equally likely.",
    type: "chance",
    keys: ENHANCEMENTS,
    label: capital,
    what: "an enhancement",
  },
];

const numberInput =
  "w-20 rounded-md border bg-fd-background px-2 py-1 text-right text-sm tabular-nums";
const percent = (v: number) =>
  `${Math.round(v * 10) / 10}%`.replace(/\.0%$/, "%");

/** A table of numbers, one per key, each with its share or chance next to it. */
function NumberTable({
  keys,
  label,
  values,
  max,
  step,
  share,
  onChange,
}: {
  keys: readonly string[];
  label: (key: string) => string;
  values: Record<string, number>;
  max: number;
  step: number;
  /** What a value means, shown beside it (e.g. "25%"). */
  share: (value: number) => string;
  onChange: (values: Record<string, number>) => void;
}) {
  return (
    <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
      {keys.map((k) => (
        <label
          key={k}
          className="grid grid-cols-[1fr_auto_3.5rem] items-center gap-2 text-sm"
        >
          {label(k)}
          <input
            type="number"
            min={0}
            max={max}
            step={step}
            value={values[k]}
            onChange={(e) =>
              onChange({
                ...values,
                [k]: Math.min(max, Math.max(0, Number(e.target.value) || 0)),
              })
            }
            className={numberInput}
          />
          <span className="text-right text-xs text-fd-muted-foreground tabular-nums">
            {share(values[k])}
          </span>
        </label>
      ))}
    </div>
  );
}

/** The advanced tab: every spawn chance, each table resettable to the game's odds. */
function Chances({
  chances,
  onChange,
}: {
  chances: FallingChances;
  onChange: (chances: FallingChances) => void;
}) {
  const same = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);
  return (
    <div className="flex flex-col gap-5">
      <span className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fd-muted-foreground">
          These start at the game's own odds. Weights are relative to the others
          in the same table; editions are chances out of 100.
        </p>
        <button
          type="button"
          disabled={same(chances, DEFAULT_CHANCES)}
          onClick={() => onChange(DEFAULT_CHANCES)}
          className={secondaryButton}
        >
          Reset all to game odds
        </button>
      </span>
      {SECTIONS.map((section) => {
        const value = chances[section.key];
        const set = (next: FallingChances[typeof section.key]) =>
          onChange({ ...chances, [section.key]: next });
        let body: React.ReactNode;
        if (section.type === "percent") {
          const odds = value as Record<string, number>;
          const left = 100 - section.keys.reduce((sum, k) => sum + odds[k], 0);
          body = (
            <>
              <NumberTable
                keys={section.keys}
                label={section.label}
                values={odds}
                max={100}
                step={0.1}
                share={() => "%"}
                onChange={(v) => set(v as never)}
              />
              <p
                className={`text-xs ${left < 0 ? "text-red-500" : "text-fd-muted-foreground"}`}
              >
                {left < 0
                  ? `These add up to ${percent(100 - left)}: lower them to 100% or less.`
                  : `No edition: ${percent(left)}`}
              </p>
            </>
          );
        } else {
          const table =
            section.type === "chance"
              ? (value as { chance: number; weights: Record<string, number> })
              : null;
          const weights = table
            ? table.weights
            : (value as Record<string, number>);
          const total = section.keys.reduce((sum, k) => sum + weights[k], 0);
          body = (
            <>
              {table && (
                <label className="grid grid-cols-[1fr_auto_3.5rem] items-center gap-2 text-sm sm:max-w-[calc(50%-0.75rem)]">
                  Chance of {section.what}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={table.chance}
                    onChange={(e) =>
                      set({
                        ...table,
                        chance: Math.min(
                          100,
                          Math.max(0, Number(e.target.value) || 0),
                        ),
                      } as never)
                    }
                    className={numberInput}
                  />
                  <span className="text-right text-xs text-fd-muted-foreground">
                    %
                  </span>
                </label>
              )}
              {table && (
                <p className="text-xs text-fd-muted-foreground">
                  Then which one, by weight:
                </p>
              )}
              <NumberTable
                keys={section.keys}
                label={section.label}
                values={weights}
                max={100}
                step={1}
                share={(v) => (total ? percent((v / total) * 100) : "—")}
                onChange={(v) =>
                  set((table ? { ...table, weights: v } : v) as never)
                }
              />
            </>
          );
        }
        return (
          <fieldset key={section.key} className="flex flex-col gap-2">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <legend className="text-sm font-semibold">{section.title}</legend>
              <button
                type="button"
                disabled={same(value, DEFAULT_CHANCES[section.key])}
                onClick={() => set(DEFAULT_CHANCES[section.key])}
                className="text-xs text-fd-muted-foreground underline underline-offset-2 hover:text-fd-foreground disabled:no-underline disabled:opacity-50"
              >
                Reset to game odds
              </button>
            </span>
            <p className="text-xs text-fd-muted-foreground">{section.hint}</p>
            {body}
          </fieldset>
        );
      })}
    </div>
  );
}

/** True when the settings can be saved (edition tables at most 100%). */
export function chancesValid(chances: FallingChances) {
  return [chances.jokerEdition, chances.cardEdition].every(
    (odds) => EDITIONS.reduce((sum, e) => sum + odds[e], 0) <= 100,
  );
}

/**
 * Every setting of the falling cards except turning them on, in two tabs: the look and motion,
 * and the spawn chances. Used for the home page background and for overlays.
 */
export function FallingControls({
  settings,
  onChange,
  catalog,
}: {
  settings: FallingSettings;
  onChange: (settings: FallingSettings) => void;
  /** Everything that can show up, for the blacklist. */
  catalog: FallingCatalogEntry[];
}) {
  const [tab, setTab] = useState<"look" | "chances">("look");
  const totalWeight = FALLING_KINDS.reduce(
    (sum, k) => sum + settings.weights[k],
    0,
  );
  const set = (patch: Partial<FallingSettings>) =>
    onChange({ ...settings, ...patch });
  const tabClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-fd-accent text-fd-accent-foreground" : "text-fd-muted-foreground hover:text-fd-foreground"}`;

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" className="flex gap-1 border-b pb-2">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "look"}
          onClick={() => setTab("look")}
          className={tabClass(tab === "look")}
        >
          Cards and motion
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "chances"}
          onClick={() => setTab("chances")}
          className={tabClass(tab === "chances")}
        >
          Spawn chances (advanced)
        </button>
      </div>

      {tab === "chances" ? (
        <Chances
          chances={settings.chances}
          onChange={(chances) => set({ chances })}
        />
      ) : (
        <>
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
                  shop. Playing cards always get enhancements, seals and
                  editions as often as from a Standard pack. Both can be changed
                  under Spawn chances.
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
            <legend className="mb-1 text-sm font-semibold">
              Motion and look
            </legend>
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
            <p className="text-xs text-fd-muted-foreground">
              Cards block each other completely (see-through ones like Glass
              excepted), bigger ones in front; the opacity fades the background
              as a whole.
            </p>
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
                  Cards are spread out in depth: further ones are smaller and
                  fall slower.
                </span>
              </span>
            </label>
            <label
              className={`flex items-start gap-2 text-sm ${settings.depth ? "" : "opacity-50"}`}
            >
              <input
                type="checkbox"
                checked={settings.depthFade}
                disabled={!settings.depth}
                onChange={(e) => set({ depthFade: e.target.checked })}
                className="mt-1"
              />
              <span>
                Depth fades cards
                <span className="block text-xs text-fd-muted-foreground">
                  Further cards are also fainter, while still hiding the cards
                  behind them.
                </span>
              </span>
            </label>
          </fieldset>
        </>
      )}
    </div>
  );
}
