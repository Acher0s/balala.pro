import { describe, expect, it } from "vitest";
import { DEFAULT_FALLING, FALLING_KINDS, fallingSchema } from "./falling";

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

  it("has a weight for every kind", () => {
    for (const kind of FALLING_KINDS)
      expect(DEFAULT_FALLING.weights[kind]).toBeGreaterThanOrEqual(0);
  });
});
