import type { Metadata } from "next";
import { LogParser } from "@/components/log-parser";
import { LOG_PARSER } from "@/lib/site-tools";
import { getSiteTool } from "@/lib/site-tools-settings";

export async function generateMetadata(): Promise<Metadata> {
  const { frontmatter } = await getSiteTool(LOG_PARSER.href);
  return { title: frontmatter.title, description: frontmatter.description };
}

/** The 0.5.x Log Parser, on its own page and the full width of the screen. */
export default function LogParserPage() {
  return (
    <main className="flex w-full flex-col gap-2 px-4 py-10 sm:px-6 lg:px-10">
      <h1 className="text-3xl font-bold">{LOG_PARSER.frontmatter.title}</h1>
      <p className="max-w-3xl text-fd-muted-foreground">
        Legacy Log Parser. Drop in a Lovely log from a game played on the 0.5.x
        Multiplayer mod. I'm technically breaking licence by having it ported to
        this website, so if any devs see this and want it removed, feel free to
        reach out.
      </p>
      <LogParser />
      <p className="text-xs text-fd-muted-foreground">
        This parser was made by the Balatro Multiplayer team.
      </p>
    </main>
  );
}
