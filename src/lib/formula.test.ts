import { describe, expect, it } from "vitest";
import { assertKnownVariables, compile, FormulaError } from "./formula";

const evalf = (src: string, scope?: Record<string, number>) =>
  compile(src).evaluate(scope);

describe("formula", () => {
  it("follows operator precedence", () => {
    expect(evalf("1 + 2 * 3")).toBe(7);
    expect(evalf("(1 + 2) * 3")).toBe(9);
    expect(evalf("2 ^ 3 ^ 2")).toBe(512); // right-associative
    expect(evalf("-2 ^ 2")).toBe(-4);
    expect(evalf("2 ^ -1")).toBe(0.5);
    expect(evalf("10 / 4 - 1")).toBe(1.5);
  });

  it("reads variables", () => {
    expect(evalf("P * R / 2", { P: 3, R: 4 })).toBe(6);
  });

  it("supports spreadsheet-style comparisons and if()", () => {
    expect(evalf("if(mode = 1, 10, 20)", { mode: 1 })).toBe(10);
    expect(evalf("if(mode <> 1, 10, 20)", { mode: 1 })).toBe(20);
    expect(evalf("3 >= 3")).toBe(1);
  });

  it("only evaluates the taken if() branch", () => {
    expect(evalf("if(1, 5, missing)")).toBe(5);
  });

  it("matches COMBIN and the blocking odds from the White Stake Guide", () => {
    expect(evalf("combin(21, 5)")).toBe(20349);
    expect(evalf("combin(3, 5)")).toBe(0);
    // 21 tarots, 5 wanted, 3 blocked, 5 per pack
    const noBlock = evalf("1 - combin(21 - 5, 5) / combin(21, 5)");
    const withBlock = evalf("1 - combin(21 - 5 - 3, 5) / combin(21 - 3, 5)");
    expect(noBlock).toBeCloseTo(0.7853, 4);
    expect(withBlock).toBeGreaterThan(noBlock);
  });

  it("rejects unknown variables, functions and bad syntax", () => {
    expect(() => evalf("x + 1")).toThrow(FormulaError);
    expect(() => compile("eval(1)")).toThrow(/Unknown function/);
    expect(() => compile("1 +")).toThrow(FormulaError);
    expect(() => compile("1 2")).toThrow(FormulaError);
    expect(() => compile("alert`1`")).toThrow(FormulaError);
  });

  it("lists the variables a formula reads", () => {
    const f = compile("if(mode = 1, P * R, Q)");
    expect([...f.variables].sort()).toEqual(["P", "Q", "R", "mode"]);
    expect(() => assertKnownVariables(f, ["mode", "P", "R"], "test")).toThrow(
      /"Q"/,
    );
  });
});

describe("Reserved Parking expected value", () => {
  const raw = compile("P * 2^(P-1) * (1 - (1 - 0.5^P)^R)");

  // The "Expected value (Raw)" table from the Reserved Parking guide PDF, rows = triggers, cols = copies.
  const pdfTable = [
    [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5],
    [0.75, 1.75, 2.81, 3.88, 4.92, 5.95, 6.97],
    [0.88, 2.31, 3.96, 5.63, 7.27, 8.86, 10.42],
    [0.94, 2.73, 4.97, 7.28, 9.54, 11.72, 13.84],
    [0.97, 3.05, 5.85, 8.83, 11.74, 14.54, 17.23],
    [0.98, 3.29, 6.61, 10.27, 13.88, 17.31, 20.59],
    [0.99, 3.47, 7.29, 11.63, 15.94, 20.04, 23.93],
  ];

  it("reproduces every cell of the PDF table", () => {
    pdfTable.forEach((row, r) => {
      row.forEach((expected, p) => {
        expect(raw.evaluate({ P: p + 1, R: r + 1 })).toBeCloseTo(expected, 1);
      });
    });
  });

  it("matches the copy setup numbers quoted in the guide", () => {
    expect(raw.evaluate({ P: 3, R: 2 })).toBeCloseTo(2.81, 2);
    expect(raw.evaluate({ P: 2, R: 3 })).toBeCloseTo(2.31, 1);
  });
});
