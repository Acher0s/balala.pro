import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  createSession,
  type DiscordProfile,
  LOGIN,
  NEXT_COOKIE,
  STATE_COOKIE,
  safeNext,
  upsertDiscordUser,
} from "@/lib/auth";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

function fail(req: Request, reason: string) {
  const url = new URL(LOGIN, siteUrl(req));
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

/** Discord sends the user back here after they approve the login. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);

  if (params.get("error")) return fail(req, "cancelled");
  const code = params.get("code");
  if (!code || !expected || params.get("state") !== expected)
    return fail(req, "state");

  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID ?? "",
      client_secret: process.env.DISCORD_CLIENT_SECRET ?? "",
      grant_type: "authorization_code",
      code,
      redirect_uri: `${siteUrl(req)}/api/auth/discord/callback`,
    }),
  });
  if (!tokenRes.ok) return fail(req, "discord");
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const meRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!meRes.ok) return fail(req, "discord");
  const profile = (await meRes.json()) as DiscordProfile;

  const user = await upsertDiscordUser(profile);
  await createSession(user.id);
  const next = safeNext(jar.get(NEXT_COOKIE)?.value);
  jar.delete(NEXT_COOKIE);
  return NextResponse.redirect(new URL(next, siteUrl(req)));
}
