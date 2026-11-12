import type { Frontmatter } from "@/lib/mdx/compile";

/**
 * Tools that are pages of the site itself rather than written in the Studio. They're listed on
 * the Tools page with the others, but can't be embedded in guides.
 */
export interface SiteTool {
  href: string;
  frontmatter: Frontmatter;
}

export const LOG_PARSER: SiteTool = {
  href: "/log-parser",
  frontmatter: {
    title: "Log parser (0.5.x)",
    description:
      "See your Balatro Multiplayer games from a 0.5.x Lovely log, shop by shop and blind by blind.",
    tags: ["tool", "multiplayer"],
    icon: ["joker:the_order"],
  },
};

export const SITE_TOOLS: SiteTool[] = [LOG_PARSER];
