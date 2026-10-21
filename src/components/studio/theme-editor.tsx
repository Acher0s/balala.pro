"use client";

import { Callout } from "fumadocs-ui/components/callout";
import type { CSSProperties } from "react";
import { useState } from "react";
import { saveSiteTheme } from "@/app/studio/actions";
import { Calc, Input, Output } from "@/components/calc";
import {
  ErrorText,
  primaryButton,
  secondaryButton,
  useAction,
} from "@/components/studio/forms";
import {
  COLOR_LABELS,
  PRESETS,
  radiusVars,
  type SiteTheme,
  type ThemeColors,
  type ThemeMode,
  themeVars,
} from "@/lib/theme";

/** Studio → Style: try presets and colours on a live preview, then save them for the whole site. */
export function ThemeEditor({ saved }: { saved: SiteTheme }) {
  const [theme, setTheme] = useState<SiteTheme>(saved);
  const [mode, setMode] = useState<ThemeMode>("dark");
  const [done, setDone] = useState(false);
  const { pending, error, run } = useAction();
  const changed = JSON.stringify(theme) !== JSON.stringify(saved);

  const update = (next: SiteTheme) => {
    setTheme(next);
    setDone(false);
  };
  const setColor = (key: keyof ThemeColors, value: string) =>
    update({ ...theme, [mode]: { ...theme[mode], [key]: value } });

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[22rem_1fr]">
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Start from a preset</h2>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => update(p.theme)}
                aria-pressed={theme.preset === p.id}
                className="flex flex-col gap-2 rounded-lg border p-2 text-left text-sm hover:bg-fd-accent aria-pressed:border-fd-primary aria-pressed:ring-1 aria-pressed:ring-fd-primary"
              >
                <span className="flex overflow-hidden rounded">
                  {(["background", "card", "accent"] as const).map((k) => (
                    <span
                      key={k}
                      className="h-5 flex-1"
                      style={{ background: p.theme.dark[k] }}
                    />
                  ))}
                  {(["background", "card", "accent"] as const).map((k) => (
                    <span
                      key={`l-${k}`}
                      className="h-5 flex-1"
                      style={{ background: p.theme.light[k] }}
                    />
                  ))}
                </span>
                {p.name}
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Colours</h2>
            <ModeSwitch mode={mode} onChange={setMode} />
          </div>
          <p className="text-xs text-fd-muted-foreground">
            Light and dark mode each have their own colours. Visitors get the
            one their device prefers, or pick it with the sun/moon button.
          </p>
          <div className="flex flex-col gap-1.5">
            {(Object.keys(COLOR_LABELS) as (keyof ThemeColors)[]).map((key) => (
              <label
                key={key}
                className="flex items-center justify-between gap-3 text-sm"
              >
                {COLOR_LABELS[key]}
                <span className="flex items-center gap-2">
                  {/* Typed codes apply once complete; picking a colour refreshes the field. */}
                  <input
                    key={`${mode}-${theme[mode][key]}`}
                    type="text"
                    defaultValue={theme[mode][key]}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      if (/^#[0-9a-f]{6}$/i.test(v))
                        setColor(key, v.toLowerCase());
                    }}
                    aria-label={`${COLOR_LABELS[key]} (hex)`}
                    className="w-20 rounded-md border bg-fd-background px-2 py-1 font-mono text-xs"
                  />
                  <input
                    type="color"
                    value={theme[mode][key]}
                    onChange={(e) => setColor(key, e.target.value)}
                    aria-label={COLOR_LABELS[key]}
                    className="h-8 w-10 cursor-pointer rounded-md border bg-transparent"
                  />
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Shape and type</h2>
          <label className="flex flex-col gap-1 text-sm">
            <span className="flex justify-between">
              Roundness
              <span className="text-fd-muted-foreground">
                {theme.roundness === 0
                  ? "Square"
                  : `${Math.round(theme.roundness * 100)}%`}
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.25}
              value={theme.roundness}
              onChange={(e) =>
                update({ ...theme, roundness: Number(e.target.value) })
              }
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            Heading font
            <select
              value={theme.headingFont}
              onChange={(e) =>
                update({
                  ...theme,
                  headingFont: e.target.value as SiteTheme["headingFont"],
                })
              }
              className="rounded-md border bg-fd-background px-2 py-1"
            >
              <option value="default">Same as the text</option>
              <option value="pixel">Pixel</option>
            </select>
          </label>
        </section>

        <ErrorText error={error} />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending || !changed}
            onClick={() =>
              run(
                () => saveSiteTheme(theme),
                () => setDone(true),
              )
            }
            className={primaryButton}
          >
            {pending ? "Saving…" : "Save for the whole site"}
          </button>
          <button
            type="button"
            disabled={!changed}
            onClick={() => update(saved)}
            className={secondaryButton}
          >
            Undo changes
          </button>
          {done && !changed && (
            <span className="text-sm text-fd-muted-foreground">
              Saved. Every page uses it now.
            </span>
          )}
        </div>
      </div>

      <Preview theme={theme} mode={mode} />
    </div>
  );
}

