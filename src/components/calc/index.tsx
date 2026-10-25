import { ChevronRight } from "lucide-react";
import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { COLOURS } from "@/components/effect-text";
import { findItem, type ItemKind } from "@/data/game";
import { formatValue, type ValueFormat } from "@/lib/format";
import { assertKnownVariables, compile } from "@/lib/formula";
import {
  type BandProps,
  BandsView,
  CalcProvider,
  Input,
  type InputProps,
  Output,
  type OutputProps,
  Show,
  type ToggleRule,
  ToggleSummary,
  ToggleTile,
} from "./calc-client";

export { Input, Output, Show };

interface ToggleProps {
  name: string;
  /** The card it shows, like a page icon: "voucher:tarot_merchant". */
  card: string;
  /** Defaults to the card's name. */
  label?: string;
  /** 1 to start on; 0 (off) by default. */
  default?: number;
  /** The toggle it needs, by name: turning this on turns that on too. */
  requires?: string;
  /** While this formula is true the toggle is on and locked, e.g. forced="deck = 3". */
  forced?: string;
  /** Why it's locked on, e.g. "From Zodiac Deck". */
  forcedHint?: string;
  hint?: string;
}

/** A formula used somewhere in the block, and where, for error messages. */
interface UsedFormula {
  formula: string;
  where: string;
}

/** Finds every input and formula inside the block, however deeply MDX nested them. */
function collect(
  children: ReactNode,
  inputs: InputProps[],
  toggles: ToggleProps[],
  formulas: UsedFormula[],
) {
  Children.forEach(children, (child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return;
    const props = child.props as Record<string, unknown>;
    if (child.type === Input) inputs.push(props as unknown as InputProps);
    else if (child.type === Output) {
      const o = props as unknown as OutputProps;
      formulas.push({ formula: o.value, where: `output "${o.label}"` });
    } else if (child.type === Toggle) {
      const t = props as unknown as ToggleProps;
      toggles.push(t);
      if (t.forced)
        formulas.push({
          formula: t.forced,
          where: `toggle "${t.name}" forced`,
        });
    } else if (child.type === Band) {
      const b = props as unknown as BandProps;
      formulas.push({ formula: b.value, where: `band "${b.label}"` });
    } else {
      if (child.type === Show)
        formulas.push({ formula: String(props.when), where: "<Show when>" });
      collect(child.props.children, inputs, toggles, formulas);
    }
  });
}

/**
 * An interactive calculator block. Inputs and outputs are checked while the site builds,
 * so a typo in a formula fails the build instead of showing a broken calculator.
 */
export function Calc({
  id,
  title,
  children,
}: {
  id?: string;
  title?: string;
  children: ReactNode;
}) {
  const inputs: InputProps[] = [];
  const toggles: ToggleProps[] = [];
  const formulas: UsedFormula[] = [];
  collect(children, inputs, toggles, formulas);

  const context = `<Calc${title ? ` title="${title}"` : ""}>`;
  const defaults: Record<string, number> = {};
  for (const input of inputs) {
    if (input.name in defaults)
      throw new Error(`${context}: duplicate input "${input.name}"`);
    if (typeof input.default !== "number")
      throw new Error(
        `${context}: input "${input.name}" needs a numeric default`,
      );
    defaults[input.name] = input.default;
  }
  for (const toggle of toggles) {
    if (toggle.name in defaults)
      throw new Error(`${context}: duplicate input "${toggle.name}"`);
    defaults[toggle.name] = toggle.default ? 1 : 0;
  }
  for (const toggle of toggles)
    if (toggle.requires && !toggles.some((t) => t.name === toggle.requires))
      throw new Error(
        `${context}: toggle "${toggle.name}" requires "${toggle.requires}", which isn't a toggle here`,
      );
  for (const { formula: source, where } of formulas) {
    const formula = compile(source);
    assertKnownVariables(formula, Object.keys(defaults), `${context} ${where}`);
    formula.evaluate(defaults);
  }
  const rules: ToggleRule[] = toggles.map(({ name, requires, forced }) => ({
    name,
    requires,
    forced,
  }));

  return (
    <CalcProvider id={id} title={title} defaults={defaults} toggles={rules}>
      {children}
    </CalcProvider>
  );
}

