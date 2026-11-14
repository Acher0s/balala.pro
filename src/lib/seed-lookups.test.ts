import { describe, expect, it } from "vitest";
import { clientIp } from "./seed-lookups";
import { seedLookupInput } from "./seed-lookups-shared";

const valid = {
  seed: "fzzuajbr",
  ruleset: "expanded",
  stake: 1,
  deck: "violet",
  patch: "pvp-1.0.5",
  clientId: "a1b2c3d4e5f6",
};

describe("seed lookup reports", () => {
  it("accept what the reader sends, upper-casing the seed", () => {
    const parsed = seedLookupInput.parse(valid);
    expect(parsed.seed).toBe("FZZUAJBR");
    expect(seedLookupInput.parse({ ...valid, deck: null }).deck).toBeNull();
    expect(seedLookupInput.parse({ ...valid, seed: "*ABC" }).seed).toBe("*ABC");
  });

  it("refuse anything that isn't a seed reader report", () => {
    for (const bad of [
      { ...valid, seed: "" },
      { ...valid, seed: "TOO-LONG-AND-DASHED" },
      { ...valid, seed: "<script>" },
      { ...valid, stake: 0 },
      { ...valid, stake: 1.5 },
      { ...valid, ruleset: "Expanded Ruleset!" },
      { ...valid, clientId: "short" },
      { ...valid, patch: "x".repeat(40) },
    ])
      expect(seedLookupInput.safeParse(bad).success).toBe(false);
  });
});

describe("clientIp", () => {
  it("takes the first X-Forwarded-For address, else X-Real-IP", () => {
    expect(
      clientIp(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" })),
    ).toBe("203.0.113.5");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe(
      "198.51.100.7",
    );
    expect(clientIp(new Headers())).toBeNull();
  });
});
