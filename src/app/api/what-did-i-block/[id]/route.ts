import { gunzipSync } from "node:zlib";
import { NextResponse } from "next/server";
import type { MatchPlayerLog } from "@/lib/seed/blocks";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ReplayResponse {
  run?: { status?: string; modId?: string };
  logs?: {
    displayName?: string;
    shared?: boolean;
    status?: string;
    compressedEvents?: string | null;
  }[];
}

/**
 * A match's replay logs from balatromp.com, unpacked: each player's events, or null where that
 * player hasn't shared their log (they click "Share" on the match page first).
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/what-did-i-block/[id]">,
) {
  const { id } = await params;
  if (!UUID.test(id))
    return NextResponse.json(
      { error: "That isn't a match link." },
      { status: 400 },
    );
  let res: Response;
  try {
    res = await fetch(`https://balatromp.com/api/proxy/runs/${id}/replay`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });
  } catch {
    return NextResponse.json(
      { error: "balatromp.com couldn't be reached." },
      { status: 502 },
    );
  }
  if (res.status === 404)
    return NextResponse.json(
      { error: "No match with that link." },
      { status: 404 },
    );
  if (!res.ok)
    return NextResponse.json(
      {
        error:
          "balatromp.com didn't give out this match. If it's yours, click Share on the match page first.",
      },
      { status: res.status === 403 || res.status === 401 ? 403 : 502 },
    );
  const data = (await res.json()) as ReplayResponse;
  const logs: MatchPlayerLog[] = (data.logs ?? []).map((l) => {
    let events: MatchPlayerLog["events"] = null;
    if (l.compressedEvents)
      try {
        events = JSON.parse(
          gunzipSync(Buffer.from(l.compressedEvents, "base64")).toString(
            "utf8",
          ),
        );
      } catch {
        events = null;
      }
    return {
      name: l.displayName ?? "Player",
      shared: l.shared ?? false,
      events,
    };
  });
  return NextResponse.json(
    { status: data.run?.status ?? "unknown", logs },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