/**
 * A titled group inside a calculator, e.g. the inputs under "Your hand" and the outputs under
 * "Results". It takes a full row and lays out its own inputs and outputs, two per row when there's
 * room. Sections after the first get a divider above them.
 */
export function Section({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="col-span-full flex flex-col gap-2 [&+&]:mt-1 [&+&]:border-t [&+&]:pt-4">
      {title && (
        <h5 className="text-xs font-semibold uppercase tracking-wide text-fd-muted-foreground">
          {title}
        </h5>
      )}
      <div className="grid gap-3 @md:grid-cols-2">{children}</div>
    </div>
  );
}

/**
 * A number computed from a formula at build time, for use inside prose:
 * <Value of="P * R / 2" vars={{ P: 3, R: 2 }} format="money" />
 */
export function Value({
  of,
  vars = {},
  format,
  decimals,
}: {
  of: string;
  vars?: Record<string, number>;
  format?: ValueFormat;
  decimals?: number;
}) {
  const formula = compile(of);
  assertKnownVariables(formula, Object.keys(vars), "<Value>");
  return (
    <strong className="tabular-nums">
      {formatValue(formula.evaluate(vars), format, decimals)}
    </strong>
  );
}

interface Axis {
  /** Variable name used in the formula. */
  name: string;
  label: string;
  from: number;
  to: number;
  step?: number;
}

function range({ from, to, step = 1 }: Axis) {
  const out: number[] = [];
  for (let v = from; v <= to; v += step) out.push(v);
  return out;
}

