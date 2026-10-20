import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/auth";
import { sniffImageType } from "@/lib/media";
import { defaultTiers, PRESETS } from "@/lib/tierlist-shared";
import { resolveRef, tierCatalog, validateTierList } from "@/lib/tierlists";

const list = (items: string[], pool: string[] = []) => {
  const tiers = defaultTiers();
  tiers[0].items = items;
  return { title: "My list", description: "", data: { tiers, pool } };
};

describe("tier list catalog", () => {
  const catalog = tierCatalog();

  it("includes every card sprite, including multiplayer cards and playing cards", () => {
    const groups = new Set(catalog.map((c) => c.group));
    for (const g of [
      "joker",
      "multiplayer",
      "tarot",
      "planet",
      "spectral",
      "voucher",
      "enhancement",
      "seal",
      "deck",
      "card",
    ]) {
      expect(groups).toContain(g);
    }
    expect(catalog.filter((c) => c.group === "card")).toHaveLength(52);
    expect(catalog.filter((c) => c.group === "joker")).toHaveLength(150);
  });

  it("has presets that each load something (except the empty one)", () => {
    for (const p of PRESETS.filter((p) => p.id !== "empty")) {
      expect(
        catalog.some((c) => p.groups.includes(c.group)),
        p.label,
      ).toBe(true);
    }
  });

  it("resolves refs, and playing cards stack base + front", () => {
    expect(resolveRef("joker:mime")?.name).toBe("Mime");
    expect(resolveRef("joker:mp_pizza")?.source).toBe("Multiplayer");
    expect(resolveRef("card:H_K")?.layers).toHaveLength(2);
    expect(resolveRef("joker:nope")).toBeNull();
    expect(resolveRef("joker:__proto__")).toBeNull();
  });
});

describe("tier list validation", () => {
  it("accepts a normal list", () => {
    expect(
      validateTierList(list(["joker:mime", "card:S_A"], ["tarot:empress"])).ok,
    ).toBe(true);
  });

  it("rejects unknown cards, duplicates, bad colours and empty titles", () => {
    expect(validateTierList(list(["joker:made_up"]))).toMatchObject({
      ok: false,
    });
    expect(
      validateTierList(list(["joker:mime"], ["joker:mime"])),
    ).toMatchObject({ ok: false, error: /twice/ });
    const badColour = list([]);
    badColour.data.tiers[0].color = "red; background:url(x)";
    expect(validateTierList(badColour).ok).toBe(false);
    expect(validateTierList({ ...list([]), title: "  " }).ok).toBe(false);
  });

  it("limits the number of tiers", () => {
    const many = list([]);
    many.data.tiers = Array.from({ length: 21 }, (_, i) => ({
      id: `t${i}`,
      label: "x",
      color: "#ffffff",
      items: [],
    }));
    expect(validateTierList(many).ok).toBe(false);
  });
});

describe("uploads", () => {
  const bytes = (s: string, prefix: number[] = []) =>
    new Uint8Array([...prefix, ...[...s].map((c) => c.charCodeAt(0))]);

  it("recognises images by their content", () => {
    expect(sniffImageType(bytes("GIF89a....."))).toBe("image/gif");
    expect(sniffImageType(bytes("PNG\r\n", [0x89]))).toBe("image/png");
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      "image/jpeg",
    );
    expect(sniffImageType(bytes("RIFF0000WEBPVP8 "))).toBe("image/webp");
  });

  it("refuses everything else, including SVG and HTML", () => {
    expect(
      sniffImageType(bytes("<svg xmlns='http://www.w3.org/2000/svg'><script>")),
    ).toBeNull();
    expect(sniffImageType(bytes("<html><script>alert(1)</script>"))).toBeNull();
  });
});

describe("returning after login", () => {
  it("only allows paths on this site", () => {
    expect(safeNext("/tierlists/new")).toBe("/tierlists/new");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    // Browsers treat "/\" like "//", i.e. another site.
    expect(safeNext(String.raw`/\evil.example`)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
  });
});
