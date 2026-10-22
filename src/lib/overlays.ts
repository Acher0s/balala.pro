import "server-only";
import { randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { OverlayRow } from "@/db/schema";
import {
  DEFAULT_FALLING,
  type FallingSettings,
  fallingSchema,
} from "@/lib/falling";

/**
 * Stream overlays: pages made to be added to OBS (or similar) as a browser source. Making one
 * needs an account; the overlay itself is opened by its link, as OBS isn't signed in, so the id
 * in the link is long and random.
 *
 * They cost the site little: OBS loads the page and the card images once (the images are static
 * and cached), then checks for changed settings once a minute. All drawing happens on the
 * streamer's own computer.
 */

/** Overlays one account can have. */
export const OVERLAY_LIMIT = 10;
/** How often a running overlay checks for changed settings, in ms. */
export const OVERLAY_REFRESH = 60_000;

export function newOverlayId() {
  return randomBytes(16).toString("base64url");
}

/** The settings of a card background overlay; old or broken settings fall back to defaults. */
export function cardSettings(
  row: Pick<OverlayRow, "settings">,
): FallingSettings {
  const parsed = fallingSchema.safeParse(row.settings);
  return { ...(parsed.success ? parsed.data : DEFAULT_FALLING), enabled: true };
}

/** What a new overlay starts as. */
export const DEFAULT_OVERLAY: FallingSettings = {
  ...DEFAULT_FALLING,
  enabled: true,
  // On a stream the cards are the point, not a faint background.
  opacity: 1,
};

export async function getOverlay(id: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.overlays)
    .where(eq(schema.overlays.id, id))
    .limit(1);
  return row ?? null;
}

export async function listOwnOverlays(userId: string) {
  const db = await getDb();
  return db
    .select()
    .from(schema.overlays)
    .where(eq(schema.overlays.ownerId, userId))
    .orderBy(desc(schema.overlays.updatedAt));
}
