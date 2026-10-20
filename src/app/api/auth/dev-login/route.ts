import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import type { Role } from "@/db/schema";
import {
  createSession,
  devLoginEnabled,
  STUDIO,
  safeNext,
  upsertDiscordUser,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Local development only: /api/auth/dev-login?as=admin|writer|none signs in as a test user,
 * so the studio can be tried without setting up a Discord app. Returns 404 in production.
 */
export async function GET(req: Request) {
  if (!devLoginEnabled) return new NextResponse(null, { status: 404 });
  const as = (new URL(req.url).searchParams.get("as") ?? "admin") as Role;
  if (!["admin", "writer", "none"].includes(as))
    return new NextResponse("Unknown role", { status: 400 });

  const user = await upsertDiscordUser({
    id: `dev-${as}`,
    username: `dev_${as}`,
    global_name: `Dev ${as[0].toUpperCase()}${as.slice(1)}`,
    avatar: null,
  });
  const db = await getDb();
  if (user.role !== as && as !== "none") {
    await db
      .update(schema.users)
      .set({ role: as })
      .where(eq(schema.users.id, user.id));
  }
  await createSession(user.id);
  const next = safeNext(new URL(req.url).searchParams.get("next") ?? STUDIO);
  return NextResponse.redirect(new URL(next, req.url));
}
