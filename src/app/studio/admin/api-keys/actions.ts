"use server";

import { revalidatePath } from "next/cache";
import type { ApiScope } from "@/db/schema";
import { createApiKey, revokeApiKey } from "@/lib/api-keys";
import { assertUser } from "@/lib/auth";
import { API_SCOPES } from "@/lib/seed-lookups-shared";

export interface CreateKeyResult {
  ok: boolean;
  error?: string;
  /** The new key, shown once. */
  key?: string;
}

/** Makes an API key with the given scopes. Admins only. */
export async function createKey(
  name: string,
  scopes: string[],
): Promise<CreateKeyResult> {
  const admin = await assertUser("admin");
  const label = name.trim().slice(0, 80);
  if (!label) return { ok: false, error: "Give the key a name." };
  const valid = scopes.filter((s): s is ApiScope => s in API_SCOPES);
  if (valid.length === 0)
    return { ok: false, error: "Pick at least one thing the key may do." };
  const { key } = await createApiKey(label, valid, admin.id);
  revalidatePath("/studio/admin/api-keys");
  return { ok: true, key };
}

/** Revokes a key: it stops working at once. Admins only. */
export async function revokeKey(id: string): Promise<{ ok: boolean }> {
  await assertUser("admin");
  await revokeApiKey(id);
  revalidatePath("/studio/admin/api-keys");
  return { ok: true };
}
