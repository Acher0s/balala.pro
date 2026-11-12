import type { Metadata } from "next";
import { LogParser } from "@/components/log-parser";
import { LOG_PARSER } from "@/lib/site-tools";

export const metadata: Metadata = {
  title: LOG_PARSER.frontmatter.title,
  description: LOG_PARSER.frontmatter.description,
};

/** The 0.5.x Log Parser, on its own page and the full width of the screen. */
export default function LogParserPage() {
  return (
    <main className="flex w-full flex-col gap-2 px-4 py-10 sm:px-6 lg:px-10">
      <h1 className="text-3xl font-bold">{LOG_PARSER.frontmatter.title}</h1>
      <p className="max-w-3xl text-fd-muted-foreground">
        Drop in a Lovely log from a game played on the 0.5.x Multiplayer mod (up
        to 0.5.5) to see every multiplayer game in it: your jokers and vouchers,
        what you spent in the shops, the PvP blinds, both decks and The Idol's
        rolls. Your logs are in{" "}
        <code className="rounded bg-fd-muted px-1 text-sm">
          %AppData%\Balatro\Mods\lovely\log
        </code>{" "}
        on Windows.
      </p>
      <LogParser />
      <p className="text-xs text-fd-muted-foreground">
        This parser was made by the Balatro Multiplayer team and is used here
        with their permission.
      </p>
    </main>
  );
}
