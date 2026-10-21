import type { Role } from "@/db/schema";

/**
 * What each role is called on the site. The stored role names ("writer" etc.) are internal;
 * people see "Author".
 */
export const ROLE_LABELS: Record<Role, string> = {
  none: "Member",
  writer: "Author",
  admin: "Admin",
};
