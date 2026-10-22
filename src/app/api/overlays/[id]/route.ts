import { NextResponse } from "next/server";
import { cardSettings, getOverlay } from "@/lib/overlays";

/**
 * A running overlay's settings, which it checks now and then so changes reach the stream without
 * reloading the browser source. Like the overlay page, the id in the link is the only key.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/overlays/[id]">,
) {
  const { id } = await params;
  const overlay = await getOverlay(id);
  if (!overlay)
    return NextResponse.json(
      { error: "No such overlay" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  return NextResponse.json(
    { settings: cardSettings(overlay) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
