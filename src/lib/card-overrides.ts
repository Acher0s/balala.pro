import "server-only";
import { type CardOverride, setRuntimeOverrides } from "@/data/game";
import type { ItemKind } from "@/data/game-types";
import type { ItemOverride } from "@/data/overrides";
import { getDb, schema } from "@/db";

const state = globalThis as unknown as { bmpOverridesLoaded?: Promise<void> };

async function load() {
  const db = await getDb();
  const rows = await db.select().from(schema.cardOverrides);
  setRuntimeOverrides(
    rows.map(
      (r) =>
        ({
          kind: r.kind as ItemKind,
          id: r.itemId,
          data: r.data as ItemOverride,
        }) satisfies CardOverride,
    ),
  );
}

/** Loads the admin's card edits once per server process. Call before rendering cards. */
export function ensureCardOverrides() {
  state.bmpOverridesLoaded ??= load();
  return state.bmpOverridesLoaded;
}

/** Call after an admin changes a card so the next render picks it up. */
export async function reloadCardOverrides() {
  state.bmpOverridesLoaded = load();
  await state.bmpOverridesLoaded;
}
