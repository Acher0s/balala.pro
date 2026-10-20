import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb, schema } from "@/db";
import type { Role, User } from "@/db/schema";

export const SESSION_COOKIE = "bmpu_session";
export const STATE_COOKIE = "bmpu_oauth_state";
/** Where to go after signing in (a path on this site). */
export const NEXT_COOKIE = "bmpu_login_next";
const SESSION_DAYS = 30;

/** The writer studio. */
export const STUDIO = "/studio";
export const LOGIN = "/login";

/** A path on this site to return to, or "/". Rejects anything that could leave the site. */
export function safeNext(next: unknown): string {
  if (typeof next !== "string") return "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\"))
    return "/";
  return next;
}

export function loginUrl(next: string) {
  return `${LOGIN}?next=${encodeURIComponent(next)}`;
}

const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export function randomToken() {
  return randomBytes(32).toString("base64url");
}

export const secureCookies = process.env.NODE_ENV === "production";

export async function createSession(userId: string) {
  const db = await getDb();
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db
    .insert(schema.sessions)
    .values({ tokenHash: hash(token), userId, expiresAt });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db
      .delete(schema.sessions)
      .where(eq(schema.sessions.tokenHash, hash(token)));
  }
  jar.delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const [row] = await db
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(
      and(
        eq(schema.sessions.tokenHash, hash(token)),
        gt(schema.sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row?.user ?? null;
});

const RANK: Record<Role, number> = { none: 0, writer: 1, admin: 2 };

export function hasRole(user: Pick<User, "role"> | null, role: Role) {
  return !!user && RANK[user.role] >= RANK[role];
}

/** For pages: the signed-in user with at least `role`, or a redirect. */
export async function requireUser(
  role: Role = "none",
  returnTo: string = STUDIO,
): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(loginUrl(returnTo));
  if (!hasRole(user, role)) redirect(STUDIO);
  return user;
}

/** For server actions: throws instead of redirecting. */
export async function assertUser(role: Role = "none"): Promise<User> {
  const user = await getCurrentUser();
  if (!user || !hasRole(user, role))
    throw new Error("You don't have permission to do that.");
  return user;
}

export function canEditGuide(user: User, guide: { authorId: string | null }) {
  return (
    user.role === "admin" ||
    (user.role === "writer" && guide.authorId === user.id)
  );
}

/** Discord ids (comma separated) that are always admins. */
function adminIds() {
  return new Set(
    (process.env.ADMIN_DISCORD_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export interface DiscordProfile {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
}

/** Creates or updates the user for a Discord login. Bootstrap admins are promoted here. */
export async function upsertDiscordUser(
  profile: DiscordProfile,
): Promise<User> {
  const db = await getDb();
  const values = {
    discordId: profile.id,
    username: profile.username,
    displayName: profile.global_name ?? profile.username,
    avatarUrl: profile.avatar
      ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png?size=64`
      : null,
  };
  const [user] = await db
    .insert(schema.users)
    .values(values)
    .onConflictDoUpdate({ target: schema.users.discordId, set: values })
    .returning();
  if (adminIds().has(profile.id) && user.role !== "admin") {
    const [promoted] = await db
      .update(schema.users)
      .set({ role: "admin" })
      .where(eq(schema.users.id, user.id))
      .returning();
    return promoted;
  }
  return user;
}

/** Local development only: sign in as a test user without Discord. */
export const devLoginEnabled = process.env.NODE_ENV === "development";
