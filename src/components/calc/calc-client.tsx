"use client";

import { Check, Lock } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { formatValue, type ValueFormat } from "@/lib/format";
import { compile } from "@/lib/formula";

type Values = Record<string, number>;

/**
 * How a <Toggle> relates to the others: turning it on also turns on the one it `requires`
 * (a Tycoon needs its Merchant); turning that one off turns this off. While its `forced` formula
 * is true it counts as on and can't be changed (Zodiac Deck starts with both Merchants).
 */
export interface ToggleRule {
  name: string;
  requires?: string;
  forced?: string;
}

interface CalcState {
  /** What formulas see: the inputs, with forced toggles on. */
  values: Values;
  /** The same for the starting values, for comparing against (<Bands compare>). */
  baseline: Values;
  /** Toggles that are on because their `forced` formula is true. */
  forcedOn: Set<string>;
  setValue: (name: string, value: number) => void;
  setToggle: (name: string, on: boolean) => void;
}

/** Inputs as the formulas see them: every toggle whose `forced` formula holds counts as on. */
function withForced(values: Values, rules: ToggleRule[]) {
  const forcedOn = new Set<string>();
  for (const rule of rules) {
    if (!rule.forced) continue;
    try {
      if (compile(rule.forced).evaluate(values)) forcedOn.add(rule.name);
    } catch {
      // A formula that can't be worked out yet (an empty field) forces nothing.
    }
  }
  const out = { ...values };
  for (const name of forcedOn) out[name] = 1;
  return { values: out, forcedOn };
}

const CalcContext = createContext<CalcState | null>(null);

function useCalc(component: string): CalcState {
  const ctx = useContext(CalcContext);
  if (!ctx)
    throw new Error(`<${component}> must be placed inside a <Calc> block`);
  return ctx;
}

function paramKey(id: string, name: string) {
  return `${id}.${name}`;
}

export function CalcProvider({
  id,
  title,
  defaults,
  toggles = [],
  children,
}: {
  id?: string;
  title?: string;
  defaults: Values;
  toggles?: ToggleRule[];
  children: ReactNode;
}) {
  const [values, setValues] = useState<Values>(defaults);
  const [copied, setCopied] = useState(false);

  // Restore inputs from a shared link, e.g. ?ev.P=3&ev.R=2
  useEffect(() => {
    if (!id) return;
    const params = new URLSearchParams(window.location.search);
    const restored: Values = {};
    for (const name of Object.keys(defaults)) {
      const raw = params.get(paramKey(id, name));
      if (raw !== null && raw !== "" && Number.isFinite(Number(raw)))
        restored[name] = Number(raw);
    }
    if (Object.keys(restored).length > 0)
      setValues((v) => ({ ...v, ...restored }));
  }, [id, defaults]);

  const state = useMemo<CalcState>(() => {
    const current = withForced(values, toggles);
    return {
      values: current.values,
      baseline: withForced(defaults, toggles).values,
      forcedOn: current.forcedOn,
      setValue: (name, value) => {
        setValues((v) => ({ ...v, [name]: value }));
        setCopied(false);
      },
      setToggle: (name, on) => {
        setValues((v) => {
          const next = { ...v, [name]: on ? 1 : 0 };
          if (on) {
            // Turn on what it needs, and what that needs.
            const seen = new Set([name]);
            let need = toggles.find((t) => t.name === name)?.requires;
            while (need && !seen.has(need)) {
              seen.add(need);
              next[need] = 1;
              need = toggles.find((t) => t.name === need)?.requires;
            }
          } else {
            // Turn off everything that needs it, and what needs those.
            let changed = true;
            while (changed) {
              changed = false;
              for (const t of toggles)
                if (t.requires && next[t.name] && !next[t.requires]) {
                  next[t.name] = 0;
                  changed = true;
                }
            }
          }
          return next;
        });
        setCopied(false);
      },
    };
  }, [values, defaults, toggles]);

  function shareUrl() {
    const url = new URL(window.location.href);
    for (const [name, value] of Object.entries(values)) {
      const key = paramKey(id as string, name);
      if (value === defaults[name]) url.searchParams.delete(key);
      else url.searchParams.set(key, String(value));
    }
    if (id) url.hash = id;
    return url.toString();
  }

  return (
    <CalcContext.Provider value={state}>
      <section
        id={id}
        className="not-prose @container my-6 rounded-xl border bg-fd-card p-4 shadow-sm"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-semibold">{title ?? "Calculator"}</h4>
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              className="rounded-md border px-2 py-1 hover:bg-fd-accent"
              onClick={() => setValues(defaults)}
            >
              Reset
            </button>
            {id && (
              <button
                type="button"
                className="rounded-md border px-2 py-1 hover:bg-fd-accent"
                onClick={async () => {
                  const url = shareUrl();
                  window.history.replaceState(null, "", url);
                  try {
                    await navigator.clipboard.writeText(url);
                    setCopied(true);
                  } catch {
                    // Clipboard can be blocked; the URL bar still holds the link.
                  }
                }}
              >
                {copied ? "Link copied" : "Copy link"}
              </button>
            )}
          </div>
        </div>
        {/* Two per row when the calculator itself is wide enough, e.g. not inside <Columns>. */}
        <div className="grid gap-3 @md:grid-cols-2">{children}</div>
      </section>
    </CalcContext.Provider>
  );
}

