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

export const SEED_READER: SiteTool = {
  href: "/seed-reader",
  frontmatter: {
    title: "Seed reader",
    description:
      "Enter a seed and see every shop slot and every joker, consumable, voucher and tag queue it rolls with The Order.",
    tags: ["tool", "multiplayer"],
    icon: ["voucher:crystal_ball"],
  },
};

export const BLOCK_CHECK: SiteTool = {
  href: "/what-did-i-block",
  frontmatter: {
    title: "What did I block?",
    description:
      "Paste a shared match link and see every joker, consumable and voucher each player's rolls skipped because they had it, or because it wasn't unlocked yet.",
    tags: ["tool", "multiplayer"],
    icon: ["joker:ring_master"],
  },
};

export const SITE_TOOLS: SiteTool[] = [SEED_READER, BLOCK_CHECK, LOG_PARSER];
