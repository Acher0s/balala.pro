import { NextResponse } from "next/server";
import { authorizeApiKey } from "@/lib/api-keys";
import { lookupHistory } from "@/lib/seed-lookups";

const NO_STORE = { "Cache-Control": "no-store" };

function date(value: string | null): Date | undefined | null {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The seed reader's lookup history, newest first. Needs an API key with the
 * "seed-reader:read" scope: Authorization: Bearer <key>.
 *
 * Query: seed (one seed), since / before (ISO times), limit (1–500, default 100).
 */
export async function GET(req: Request) {
  if (!(await authorizeApiKey(req, "seed-reader:read")))
    return NextResponse.json(
      { error: "A valid API key with the seed-reader:read scope is required." },
      { status: 401, headers: NO_STORE },
    );
  const q = new URL(req.url).searchParams;
  const since = date(q.get("since"));
  const before = date(q.get("before"));
  if (since === null || before === null)
    return NextResponse.json(
      { error: "since and before must be ISO dates." },
      { status: 400, headers: NO_STORE },
    );
  const limit = Number(q.get("limit") ?? 100);
  const lookups = await lookupHistory({
    seed: q.get("seed") ?? undefined,
    since,
    before,
    limit: Number.isFinite(limit) ? limit : 100,
  });
  return NextResponse.json({ lookups }, { headers: NO_STORE });
}
