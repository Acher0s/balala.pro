import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import {
  ACTIVE_MINUTES,
  type SeedLookupInput,
} from "@/lib/seed-lookups-shared";

/** One reader may report this many lookups a minute; more are dropped. */
const PER_MINUTE = 30;
/** The same reader reading the same seed and settings again within this is not logged twice. */
const DEDUPE_MINUTES = 10;

const SALT_KEY = "seed_lookup_ip_salt";

/**
 * The salt for hashing IPs: SEED_LOOKUP_IP_SALT if set, otherwise one made once and kept in
 * site_settings, so the same IP hashes the same across restarts.
 */
async function ipSalt(): Promise<string> {
  const env = process.env.SEED_LOOKUP_IP_SALT;
  if (env) return env;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.siteSettings)
    .where(eq(schema.siteSettings.key, SALT_KEY));
  if (typeof row?.value === "string") return row.value;
  const salt = randomBytes(32).toString("hex");
  await db
    .insert(schema.siteSettings)
    .values({ key: SALT_KEY, value: salt })
    .onConflictDoNothing();
  const [saved] = await db
    .select()
    .from(schema.siteSettings)
    .where(eq(schema.siteSettings.key, SALT_KEY));
  return typeof saved?.value === "string" ? saved.value : salt;
}

/** The first address in X-Forwarded-For (set by the reverse proxy), or X-Real-IP. */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || null;
}

export async function hashIp(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  return createHash("sha256")
    .update(`${await ipSalt()}:${ip}`)
    .digest("hex")
    .slice(0, 16);
}

export type RecordResult = "logged" | "duplicate" | "rate-limited";

/** Logs one seed reader lookup, unless it's a repeat or the reader is sending too many. */
export async function recordLookup(
  input: SeedLookupInput,
  who: { userId: string | null; ip: string | null },
): Promise<RecordResult> {
  const db = await getDb();
  const ipHash = await hashIp(who.ip);
  const now = Date.now();

  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.seedLookups)
    .where(
      and(
        ipHash
          ? eq(schema.seedLookups.ipHash, ipHash)
          : eq(schema.seedLookups.clientId, input.clientId),
        gte(schema.seedLookups.createdAt, new Date(now - 60_000)),
      ),
    );
  if (n >= PER_MINUTE) return "rate-limited";

  const seed = input.seed.replace(/^\*/, "");
  const deck = input.deck ?? null;
  const [repeat] = await db
    .select({ id: schema.seedLookups.id })
    .from(schema.seedLookups)
    .where(
      and(
        eq(schema.seedLookups.clientId, input.clientId),
        eq(schema.seedLookups.seed, seed),
        eq(schema.seedLookups.ruleset, input.ruleset),
        eq(schema.seedLookups.stake, input.stake),
        deck === null
          ? sql`${schema.seedLookups.deck} is null`
          : eq(schema.seedLookups.deck, deck),
        gte(
          schema.seedLookups.createdAt,
          new Date(now - DEDUPE_MINUTES * 60_000),
        ),
      ),
    )
    .limit(1);
  if (repeat) return "duplicate";

  await db.insert(schema.seedLookups).values({
    seed,
    ruleset: input.ruleset,
    stake: input.stake,
    deck,
    patch: input.patch,
    clientId: input.clientId,
    userId: who.userId,
    ipHash,
  });
  return "logged";
}

/** One lookup as admins and the API see it. */
export interface LookupView {
  id: string;
  seed: string;
  ruleset: string;
  stake: number;
  deck: string | null;
  patch: string;
  createdAt: string;
  clientId: string;
  ipHash: string | null;
  user: { id: string; username: string; displayName: string } | null;
}

function view(
  row: typeof schema.seedLookups.$inferSelect,
  user: typeof schema.users.$inferSelect | null,
): LookupView {
  return {
    id: row.id,
    seed: row.seed,
    ruleset: row.ruleset,
    stake: row.stake,
    deck: row.deck,
    patch: row.patch,
    createdAt: row.createdAt.toISOString(),
    clientId: row.clientId,
    ipHash: row.ipHash,
    user: user
      ? { id: user.id, username: user.username, displayName: user.displayName }
      : null,
  };
}

/** Lookups, newest first, optionally for one seed and/or between two times. */
export async function lookupHistory(opts: {
  seed?: string;
  since?: Date;
  before?: Date;
  limit?: number;
}): Promise<LookupView[]> {
  const db = await getDb();
  const where = [
    opts.seed
      ? eq(schema.seedLookups.seed, opts.seed.toUpperCase().replace(/^\*/, ""))
      : undefined,
    opts.since ? gte(schema.seedLookups.createdAt, opts.since) : undefined,
    opts.before ? lt(schema.seedLookups.createdAt, opts.before) : undefined,
  ].filter((w) => w !== undefined);
  const rows = await db
    .select()
    .from(schema.seedLookups)
    .leftJoin(schema.users, eq(schema.users.id, schema.seedLookups.userId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(schema.seedLookups.createdAt))
    .limit(Math.min(Math.max(opts.limit ?? 100, 1), 500));
  return rows.map((r) => view(r.seed_lookups, r.users));
}

/** A seed being read now: who's reading it and when. */
export interface ActiveSeed {
  seed: string;
  lookups: number;
  /** Distinct readers (browser tabs). */
  readers: number;
  firstAt: string;
  lastAt: string;
  rulesets: string[];
  users: { id: string; username: string; displayName: string }[];
  ipHashes: string[];
}

/** Seeds looked up in the last `minutes`, most recently read first. */
export async function activeSeeds(
  minutes: number = ACTIVE_MINUTES,
): Promise<ActiveSeed[]> {
  const since = new Date(
    Date.now() - Math.min(Math.max(minutes, 1), 1440) * 60_000,
  );
  const rows = await lookupHistory({ since, limit: 500 });
  const bySeed = new Map<string, LookupView[]>();
  for (const r of rows) bySeed.set(r.seed, [...(bySeed.get(r.seed) ?? []), r]);
  return [...bySeed.entries()]
    .map(([seed, list]) => {
      const users = new Map(
        list.flatMap((r) => (r.user ? [[r.user.id, r.user] as const] : [])),
      );
      return {
        seed,
        lookups: list.length,
        readers: new Set(list.map((r) => r.clientId)).size,
        firstAt: list[list.length - 1].createdAt,
        lastAt: list[0].createdAt,
        rulesets: [...new Set(list.map((r) => r.ruleset))],
        users: [...users.values()],
        ipHashes: [
          ...new Set(list.flatMap((r) => (r.ipHash ? [r.ipHash] : []))),
        ],
      };
    })
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}
