import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileGuide, GuideValidationError } from "@/lib/mdx/compile";

/**
 * Every page in content/import must be publishable as written: valid markup, known cards,
 * working formulas, and embedded tools that are part of the same pack.
 */
const IMPORT_DIR = join(process.cwd(), "content", "import");

interface Manifest {
  pages: {
    kind: "guide" | "tool";
    slug: string;
    file: string;
    parent?: string;
  }[];
}

const packs = readdirSync(IMPORT_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => {
    const dir = join(IMPORT_DIR, d.name);
    const manifest = JSON.parse(
      readFileSync(join(dir, "pack.json"), "utf8"),
    ) as Manifest;
    return { id: d.name, dir, manifest };
  });

describe.each(packs)("content pack $id", ({ dir, manifest }) => {
  const tools = new Set(
    manifest.pages.filter((p) => p.kind === "tool").map((p) => p.slug),
  );

  it("lists every file once, with unique slugs", () => {
    const slugs = manifest.pages.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("only makes guides parts of a main guide in the same pack", () => {
    const pages = new Map(manifest.pages.map((p) => [p.slug, p]));
    for (const p of manifest.pages.filter((p) => p.parent)) {
      const parent = pages.get(p.parent as string);
      expect(p.kind, p.slug).toBe("guide");
      expect(parent?.kind, p.slug).toBe("guide");
      expect(parent?.parent, p.slug).toBeUndefined();
    }
  });

  it.each(manifest.pages)("$slug compiles", async ({ kind, file }) => {
    const source = readFileSync(join(dir, file), "utf8");
    // Tier lists live in the site's database, so any id is accepted here.
    const tierLists = new Set(
      [...source.matchAll(/<TierList id="([^"]+)"/g)].map((m) => m[1]),
    );
    try {
      await compileGuide(source, {
        kind,
        knownTools: tools,
        knownTierLists: tierLists,
      });
    } catch (e) {
      if (e instanceof GuideValidationError)
        throw new Error(`${file}:\n${e.problems.join("\n")}`);
      throw e;
    }
  });
});
