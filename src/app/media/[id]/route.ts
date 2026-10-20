import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

/** Serves an uploaded image. Ids never change, so it can be cached forever. */
export async function GET(
  _req: Request,
  { params }: RouteContext<"/media/[id]">,
) {
  const { id } = await params;
  if (!/^[\w-]{1,30}$/.test(id)) return new Response(null, { status: 404 });
  const db = await getDb();
  const [file] = await db
    .select()
    .from(schema.media)
    .where(eq(schema.media.id, id))
    .limit(1);
  if (!file) return new Response(null, { status: 404 });
  return new Response(Buffer.from(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      // Only ever an image: never sniffed or run as anything else.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
