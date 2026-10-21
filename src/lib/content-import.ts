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
 *     "pages": [
 *       { "kind": "guide", "slug": "white-stake", "file": "white-stake.mdx" },
 *       { "kind": "guide", "slug": "white-stake-shop", "file": "shop.mdx", "parent": "white-stake" },
 *       …
 *     ]
 *   }
 *
 * Pages keep the manifest's order; "parent" makes a page a part of that main guide.
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
        parent: z.string().regex(SLUG_RE).optional(),
      }),
    )
    .min(1),
});

export type ImportStatus =
  /** No page with this slug yet. */
  | "new"
  /** The draft and where it's listed already match the file. */
  | "same"
  /** Same draft, but its section, order or main guide differ: importing only moves it. */
  | "moved"
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
  /** Slug of the main guide this page is a part of. */
  parent: string | null;
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

type PackFile = Omit<ImportPage, "status" | "published" | "id">;

function readPack(
  id: string,
): Omit<ImportPack, "pages"> & { pages: PackFile[] } {
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
        parent: p.parent ?? null,
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
  const slugs = [
    ...new Set(
      pack.pages.flatMap((p) => (p.parent ? [p.slug, p.parent] : [p.slug])),
    ),
  ];
  const rows = await db
    .select()
    .from(schema.guides)
    .where(inArray(schema.guides.slug, slugs));
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  return {
    ...pack,
    pages: pack.pages.map((p) => {
      const row = bySlug.get(p.slug);
      const parentId = p.parent ? (bySlug.get(p.parent)?.id ?? null) : null;
      const placed =
        row?.section === pack.section &&
        row.position === p.position &&
        row.parentId === parentId;
      const status: ImportStatus = !row
        ? "new"
        : row.kind !== p.kind
          ? "conflict"
          : row.draftSource !== p.source
            ? "changed"
            : placed
              ? "same"
              : "moved";
      return {
        ...p,
        status,
        published: Boolean(row?.publishedSource),
        id: row?.id,
      };
    }),
  };
}
