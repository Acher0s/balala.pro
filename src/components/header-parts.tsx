"use client";

import { FullSearchTrigger } from "fumadocs-ui/layouts/shared/slots/search-trigger";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface HeaderTab {
  text: string;
  url: string;
}

/** Desktop: the site sections, right after the site name. (Phones get them in the menu.) */
export function HeaderTabs({ tabs }: { tabs: HeaderTab[] }) {
  const pathname = usePathname();
  return (
    <nav className="ms-6 flex items-center gap-5 text-sm max-lg:hidden">
      {tabs.map((tab) => {
        const active =
          pathname === tab.url || pathname.startsWith(`${tab.url}/`);
        return (
          <Link
            key={tab.url}
            href={tab.url}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap transition-colors hover:text-fd-accent-foreground ${
              active
                ? "font-medium text-fd-primary"
                : "text-fd-muted-foreground"
            }`}
          >
            {tab.text}
          </Link>
        );
      })}
    </nav>
  );
}

/** Desktop search box, placed on the right of the header. */
export function HeaderSearch() {
  return (
    <FullSearchTrigger hideIfDisabled className="w-56 ps-2.5 max-lg:hidden" />
  );
}

/** Replaces the layout's own (centred) desktop search box. */
export function NoSearch() {
  return null;
}
