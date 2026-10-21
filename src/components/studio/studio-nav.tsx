"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const STUDIO = "/studio";

/** The studio's tabs; the current one is highlighted. */
export function StudioNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = [
    // Guides and tools are both made here, so it's "Create" rather than "Guides".
    {
      href: STUDIO,
      text: "Create",
      match: (p: string) => p === STUDIO || p.startsWith(`${STUDIO}/guides`),
    },
    { href: `${STUDIO}/tierlists`, text: "Tier lists" },
    ...(isAdmin
      ? [
          { href: `${STUDIO}/admin/requests`, text: "Requests" },
          { href: `${STUDIO}/admin/users`, text: "People" },
          { href: `${STUDIO}/admin/tierlists`, text: "Moderation" },
          { href: `${STUDIO}/admin/cards`, text: "Cards" },
          { href: `${STUDIO}/admin/import`, text: "Import" },
          { href: `${STUDIO}/admin/cleanup`, text: "Clean up" },
          { href: `${STUDIO}/admin/settings`, text: "Site" },
          { href: `${STUDIO}/admin/style`, text: "Style" },
        ]
      : []),
  ];
  return (
    <>
      {tabs.map((t) => {
        const active =
          "match" in t && t.match
            ? t.match(pathname)
            : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "font-medium text-fd-primary"
                : "text-fd-muted-foreground hover:text-fd-foreground"
            }
          >
            {t.text}
          </Link>
        );
      })}
    </>
  );
}
