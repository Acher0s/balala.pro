import { describe, expect, it } from "vitest";
import { formatValue } from "./format";

describe("formatValue", () => {
  it("groups thousands like Balatro's score display", () => {
    expect(formatValue(1050)).toBe("1,050");
    expect(formatValue(6633861120)).toBe("6,633,861,120");
    expect(formatValue(1.4285714)).toBe("1.43");
    expect(formatValue(3, "number", 2)).toBe("3.00");
  });

  it("switches to E notation with 3 decimals from e11", () => {
    expect(formatValue(99999999999)).toBe("99,999,999,999");
    expect(formatValue(1e11)).toBe("1.000e11");
    expect(formatValue(439756630927755.94, "number", 0)).toBe("4.398e14");
    expect(formatValue(3.5244e15)).toBe("3.524e15");
  });

  it("formats money, percentages and forced E notation", () => {
    expect(formatValue(1234.5, "money")).toBe("$1,234.50");
    expect(formatValue(-3, "money", 0)).toBe("-$3");
    expect(formatValue(0.0821, "percent")).toBe("8.21%");
    expect(formatValue(248832, "e")).toBe("2.488e5");
  });

  it("shows a dash for missing values", () => {
    expect(formatValue(Number.NaN)).toBe("—");
  });
});
