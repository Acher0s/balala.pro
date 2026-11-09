import { NextResponse } from "next/server";
import { listCreators } from "@/lib/creators";
import { liveBalatroStreams } from "@/lib/twitch";

/**
 * Which listed creators are live in the Balatro category, for the Creators page to refresh its
 * stream player. Twitch itself is asked at most once a minute (see lib/twitch).
 */
export async function GET() {
  const creators = await listCreators();
  const streams = await liveBalatroStreams(
    creators.flatMap((c) => (c.twitch ? [c.twitch] : [])),
  );
  return NextResponse.json(
    { streams },
    { headers: { "Cache-Control": "no-store" } },
  );
}
