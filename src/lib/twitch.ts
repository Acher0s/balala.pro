import "server-only";

/**
 * Twitch, for the Creators page: who of the listed creators is live in the Balatro category, and
 * their profile pictures. Uses an app access token (TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET, from
 * a Twitch app at dev.twitch.tv); without them, nobody shows as live.
 *
 * Answers are cached (live streams for a minute, profiles for an hour), so however many people
 * open the page, Twitch is asked about once a minute.
 */

/** Twitch's name for the game's category. */
export const BALATRO_CATEGORY = "Balatro";

export interface LiveStream {
  login: string;
  name: string;
  title: string;
  viewers: number;
  startedAt: string;
}

interface HelixStream {
  user_login: string;
  user_name: string;
  game_name: string;
  title: string;
  viewer_count: number;
  started_at: string;
  type: string;
}

/** Only live streams in the Balatro category, as the page shows them. */
export function balatroOnly(streams: HelixStream[]): LiveStream[] {
  return streams
    .filter(
      (s) =>
        s.type === "live" &&
        s.game_name.toLowerCase() === BALATRO_CATEGORY.toLowerCase(),
    )
    .map((s) => ({
      login: s.user_login.toLowerCase(),
      name: s.user_name,
      title: s.title,
      viewers: s.viewer_count,
      startedAt: s.started_at,
    }));
}

export const twitchConfigured = () =>
  Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);

let token: { value: string; expires: number } | null = null;

async function appToken(force = false) {
  if (!force && token && token.expires > Date.now() + 60_000)
    return token.value;
  const params = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID ?? "",
    client_secret: process.env.TWITCH_CLIENT_SECRET ?? "",
    grant_type: "client_credentials",
  });
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: params,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Twitch token: ${res.status}`);
  const body = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  token = {
    value: body.access_token,
    expires: Date.now() + body.expires_in * 1000,
  };
  return token.value;
}

/** GET from the Helix API, refreshing the token once if Twitch turns it down. */
async function helix<T>(path: string): Promise<T[]> {
  for (const retry of [false, true]) {
    const res = await fetch(`https://api.twitch.tv/helix/${path}`, {
      headers: {
        "Client-Id": process.env.TWITCH_CLIENT_ID ?? "",
        Authorization: `Bearer ${await appToken(retry)}`,
      },
      cache: "no-store",
    });
    if (res.status === 401 && !retry) continue;
    if (!res.ok) throw new Error(`Twitch ${path.split("?")[0]}: ${res.status}`);
    return ((await res.json()) as { data: T[] }).data;
  }
  return [];
}

/** Logins as Helix query parameters, at most 100 (Twitch's limit per request). */
const loginQuery = (name: string, logins: string[]) =>
  logins
    .slice(0, 100)
    .map((l) => `${name}=${encodeURIComponent(l)}`)
    .join("&");

const LIVE_TTL = 60_000;
const PROFILE_TTL = 60 * 60_000;
let liveCache: { key: string; at: number; streams: LiveStream[] } | null = null;
const profileCache = new Map<string, { at: number; image: string | null }>();

/** Which of these Twitch logins are live in the Balatro category right now. */
export async function liveBalatroStreams(
  logins: string[],
): Promise<LiveStream[]> {
  const wanted = [...new Set(logins.map((l) => l.toLowerCase()))].sort();
  if (!twitchConfigured() || wanted.length === 0) return [];
  const key = wanted.join(",");
  if (
    liveCache &&
    liveCache.key === key &&
    Date.now() - liveCache.at < LIVE_TTL
  )
    return liveCache.streams;
  try {
    const streams = balatroOnly(
      await helix<HelixStream>(
        `streams?${loginQuery("user_login", wanted)}&first=100`,
      ),
    );
    liveCache = { key, at: Date.now(), streams };
    return streams;
  } catch (e) {
    console.error("Twitch live check failed:", e);
    // Show what we knew last rather than nothing while Twitch has a hiccup.
    return liveCache?.key === key ? liveCache.streams : [];
  }
}

/** Twitch profile pictures by login (lower case); missing ones are left out. */
export async function twitchProfileImages(
  logins: string[],
): Promise<Record<string, string>> {
  const wanted = [...new Set(logins.map((l) => l.toLowerCase()))];
  if (!twitchConfigured()) return {};
  const stale = wanted.filter((l) => {
    const c = profileCache.get(l);
    return !c || Date.now() - c.at > PROFILE_TTL;
  });
  if (stale.length) {
    try {
      const users = await helix<{ login: string; profile_image_url: string }>(
        `users?${loginQuery("login", stale)}`,
      );
      for (const l of stale)
        profileCache.set(l, { at: Date.now(), image: null });
      for (const u of users)
        profileCache.set(u.login.toLowerCase(), {
          at: Date.now(),
          image: u.profile_image_url,
        });
    } catch (e) {
      console.error("Twitch profile lookup failed:", e);
    }
  }
  const out: Record<string, string> = {};
  for (const l of wanted) {
    const image = profileCache.get(l)?.image;
    if (image) out[l] = image;
  }
  return out;
}
