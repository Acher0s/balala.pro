import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { ApiKeyRow, ApiScope } from "@/db/schema";

/** Keys look like "bmpu_<43 characters>"; this much of the start is kept to tell keys apart. */
const PREFIX = "bmpu_";
const SHOWN = PREFIX.length + 6;

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** Makes a key. The key itself is returned once and never stored. */
export async function createApiKey(
  name: string,
  scopes: ApiScope[],
  createdBy: string,
): Promise<{ key: string; row: ApiKeyRow }> {
  const key = PREFIX + randomBytes(32).toString("base64url");
  const db = await getDb();
  const [row] = await db
    .insert(schema.apiKeys)
    .values({
      name,
      scopes,
      createdBy,
      keyHash: hashKey(key),
      prefix: key.slice(0, SHOWN),
    })
    .returning();
  return { key, row };
}

export async function listApiKeys() {
  const db = await getDb();
  return db
    .select({ key: schema.apiKeys, creator: schema.users.displayName })
    .from(schema.apiKeys)
    .leftJoin(schema.users, eq(schema.users.id, schema.apiKeys.createdBy))
    .orderBy(desc(schema.apiKeys.createdAt));
}

export async function revokeApiKey(id: string) {
  const db = await getDb();
  await db
    .update(schema.apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.apiKeys.id, id), isNull(schema.apiKeys.revokedAt)));
}

/**
 * The key a request carries ("Authorization: Bearer <key>"), if it exists, isn't revoked and
 * has `scope`. Marks the key as used.
 */
export async function authorizeApiKey(
  req: Request,
  scope: ApiScope,
): Promise<ApiKeyRow | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match?.[1].startsWith(PREFIX)) return null;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.keyHash, hashKey(match[1])))
    .limit(1);
  if (!row || row.revokedAt || !row.scopes.includes(scope)) return null;
  await db
    .update(schema.apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiKeys.id, row.id));
  return row;
}
