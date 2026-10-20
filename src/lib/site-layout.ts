import "server-only";
import { getCurrentUser } from "@/lib/auth";
import { baseOptions } from "@/lib/layout.shared";
import { getSettings } from "@/lib/settings";

/** Header options for public layouts: the site name and the signed-in user's menu. */
export async function siteLayoutOptions() {
  const [settings, user] = await Promise.all([getSettings(), getCurrentUser()]);
  return baseOptions(settings.siteName, user);
}