/** A table generated from a formula over two variables, so nobody types the numbers in by hand. */
export function CalcTable({
  value,
  rows,
  cols,
  format,
  decimals,
  caption,
}: {
  value: string;
  rows: Axis;
  cols: Axis;
  format?: ValueFormat;
  decimals?: number;
  caption?: string;
}) {
  const formula = compile(value);
  assertKnownVariables(formula, [rows.name, cols.name], "<CalcTable>");
  const colValues = range(cols);

  return (
    <div className="not-prose my-6 overflow-x-auto rounded-xl border">
      <table className="w-full border-collapse text-sm tabular-nums">
        {caption && (
          <caption className="p-2 text-left text-fd-muted-foreground">
            {caption}
          </caption>
        )}
        <thead>
          <tr className="bg-fd-secondary">
            <th
              scope="col"
              className="p-2 text-left text-xs font-medium text-fd-muted-foreground"
            >
              {rows.label} ↓ / {cols.label} →
            </th>
            {colValues.map((c) => (
              <th key={c} scope="col" className="p-2 text-right font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {range(rows).map((r) => (
            <tr key={r} className="border-t">
              <th
                scope="row"
                className="bg-fd-secondary/50 p-2 text-left font-semibold"
              >
                {r}
              </th>
              {colValues.map((c) => (
                <td key={c} className="p-2 text-right">
                  {formatValue(
                    formula.evaluate({ [rows.name]: r, [cols.name]: c }),
                    format,
                    decimals ?? 2,
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t px-2 py-1.5 font-mono text-xs text-fd-muted-foreground">
        ƒx {value}
      </p>
    </div>
  );
}

/** The game card a toggle shows ("voucher:tarot_merchant"); unknown cards fail the build. */
function toggleCard(card: string) {
  const m = /^(\w+):(.+)$/.exec(card.trim());
  const item = m && findItem(m[1] as ItemKind, m[2]);
  if (!item)
    throw new Error(
      `<Toggle card="${card}">: unknown card. Write it like voucher:tarot_merchant`,
    );
  return item;
}

/**
 * A card that's on or off, 1 or 0 in formulas, shown as its picture: greyed out when off, in
 * full colour with a check mark when on. <Toggle name="tm" card="voucher:tarot_merchant" />
 */
export function Toggle(props: ToggleProps) {
  const item = toggleCard(props.card);
  return (
    <ToggleTile
      name={props.name}
      label={props.label ?? item.name}
      image={item.image}
      forcedHint={props.forcedHint}
      hint={props.hint}
    />
  );
}

/**
 * A row of <Toggle>s. A toggle that requires the one before it gets an arrow in between, so
 * upgrade chains read left to right (Tarot Merchant → Tarot Tycoon). With `summary`, a line
 * below lists the toggles that are on: summary="Bought" → "Bought: Tarot Merchant".
 */
export function Toggles({
  summary,
  children,
}: {
  summary?: string;
  children: ReactNode;
}) {
  const items = Children.toArray(children).filter(isValidElement);
  const toggles = items
    .filter((c) => c.type === Toggle)
    .map((c) => c.props as ToggleProps);
  const labelOf = (t: ToggleProps) => t.label ?? toggleCard(t.card).name;
  // Upgrade chains: a toggle that requires the one before it joins that one's group.
  const chains: (typeof items)[] = [];
  let previous: ToggleProps | undefined;
  for (const child of items) {
    const t = child.type === Toggle ? (child.props as ToggleProps) : undefined;
    if (t?.requires && previous?.name === t.requires)
      chains[chains.length - 1].push(child);
    else chains.push([child]);
    previous = t;
  }
  return (
    <div className="col-span-full flex flex-col gap-2">
      {/* Chains wrap as a whole, so an arrow never ends a line. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {chains.map((chain, c) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: the order of chains is fixed
            key={c}
            className="flex items-center gap-1"
          >
            {chain.map((child, i) => (
              <Fragment key={child.key ?? i}>
                {i > 0 && (
                  <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 text-fd-muted-foreground"
                  />
                )}
                {child}
              </Fragment>
            ))}
          </div>
        ))}
      </div>
      {summary && (
        <ToggleSummary
          prefix={summary}
          toggles={toggles.map((t) => ({ name: t.name, label: labelOf(t) }))}
        />
      )}
    </div>
  );
}

/** One band of a <Bands> chart; it draws nothing itself. */
export function Band(_props: Omit<BandProps, "colour"> & { colour?: string }) {
  return null;
}

/** Distinct colours for bands without one. */
const BAND_COLOURS = [
  "#ff9a00",
  "#a782d1",
  "#13afce",
  "#9a9a9a",
  "#4584fa",
  "#4bc292",
];

/**
 * Splits 100% between bands by their weights, like the game splitting one random roll between
 * card types, as a bar and a chance per band. With `compare`, a faded bar above shows the
 * starting values.
 *
 *   <Bands compare="Without vouchers">
 *     <Band label="Joker" value="20" colour="attention" />
 *     <Band label="Tarot" value="if(tt, 32, if(tm, 9.6, 4))" colour="tarot" />
 *   </Bands>
 */
export function Bands({
  label,
  compare,
  children,
}: {
  label?: string;
  compare?: string;
  children: ReactNode;
}) {
  const bands: BandProps[] = Children.toArray(children)
    .filter(isValidElement)
    .filter((c) => c.type === Band)
    .map((c, i) => {
      const b = c.props as Omit<BandProps, "colour"> & { colour?: string };
      const colour = b.colour
        ? (COLOURS[b.colour] ??
          (/^#[0-9a-f]{3,8}$/i.test(b.colour) ? b.colour : undefined))
        : BAND_COLOURS[i % BAND_COLOURS.length];
      if (!colour)
        throw new Error(
          `<Band label="${b.label}">: unknown colour "${b.colour}". Use a game colour like tarot, planet or spectral, or a #hex colour.`,
        );
      return { label: b.label, value: b.value, colour };
    });
  if (bands.length === 0) throw new Error("<Bands> needs at least one <Band>");
  return <BandsView label={label} compare={compare} bands={bands} />;
}
