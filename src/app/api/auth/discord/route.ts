import { NextResponse } from "next/server";
import {
  NEXT_COOKIE,
  randomToken,
  STATE_COOKIE,
  safeNext,
  secureCookies,
} from "@/lib/auth";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

/** Starts "Sign in with Discord". */
export async function GET(req: Request) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    return new NextResponse(
      "Discord login isn't configured (DISCORD_CLIENT_ID).",
      { status: 500 },
    );
  }
  const state = randomToken();
  const url = new URL("https://discord.com/oauth2/authorize");
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: "identify",
    redirect_uri: `${siteUrl(req)}/api/auth/discord/callback`,
    state,
    prompt: "none",
  }).toString();

  const res = NextResponse.redirect(url);
  // Checked on the way back to stop login CSRF.
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 600,
  });
  // Remember where to return to after Discord sends the user back.
  res.cookies.set(
    NEXT_COOKIE,
    safeNext(new URL(req.url).searchParams.get("next")),
    {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "lax",
      path: "/api/auth",
      maxAge: 600,
    },
  );
  return res;
}
