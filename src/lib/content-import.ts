import "server-only";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { SLUG_RE, safeFrontmatter } from "@/lib/guides";

/**
 * Content packs: guides and tools written as files in the repo (content/import/<pack>/), shipped
 * with a deploy and imported as drafts from the studio. Each pack has a pack.json:
 *
 *   {
 *     "title": "White Stake Guide",
 *     "section": "White Stake",
 *     "pages": [{ "kind": "guide", "slug": "white-stake", "file": "white-stake.mdx" }, …]
 *   }
 *
 * Pages keep the manifest's order within their section.
 */
const IMPORT_DIR = join(process.cwd(), "content", "import");
const PACK_ID_RE = /^[a-z0-9-]+$/;

const manifestSchema = z.object({
  title: z.string().min(1),
  section: z.string().default(""),
  pages: z
    .array(
      z.object({
        kind: z.enum(["guide", "tool"]),
        slug: z.string().regex(SLUG_RE),
        file: z.string().min(1),
      }),
    )
    .min(1),
});

export type ImportStatus =
  /** No page with this slug yet. */
  | "new"
  /** The draft already matches the file. */
  | "same"
  /** The draft differs from the file: importing replaces it. */
  | "changed"
  /** The slug belongs to a page of the other kind (a guide vs a tool). */
  | "conflict";

export interface ImportPage {
  kind: "guide" | "tool";
  slug: string;
  title: string;
  source: string;
  position: number;
  status: ImportStatus;
  published: boolean;
  /** The existing page's id, for linking to its editor. */
  id?: string;
}

export interface ImportPack {
  id: string;
  title: string;
  section: string;
  pages: ImportPage[];
}

function readPack(id: string): Omit<ImportPack, "pages"> & {
  pages: Omit<ImportPage, "status" | "published" | "id">[];
} {
  if (!PACK_ID_RE.test(id)) throw new Error(`Unknown pack "${id}".`);
  const dir = join(IMPORT_DIR, id);
  const manifest = manifestSchema.parse(
    JSON.parse(readFileSync(join(dir, "pack.json"), "utf8")),
  );
  const positions = { guide: 0, tool: 0 };
  return {
    id,
    title: manifest.title,
    section: manifest.section,
    pages: manifest.pages.map((p) => {
      const file = resolve(dir, p.file);
      // Files must stay inside the pack's folder.
      const rel = relative(dir, file);
      if (rel.startsWith("..") || isAbsolute(rel))
        throw new Error(`${p.file} is outside the pack.`);
      const source = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
      return {
        kind: p.kind,
        slug: p.slug,
        title: safeFrontmatter(source, p.slug).title,
        source,
        position: positions[p.kind]++,
      };
    }),
  };
}

/** Every pack that shipped with this deploy, with each page's state in the database. */
export async function listImportPacks(): Promise<ImportPack[]> {
  if (!existsSync(IMPORT_DIR)) return [];
  const ids = readdirSync(IMPORT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && PACK_ID_RE.test(d.name))
    .map((d) => d.name)
    .sort();
  return Promise.all(ids.map(getImportPack));
}

export async function getImportPack(id: string): Promise<ImportPack> {
  const pack = readPack(id);
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.guides)
    .where(
      inArray(
        schema.guides.slug,
        pack.pages.map((p) => p.slug),
      ),
    );
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  return {
    ...pack,
    pages: pack.pages.map((p) => {
      const row = bySlug.get(p.slug);
      const status: ImportStatus = !row
        ? "new"
        : row.kind !== p.kind
          ? "conflict"
          : row.draftSource === p.source
            ? "same"
            : "changed";
      return {
        ...p,
        status,
        published: Boolean(row?.publishedSource),
        id: row?.id,
      };
    }),
  };
}
