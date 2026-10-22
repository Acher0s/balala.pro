import "server-only";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import {
  type CategorySettings,
  categoriesSchema,
  DEFAULT_CATEGORIES,
} from "@/lib/categories";
import { DEFAULT_THEME, type SiteTheme, siteThemeSchema } from "@/lib/theme";

export interface SiteSettings {
  siteName: string;
  homeIntro: string;
  /** Shown in a box at the top of the home page, in guide markup. Empty = no announcement. */
  announcement: string;
  /** The line under the title of the Guides page. Empty hides it. */
  guidesIntro: string;
  /** The line under the title of the Tools page. Empty hides it. */
  toolsIntro: string;
}

export const DEFAULT_SETTINGS: SiteSettings = {
  siteName: "BMP University",
  homeIntro:
    "Guides for Balatro Multiplayer, with calculators you can use right on the page.",
  announcement: "",
  guidesIntro:
    "Strategy guides for Balatro Multiplayer, from the basics to advanced maths.",
  toolsIntro: "Calculators you can use while you play.",
};

/** Text from Studio → Site as a guide-markup document, so it gets the same validation and rendering. */
export function siteTextSource(text: string) {
  return `---
title: Site text
---

${text}
`;
}

const NOT_PLAIN_TEXT = /^(\s|[-*+>|<#]|\d+\.\s|$)/;

/**
 * The home intro is typed like a normal text box, so a line break should stay a line break
 * (Markdown would join the lines). Lists, headings and the like are left alone.
 */
export function introMarkup(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  return lines
    .map((line, i) => {
      const next = lines[i + 1];
      return next !== undefined &&
        !NOT_PLAIN_TEXT.test(line) &&
        !NOT_PLAIN_TEXT.test(next)
        ? `${line}<br />`
        : line;
    })
    .join("\n");
}

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

const THEME_KEY = "theme";
const themeCache = globalThis as unknown as { bmpTheme?: SiteTheme };

/**
 * The site's theme (Studio → Style), kept in memory because every page needs it. Falls back to
 * the default look if none is saved or the database can't be reached.
 */
export async function getTheme(): Promise<SiteTheme> {
  if (themeCache.bmpTheme) return themeCache.bmpTheme;
  try {
    const db = await getDb();
    const [row] = await db
      .select()
      .from(schema.siteSettings)
      .where(eq(schema.siteSettings.key, THEME_KEY));
    const parsed = siteThemeSchema.safeParse(row?.value);
    themeCache.bmpTheme = parsed.success ? parsed.data : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
  return themeCache.bmpTheme;
}

export async function saveTheme(theme: SiteTheme) {
  const db = await getDb();
  await db
    .insert(schema.siteSettings)
    .values({ key: THEME_KEY, value: theme })
    .onConflictDoUpdate({
      target: schema.siteSettings.key,
      set: { value: theme },
    });
  themeCache.bmpTheme = theme;
}

const CATEGORIES_KEY = "categories";

/** How the Guides and Tools pages are grouped (Studio → Site → Categories). */
export async function getCategories(): Promise<CategorySettings> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.siteSettings)
    .where(eq(schema.siteSettings.key, CATEGORIES_KEY));
  const parsed = categoriesSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : DEFAULT_CATEGORIES;
}

export async function saveCategories(value: CategorySettings) {
  const db = await getDb();
  await db
    .insert(schema.siteSettings)
    .values({ key: CATEGORIES_KEY, value })
    .onConflictDoUpdate({ target: schema.siteSettings.key, set: { value } });
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
