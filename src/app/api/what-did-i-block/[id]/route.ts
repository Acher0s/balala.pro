import { gunzipSync } from "node:zlib";
import { NextResponse } from "next/server";
import { type ReplayResponse, readReplay } from "@/lib/seed/replay-file";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A match's replay logs from balatromp.com, unpacked: each player's events. A player who
 * hasn't shared their log (they click "Share" on the match page first) comes back cut down to
 * the blinds they played; the page shows that as not shared.
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
  const out = await readReplay(data, async (bytes) =>
    gunzipSync(bytes).toString("utf8"),
  );
  return NextResponse.json(out, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
