import "server-only";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { count } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

const MIGRATIONS = join(process.cwd(), "drizzle");

/**
 * Production uses Postgres, configured either by DATABASE_URL or by the standard PGHOST,
 * PGUSER, PGPASSWORD and PGDATABASE variables (Docker uses these, so the password never has
 * to be escaped inside a URL). Without either — local development — an embedded Postgres
 * (PGlite) stores data in .data/pglite, so no database server is needed.
 */
async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url || process.env.PGHOST) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = url ? postgres(url, { max: 10 }) : postgres({ max: 10 });
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return db;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("No database configured: set PGHOST etc. or DATABASE_URL. See .env.example.");
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dataDir = join(process.cwd(), ".data");
  mkdirSync(dataDir, { recursive: true });
  const db = drizzle(new PGlite(join(dataDir, "pglite")), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as Db;
}

/** First run: import the guides that ship in content/guides so the site isn't empty. */
async function seedGuides(db: Db) {
  const [{ n }] = await db.select({ n: count() }).from(schema.guides);
  const dir = join(process.cwd(), "content", "guides");
  if (n > 0 || !existsSync(dir)) return;

  // meta.json lists pages in order; "---Name---" entries start a sidebar section.
  const meta = existsSync(join(dir, "meta.json"))
    ? (JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as {
        pages?: string[];
      })
    : {};
  const order = meta.pages ?? [];
  const files = readdirSync(dir).filter(
    (f) => f.endsWith(".mdx") && f !== "index.mdx",
  );
  const sectionOf = (slug: string) => {
    let section = "";
    for (const p of order) {
      const sep = /^---(.*)---$/.exec(p);
      if (sep) section = sep[1];
      else if (p === slug) return section;
    }
    return "";
  };

  const now = new Date();
  for (const file of files) {
    const slug = file.replace(/\.mdx$/, "");
    const source = readFileSync(join(dir, file), "utf8");
    await db.insert(schema.guides).values({
      slug,
      section: sectionOf(slug),
      position: Math.max(order.indexOf(slug), 0),
      draftSource: source,
      publishedSource: source,
      publishedAt: now,
    });
  }
}

const globalForDb = globalThis as unknown as { bmpDb?: Promise<Db> };

/** The database, migrated and ready. Shared across hot reloads in development. */
export function getDb(): Promise<Db> {
  globalForDb.bmpDb ??= connect()
    .then(async (db) => {
      await seedGuides(db);
      return db;
    })
    .catch((e) => {
      // Don't cache a failed connection; the next request tries again.
      globalForDb.bmpDb = undefined;
      throw e;
    });
  return globalForDb.bmpDb;
}

export { schema };
