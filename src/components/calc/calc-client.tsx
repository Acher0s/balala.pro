"use client";

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

interface CalcState {
  values: Values;
  setValue: (name: string, value: number) => void;
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
  children,
}: {
  id?: string;
  title?: string;
  defaults: Values;
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

  const state = useMemo<CalcState>(
    () => ({
      values,
      setValue: (name, value) => {
        setValues((v) => ({ ...v, [name]: value }));
        setCopied(false);
      },
    }),
    [values],
  );

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
        className="not-prose my-6 rounded-xl border bg-fd-card p-4 shadow-sm"
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
        <div className="grid gap-3 sm:grid-cols-2">{children}</div>
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
