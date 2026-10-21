/** "e" always writes the number the way Balatro writes big scores: 4.398e14. */
export type ValueFormat = "number" | "money" | "percent" | "e";

/** Balatro switches to E notation from 1e11 (100,000,000,000) onwards. */
const E_NOTATION_FROM = 1e11;

/** 4.398e14: always 3 decimals, like the game. */
function eNotation(value: number) {
  return value.toExponential(3).replace("e+", "e");
}

/** 1234567.5 → "1,234,567.50" */
function grouped(value: number, places: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  });
}

/**
 * Plain numbers read like Balatro's score display: thousands separators, and E notation with
 * 3 decimals once they reach e11. Without `decimals`, whole numbers show no fraction (3, not 3.00).
 */
export function formatValue(
  value: number,
  format: ValueFormat = "number",
  decimals?: number,
): string {
  if (!Number.isFinite(value)) return "—";
  const places = decimals ?? 2;
  switch (format) {
    case "money":
      return `${value < 0 ? "-" : ""}$${grouped(Math.abs(value), places)}`;
    case "percent":
      return `${(value * 100).toFixed(places)}%`;
    case "e":
      return eNotation(value);
    default:
      if (Math.abs(value) >= E_NOTATION_FROM) return eNotation(value);
      return grouped(
        value,
        decimals === undefined && Number.isInteger(value) ? 0 : places,
      );
  }
}
