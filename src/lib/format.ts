export type ValueFormat = "number" | "money" | "percent";

/** Without `decimals`, plain numbers drop the fraction when they're whole (3, not 3.00). */
export function formatValue(
  value: number,
  format: ValueFormat = "number",
  decimals?: number,
): string {
  if (!Number.isFinite(value)) return "—";
  const places = decimals ?? 2;
  switch (format) {
    case "money":
      return `${value < 0 ? "-" : ""}$${Math.abs(value).toFixed(places)}`;
    case "percent":
      return `${(value * 100).toFixed(places)}%`;
    default:
      return decimals === undefined && Number.isInteger(value)
        ? String(value)
        : value.toFixed(places);
  }
}
