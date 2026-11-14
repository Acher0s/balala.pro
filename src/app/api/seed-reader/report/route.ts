import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { clientIp, recordLookup } from "@/lib/seed-lookups";
import { seedLookupInput } from "@/lib/seed-lookups-shared";

/**
 * The seed reader reports each seed it reads here (see components/seed-reader). Anyone can
 * report; the signed-in user, if any, and a salted hash of the IP are logged with it.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const parsed = seedLookupInput.safeParse(body);
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const user = await getCurrentUser();
  const result = await recordLookup(parsed.data, {
    userId: user?.id ?? null,
    ip: clientIp(req.headers),
  });
  return new NextResponse(null, {
    status: result === "rate-limited" ? 429 : 204,
  });
}
