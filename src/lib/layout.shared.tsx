import type { BaseLayoutProps, LinkItemType } from "fumadocs-ui/layouts/shared";
import { AccountMenu } from "@/components/account-menu";
import {
  HeaderSearch,
  type HeaderTab,
  HeaderTabs,
  NoSearch,
} from "@/components/header-parts";
import type { User } from "@/db/schema";

/**
 * Shared header for the public site:
 *   site name · Guides  Tools  Tier lists (Studio  Documentation)          [search] account ☀
 * On phones the sections move into the menu.
 */
export function baseOptions(
  siteName: string,
  user: User | null,
): BaseLayoutProps {
  const isWriter = user?.role === "writer" || user?.role === "admin";
  const tabs: HeaderTab[] = [
    { text: "Guides", url: "/guides" },
    { text: "Tools", url: "/tools" },
    { text: "Tier lists", url: "/tierlists" },
    ...(isWriter
      ? [
          { text: "Studio", url: "/studio" },
          { text: "Documentation", url: "/docs" },
        ]
      : []),
  ];

  const links: LinkItemType[] = [
    // Phones: the sections live in the menu (desktop shows them next to the site name).
    ...tabs.map(
      (t): LinkItemType => ({
        type: "main",
        text: t.text,
        url: t.url,
        active: "nested-url",
        on: "menu",
      }),
    ),
    { type: "custom", secondary: true, on: "nav", children: <HeaderSearch /> },
    {
      type: "custom",
      secondary: true,
      children: (
        <AccountMenu
          user={
            user && {
              displayName: user.displayName,
              avatarUrl: user.avatarUrl,
              role: user.role,
            }
          }
        />
      ),
    },
  ];

  return {
    nav: {
      // nowrap: the header has little room at medium widths, and a wrapped name looks broken.
      title: <span className="whitespace-nowrap">{siteName}</span>,
      children: <HeaderTabs tabs={tabs} />,
    },
    // The layout's own search box sits in the middle; ours is on the right (HeaderSearch).
    searchToggle: { components: { lg: <NoSearch /> } },
    links,
  };
}