export interface InputOption {
  label: string;
  value: number;
}

export interface InputProps {
  name: string;
  label: string;
  default: number;
  min?: number;
  max?: number;
  step?: number;
  /** Renders a dropdown instead of a number field. */
  options?: InputOption[];
  hint?: string;
}

export function Input({
  name,
  label,
  min,
  max,
  step = 1,
  options,
  hint,
}: InputProps) {
  const { values, setValue } = useCalc("Input");
  const value = values[name];
  const fieldId = `calc-input-${name}`;
  const fieldClass =
    "w-full rounded-md border bg-fd-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-fd-primary";

  return (
    <label
      htmlFor={fieldId}
      className="flex flex-col gap-1 rounded-lg bg-fd-secondary/50 p-3 text-sm"
    >
      <span className="font-medium">
        {label} <code className="text-xs text-fd-muted-foreground">{name}</code>
      </span>
      {options ? (
        <select
          id={fieldId}
          className={fieldClass}
          value={value}
          onChange={(e) => setValue(name, Number(e.target.value))}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={fieldId}
          type="number"
          inputMode="decimal"
          className={fieldClass}
          value={Number.isFinite(value) ? value : ""}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            if (e.target.value === "") return setValue(name, Number.NaN);
            let next = Number(e.target.value);
            if (min !== undefined) next = Math.max(min, next);
            if (max !== undefined) next = Math.min(max, next);
            setValue(name, next);
          }}
        />
      )}
      {hint && <span className="text-xs text-fd-muted-foreground">{hint}</span>}
    </label>
  );
}

export interface OutputProps {
  label: string;
  /** A formula over the block's inputs, e.g. "P * R / 2". */
  value: string;
  format?: ValueFormat;
  decimals?: number;
  hint?: string;
}

export function Output({ label, value, format, decimals, hint }: OutputProps) {
  const { values } = useCalc("Output");
  const formula = useMemo(() => compile(value), [value]);
  const [showFormula, setShowFormula] = useState(false);

  let result: string;
  try {
    result = formatValue(formula.evaluate(values), format, decimals);
  } catch {
    result = "—";
  }

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-fd-primary/30 bg-fd-primary/5 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium">{label}</span>
        <button
          type="button"
          className="rounded px-1 font-mono text-xs text-fd-muted-foreground hover:bg-fd-accent"
          aria-expanded={showFormula}
          title="Show formula"
          onClick={() => setShowFormula((s) => !s)}
        >
          ƒx
        </button>
      </div>
      <output className="text-2xl font-bold tabular-nums" aria-live="polite">
        {result}
      </output>
      {showFormula && (
        <code className="break-all text-xs text-fd-muted-foreground">
          {value}
        </code>
      )}
      {hint && <span className="text-xs text-fd-muted-foreground">{hint}</span>}
    </div>
  );
}

/**
 * A card that's either on or off (1 or 0 in formulas), e.g. a voucher you've bought. Off it's
 * greyed out like an unbought voucher in the game; on it's in full colour with a ring and a
 * check mark. Forced-on toggles show a lock and say why.
 */
export function ToggleTile({
  name,
  label,
  image,
  forcedHint,
  hint,
}: {
  name: string;
  label: string;
  image: string;
  forcedHint?: string;
  hint?: string;
}) {
  const { values, forcedOn, setToggle } = useCalc("Toggle");
  const on = Boolean(values[name]);
  const locked = forcedOn.has(name);
  const title = locked
    ? forcedHint
    : on
      ? `${label}: on. Click to turn off.`
      : `${label}: off. Click to turn on.`;

  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={locked}
      title={title}
      onClick={() => setToggle(name, !on)}
      // On: the game's orange (attention) border and check, so it reads at a glance whatever
      // the card's colours; off: a dashed outline and a faded, grey card.
      className={`relative flex w-24 flex-col items-center gap-1 rounded-lg border-2 p-1.5 text-center text-xs leading-tight transition ${
        on
          ? "border-[#ff9a00] bg-[#ff9a00]/15 font-semibold"
          : "border-dashed text-fd-muted-foreground hover:border-fd-muted-foreground hover:bg-fd-accent"
      } ${locked ? "cursor-default" : ""}`}
    >
      {/* biome-ignore lint/performance/noImgElement: small pixel-art card */}
      <img
        src={image}
        alt=""
        className={`h-[95px] w-[71px] transition ${on ? "" : "opacity-35 grayscale"}`}
        style={{ imageRendering: "pixelated" }}
      />
      {on && (
        <span
          aria-hidden
          className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-[#ff9a00] text-white shadow"
        >
          {locked ? (
            <Lock className="size-3" />
          ) : (
            <Check className="size-3.5" />
          )}
        </span>
      )}
      <span>{label}</span>
      {locked && forcedHint && (
        <span className="text-[10px] font-normal text-fd-muted-foreground">
          {forcedHint}
        </span>
      )}
      {hint && !locked && (
        <span className="text-[10px] font-normal text-fd-muted-foreground">
          {hint}
        </span>
      )}
    </button>
  );
}

