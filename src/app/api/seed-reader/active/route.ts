import { NextResponse } from "next/server";
import { authorizeApiKey } from "@/lib/api-keys";
import { activeSeeds } from "@/lib/seed-lookups";
import { ACTIVE_MINUTES } from "@/lib/seed-lookups-shared";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * The seeds being read with the seed reader now: looked up in the last `minutes` (default 15,
 * at most 1440), grouped by seed. Needs an API key with the "seed-reader:read" scope:
 * Authorization: Bearer <key>.
 */
export async function GET(req: Request) {
  if (!(await authorizeApiKey(req, "seed-reader:read")))
    return NextResponse.json(
      { error: "A valid API key with the seed-reader:read scope is required." },
      { status: 401, headers: NO_STORE },
    );
  const minutes = Number(
    new URL(req.url).searchParams.get("minutes") ?? ACTIVE_MINUTES,
  );
  const seeds = await activeSeeds(
    Number.isFinite(minutes) ? minutes : ACTIVE_MINUTES,
  );
  return NextResponse.json({ minutes, seeds }, { headers: NO_STORE });
}
