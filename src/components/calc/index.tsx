import { Children, isValidElement, type ReactNode } from "react";
import { formatValue, type ValueFormat } from "@/lib/format";
import { assertKnownVariables, compile } from "@/lib/formula";
import {
  CalcProvider,
  Input,
  type InputProps,
  Output,
  type OutputProps,
} from "./calc-client";

export { Input, Output };

/** Finds every <Input>/<Output> inside the block, however deeply MDX nested them. */
function collect(
  children: ReactNode,
  inputs: InputProps[],
  outputs: OutputProps[],
) {
  Children.forEach(children, (child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return;
    if (child.type === Input) inputs.push(child.props as unknown as InputProps);
    else if (child.type === Output)
      outputs.push(child.props as unknown as OutputProps);
    else collect(child.props.children, inputs, outputs);
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
  const outputs: OutputProps[] = [];
  collect(children, inputs, outputs);

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
  for (const output of outputs) {
    const formula = compile(output.value);
    assertKnownVariables(
      formula,
      Object.keys(defaults),
      `${context} output "${output.label}"`,
    );
    formula.evaluate(defaults);
  }

  return (
    <CalcProvider id={id} title={title} defaults={defaults}>
      {children}
    </CalcProvider>
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
