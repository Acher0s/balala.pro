import type { Metadata } from "next";
import { BlockCheck } from "@/components/block-check";
import { BLOCK_CHECK } from "@/lib/site-tools";
import { getSiteTool } from "@/lib/site-tools-settings";

export async function generateMetadata(): Promise<Metadata> {
  const { frontmatter } = await getSiteTool(BLOCK_CHECK.href);
  return { title: frontmatter.title, description: frontmatter.description };
}

/** What each player of a shared match blocked, on its own page. */
export default function BlockCheckPage() {
  return (
    <main className="flex w-full flex-col gap-2 px-4 py-10 sm:px-6 lg:px-10">
      <h1 className="text-3xl font-bold">{BLOCK_CHECK.frontmatter.title}</h1>
      <p className="max-w-3xl text-fd-muted-foreground">
        Every joker, consumable and voucher a player's rolls skipped: because
        they already had it, or because it wasn't unlocked yet.
      </p>
      <BlockCheck />
    </main>
  );
}
