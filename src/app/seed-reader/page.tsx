import type { Metadata } from "next";
import { SeedReader } from "@/components/seed-reader";
import { SEED_READER } from "@/lib/site-tools";
import { getSiteTool } from "@/lib/site-tools-settings";

export async function generateMetadata(): Promise<Metadata> {
  const { frontmatter } = await getSiteTool(SEED_READER.href);
  return { title: frontmatter.title, description: frontmatter.description };
}

/** The seed reader, on its own page and the full width of the screen. */
export default function SeedReaderPage() {
  return (
    <main className="flex w-full flex-col gap-2 px-4 py-10 sm:px-6 lg:px-10">
      <h1 className="text-3xl font-bold">{SEED_READER.frontmatter.title}</h1>
      <p className="max-w-3xl text-fd-muted-foreground">
        BMP seed reader! Pick your ruleset, deck & stake and read the seed.
      </p>
      <SeedReader />
    </main>
  );
}
