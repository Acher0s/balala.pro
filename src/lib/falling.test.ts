import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHANCES,
  DEFAULT_FALLING,
  FALLING_KINDS,
  fallingSchema,
  pickWeighted,
  rollEdition,
  rollStandardCard,
} from "./falling";

describe("falling cards settings", () => {
  it("has valid defaults, off until an admin turns it on", () => {
    expect(fallingSchema.parse(DEFAULT_FALLING)).toEqual(DEFAULT_FALLING);
    expect(DEFAULT_FALLING.enabled).toBe(false);
  });

  it("rejects values out of range", () => {
    expect(
      fallingSchema.safeParse({ ...DEFAULT_FALLING, count: 10_000 }).success,
    ).toBe(false);
    expect(
      fallingSchema.safeParse({ ...DEFAULT_FALLING, opacity: 0 }).success,
    ).toBe(false);
  });

  it("fills in game odds for settings saved before chances existed", () => {
    const { chances, depthFade, ...old } = DEFAULT_FALLING;
    expect(fallingSchema.parse(old)).toEqual(DEFAULT_FALLING);
  });

  it("rejects edition chances over 100%", () => {
    const chances = {
      ...DEFAULT_CHANCES,
      jokerEdition: { foil: 60, holo: 30, polychrome: 20, negative: 0 },
    };
    expect(
      fallingSchema.safeParse({ ...DEFAULT_FALLING, chances }).success,
    ).toBe(false);
  });

  it("has a weight for every kind", () => {
    for (const kind of FALLING_KINDS)
      expect(DEFAULT_FALLING.weights[kind]).toBeGreaterThanOrEqual(0);
  });
});

describe("card rolls (the game's odds)", () => {
  /** Share of each result over evenly spread rolls in [0, 1). */
  const shares = (roll: (r: number) => string | null) => {
    const n = 100_000;
    const counts = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const result = roll((i + 0.5) / n) ?? "none";
      counts.set(result, (counts.get(result) ?? 0) + 1);
    }
    return Object.fromEntries(
      [...counts].map(([k, v]) => [k, Math.round((v / n) * 1000) / 10]),
    );
  };

  it("gives jokers shop editions: Negative and Polychrome 0.3%, Holo 1.4%, Foil 2%", () => {
    expect(shares((r) => rollEdition(r, DEFAULT_CHANCES.jokerEdition))).toEqual(
      {
        negative: 0.3,
        polychrome: 0.3,
        holo: 1.4,
        foil: 2,
        none: 96,
      },
    );
  });

  it("gives playing cards Standard pack editions: Polychrome 1.2%, Holo 2.8%, Foil 4%", () => {
    expect(shares((r) => rollEdition(r, DEFAULT_CHANCES.cardEdition))).toEqual({
      polychrome: 1.2,
      holo: 2.8,
      foil: 4,
      none: 92,
    });
  });

  it("picks by relative weight, skipping weights of 0", () => {
    expect(shares((r) => pickWeighted({ a: 3, b: 0, c: 1 }, r))).toEqual({
      a: 75,
      c: 25,
    });
    expect(pickWeighted({ a: 0, b: 0 }, 0.5)).toBeNull();
  });

  it("enhances 40% of playing cards and seals 20%", () => {
    let enhanced = 0;
    let sealed = 0;
    const n = 20_000;
    let seed = 1;
    // A small fixed pseudo-random sequence, so the test is repeatable.
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < n; i++) {
      const card = rollStandardCard(random);
      if (card.enhancement !== null) enhanced++;
      if (card.seal !== null) sealed++;
    }
    expect(enhanced / n).toBeCloseTo(0.4, 1);
    expect(sealed / n).toBeCloseTo(0.2, 1);
  });
});