function ModeSwitch({
  mode,
  onChange,
}: {
  mode: ThemeMode;
  onChange: (m: ThemeMode) => void;
}) {
  return (
    <div className="flex rounded-md border p-0.5 text-xs">
      {(["light", "dark"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          className="rounded px-2 py-0.5 capitalize aria-pressed:bg-fd-primary aria-pressed:text-fd-primary-foreground"
        >
          {m}
        </button>
      ))}
    </div>
  );
}

/**
 * A sample page in the theme being edited. The colours are set on this box only, so the rest of
 * the studio keeps the saved theme until you save.
 */
function Preview({ theme, mode }: { theme: SiteTheme; mode: ThemeMode }) {
  const style = {
    ...themeVars(theme[mode]),
    ...radiusVars(theme.roundness),
  } as CSSProperties;
  const heading =
    theme.headingFont === "pixel"
      ? "[&_:is(h1,h2,h3,h4)]:font-[family-name:var(--font-pixel)]"
      : "";
  return (
    <div className="sticky top-4 flex flex-col gap-2">
      <span className="text-xs text-fd-muted-foreground">
        Preview ({mode} mode)
      </span>
      <div
        style={style}
        className={`${mode === "dark" ? "dark" : ""} ${heading} rounded-xl border bg-fd-background p-6 text-fd-foreground`}
      >
        <h1 className="text-2xl font-semibold">Reserved Parking guide</h1>
        <p className="mt-1 text-fd-muted-foreground">
          Fill your hand with face cards and cash in every hand.
        </p>
        <div className="mt-3 flex gap-1.5 border-b pb-4">
          {["econ", "jokers"].map((t) => (
            <span
              key={t}
              className="rounded-full border px-2 py-0.5 text-xs text-fd-muted-foreground"
            >
              {t}
            </span>
          ))}
        </div>
        <h2 className="mt-5 text-xl font-semibold">How to play</h2>
        <p className="mt-2 text-sm leading-relaxed">
          Play as many high cards as you can, and read the{" "}
          <a href="#preview" className="font-medium text-fd-primary underline">
            money calculator
          </a>{" "}
          to see what it earns.
        </p>
        <div className="mt-4">
          <Callout type="info" title="Tip">
            Discard first with Reserved Parking.
          </Callout>
        </div>
        <Calc title="Interest">
          <Input name="money" label="Money" default={25} min={0} />
          <Input name="cap" label="Interest cap" default={5} min={0} />
          <Output
            label="Interest"
            value="min(floor(money / 5), cap)"
            format="money"
            decimals={0}
          />
        </Calc>
        <div className="grid gap-2 sm:grid-cols-3">
          {["Guides", "Tier lists", "Tools"].map((t) => (
            <div
              key={t}
              className="rounded-xl border bg-fd-card p-3 text-sm font-semibold transition-colors hover:bg-fd-accent"
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
