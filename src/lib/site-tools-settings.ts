import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { SITE_TOOLS, type SiteTool } from "@/lib/site-tools";

const KEY = "siteTools";

/** What admins can change about a built-in tool (Studio → Site → Built-in tools). */
export const siteToolOverrideSchema = z.object({
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  icon: z.array(z.string()).optional(),
});
export type SiteToolOverride = z.infer<typeof siteToolOverrideSchema>;
const overridesSchema = z.record(z.string(), siteToolOverrideSchema);

async function getOverrides(): Promise<Record<string, SiteToolOverride>> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.siteSettings)
    .where(eq(schema.siteSettings.key, KEY));
  const parsed = overridesSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : {};
}

function apply(tool: SiteTool, o: SiteToolOverride | undefined): SiteTool {
  if (!o) return tool;
  return {
    ...tool,
    frontmatter: {
      ...tool.frontmatter,
      ...(o.description !== undefined && { description: o.description }),
      ...(o.tags && { tags: o.tags }),
      ...(o.icon && { icon: o.icon }),
    },
  };
}

/** The built-in tools with the description, tags and banner cards set in the Studio. */
export async function getSiteTools(): Promise<SiteTool[]> {
  const overrides = await getOverrides();
  return SITE_TOOLS.map((t) => apply(t, overrides[t.href]));
}

export async function getSiteTool(href: string): Promise<SiteTool> {
  const tool = SITE_TOOLS.find((t) => t.href === href);
  if (!tool) throw new Error(`Unknown site tool ${href}`);
  return apply(tool, (await getOverrides())[href]);
}

export async function saveSiteToolOverride(
  href: string,
  value: SiteToolOverride,
) {
  const overrides = { ...(await getOverrides()), [href]: value };
  const db = await getDb();
  await db
    .insert(schema.siteSettings)
    .values({ key: KEY, value: overrides })
    .onConflictDoUpdate({
      target: schema.siteSettings.key,
      set: { value: overrides },
    });
}
