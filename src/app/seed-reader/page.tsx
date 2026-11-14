import type { Metadata } from "next";
import { SeedReader } from "@/components/seed-reader";
import { SEED_READER } from "@/lib/site-tools";

export const metadata: Metadata = {
  title: SEED_READER.frontmatter.title,
  description: SEED_READER.frontmatter.description,
};

/** The seed reader, on its own page and the full width of the screen. */
export default function SeedReaderPage() {
  return (
    <main className="flex w-full flex-col gap-2 px-4 py-10 sm:px-6 lg:px-10">
      <h1 className="text-3xl font-bold">{SEED_READER.frontmatter.title}</h1>
      <p className="max-w-3xl text-fd-muted-foreground">
        Type a seed to see what it rolls in a ranked Multiplayer match with The
        Order: every shop slot, and each queue on its own. Each queue reads from
        the start of the game, as if nothing else had drawn from it.
      </p>
      <SeedReader />
    </main>
  );
}
