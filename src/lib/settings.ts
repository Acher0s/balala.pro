import "server-only";
import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";

export interface SiteSettings {
  siteName: string;
  homeIntro: string;
}

export const DEFAULT_SETTINGS: SiteSettings = {
  siteName: "BMP University",
  homeIntro:
    "Guides for Balatro Multiplayer, with calculators you can use right on the page.",
};

export async function getSettings(): Promise<SiteSettings> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.siteSettings)
    .where(inArray(schema.siteSettings.key, Object.keys(DEFAULT_SETTINGS)));
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (typeof r.value === "string") out[r.key as keyof SiteSettings] = r.value;
  }
  return out;
}

export async function saveSettings(values: SiteSettings) {
  const db = await getDb();
  for (const [key, value] of Object.entries(values)) {
    await db
      .insert(schema.siteSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: schema.siteSettings.key, set: { value } });
  }
}
