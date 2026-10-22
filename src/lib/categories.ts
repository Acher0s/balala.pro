import { z } from "zod";

/**
 * How the Guides and Tools pages are grouped (Studio → Site). Each category collects pages with any
 * of its tags; a page goes in the first category it matches, top to bottom. Pages that match none
 * go under `othersName` (or without a heading if that's empty).
 */
export const categoriesSchema = z.object({
  categories: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        tags: z.array(z.string().trim().min(1).max(40)).min(1).max(30),
      }),
    )
    .max(30),
  othersName: z.string().trim().max(60),
});

export type CategorySettings = z.infer<typeof categoriesSchema>;

/** No categories: the pages are grouped by their section, as before categories existed. */
export const DEFAULT_CATEGORIES: CategorySettings = {
  categories: [],
  othersName: "Others",
};

/** Tags compare without case or extra spaces: "White Stake" matches "white stake". */
export const normalizeTag = (tag: string) =>
  tag.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Groups pages into the configured categories, in their order, followed by the catch-all. Empty
 * groups are left out.
 */
export function groupByCategory<T extends { tags: string[] }>(
  pages: T[],
  settings: CategorySettings,
): { name: string; pages: T[] }[] {
  const groups = settings.categories.map((c) => ({
    name: c.name,
    tags: new Set(c.tags.map(normalizeTag)),
    pages: [] as T[],
  }));
  const others: T[] = [];
  for (const page of pages) {
    const tags = page.tags.map(normalizeTag);
    const group = groups.find((g) => tags.some((t) => g.tags.has(t)));
    (group ? group.pages : others).push(page);
  }
  return [
    ...groups.map(({ name, pages }) => ({ name, pages })),
    { name: settings.othersName, pages: others },
  ].filter((g) => g.pages.length > 0);
}