/** "Bought: Tarot Merchant, Magic Trick", listing the toggles that are on. */
export function ToggleSummary({
  prefix,
  toggles,
}: {
  prefix: string;
  toggles: { name: string; label: string }[];
}) {
  const { values } = useCalc("Toggles");
  const on = toggles.filter((t) => values[t.name]).map((t) => t.label);
  return (
    <p className="text-sm">
      <span className="font-medium">{prefix}:</span>{" "}
      <span className={on.length ? "" : "text-fd-muted-foreground"}>
        {on.length ? on.join(", ") : "nothing"}
      </span>
    </p>
  );
}

export interface BandProps {
  label: string;
  /** A formula for this band's weight; bands share 0 to 100% in proportion. */
  value: string;
  /** A game colour name (tarot, planet, spectral, attention, inactive…) or a #hex colour. */
  colour: string;
}

function shares(bands: BandProps[], values: Values) {
  const weights = bands.map((b) => {
    try {
      const v = compile(b.value).evaluate(values);
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch {
      return 0;
    }
  });
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (total ? w / total : 0));
}

const pct = (x: number) => `${(x * 100).toFixed(1).replace(/\.0$/, "")}%`;

/** One bar of bands, each as wide as its share; the roll range shows on hover. */
function BandBar({
  bands,
  share,
  faded,
}: {
  bands: BandProps[];
  share: number[];
  faded?: boolean;
}) {
  let from = 0;
  return (
    <div
      className={`flex h-9 overflow-hidden rounded-lg border ${faded ? "opacity-50" : ""}`}
    >
      {bands.map((b, i) => {
        const start = from;
        from += share[i];
        if (!share[i]) return null;
        return (
          <div
            key={b.label}
            title={`${b.label}: ${pct(share[i])} (rolls ${start.toFixed(3)} – ${from.toFixed(3)})`}
            className="flex items-center justify-center overflow-hidden text-xs font-semibold whitespace-nowrap text-white transition-[flex-grow] duration-300 [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]"
            style={{ flexGrow: share[i], background: b.colour }}
          >
            {share[i] >= 0.1 ? `${b.label} ${pct(share[i])}` : ""}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Splits 100% into bands by weight, like the game splitting one random roll between card types:
 * a bar of bands, and the chance of each with its change from the starting values (`compare`).
 */
export function BandsView({
  label,
  compare,
  bands,
}: {
  label?: string;
  /** Label for a faded bar of the starting values above the current one. */
  compare?: string;
  bands: BandProps[];
}) {
  const { values, baseline } = useCalc("Bands");
  const now = shares(bands, values);
  const before = shares(bands, baseline);
  const shown = bands
    .map((b, i) => ({
      b,
      now: now[i],
      diff: now[i] - before[i],
      was: before[i],
    }))
    .filter((x) => x.now > 0 || (compare && x.was > 0));

  return (
    <div className="col-span-full flex flex-col gap-2">
      {compare && (
        <>
          <span className="text-xs text-fd-muted-foreground">{compare}</span>
          <BandBar bands={bands} share={before} faded />
        </>
      )}
      {(label || compare) && (
        <span className="text-xs text-fd-muted-foreground">
          {label ?? "Now"}
        </span>
      )}
      <BandBar bands={bands} share={now} />
      <div className="mt-1 grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-2">
        {shown.map(({ b, now, diff }) => (
          <div key={b.label} className="rounded-lg bg-fd-secondary/50 p-2.5">
            <span className="flex items-center gap-1.5 text-xs text-fd-muted-foreground">
              <span
                aria-hidden
                className="size-2.5 rounded-sm"
                style={{ background: b.colour }}
              />
              {b.label}
            </span>
            <output className="block text-xl font-bold tabular-nums">
              {pct(now)}
            </output>
            {compare && (
              <span
                className={`text-xs tabular-nums ${
                  Math.abs(diff) < 0.0005
                    ? "text-fd-muted-foreground"
                    : diff > 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                }`}
              >
                {Math.abs(diff) < 0.0005
                  ? "no change"
                  : `${diff > 0 ? "+" : "−"}${(Math.abs(diff) * 100).toFixed(1)} pts`}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Shows its content only while `when` is true, e.g. a note that only matters with a voucher. */
export function Show({
  when,
  children,
}: {
  when: string;
  children: ReactNode;
}) {
  const { values } = useCalc("Show");
  let visible = false;
  try {
    visible = Boolean(compile(when).evaluate(values));
  } catch {
    visible = false;
  }
  return visible ? (
    <div className="col-span-full text-sm">{children}</div>
  ) : null;
}
