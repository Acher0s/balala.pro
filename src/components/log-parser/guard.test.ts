import { gzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { gunzipLimited } from "./bmp/legacy/log-source-parser";

describe("unzipping packed data from a log", () => {
  it("unzips normal data", () => {
    const text = new TextEncoder().encode("return { jokers = {} }");
    expect(new TextDecoder().decode(gunzipLimited(gzipSync(text)))).toBe(
      "return { jokers = {} }",
    );
  });

  it("stops a zip bomb instead of filling memory", () => {
    // 64 MB of zeros squeezes into about 64 KB.
    const bomb = gzipSync(new Uint8Array(64 * 1024 * 1024));
    expect(bomb.length).toBeLessThan(100 * 1024);
    expect(() => gunzipLimited(bomb, 1024 * 1024)).toThrow(/more than allowed/);
  });
});
