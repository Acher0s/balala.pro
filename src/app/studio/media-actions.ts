"use server";

import { randomBytes } from "node:crypto";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { MAX_UPLOAD_BYTES, sniffImageType } from "@/lib/media";

/** Authors: upload an image or GIF. Returns the URL to use in a guide. */
export async function uploadMedia(
  formData: FormData,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const user = await assertUser("writer");
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file was sent." };
  if (file.size > MAX_UPLOAD_BYTES)
    return { ok: false, error: "Images can be at most 8 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = sniffImageType(bytes);
  if (!contentType)
    return {
      ok: false,
      error: "Only GIF, PNG, JPEG and WebP images can be uploaded.",
    };

  const id = randomBytes(9).toString("base64url");
  const db = await getDb();
  await db
    .insert(schema.media)
    .values({ id, ownerId: user.id, contentType, size: bytes.length, bytes });
  return { ok: true, url: `/media/${id}` };
}
