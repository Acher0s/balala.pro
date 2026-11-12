import { baseCardImage, listItemEntries, listPlayingCards } from "@/data/game";
import type { CardArt, PlayingCardArt } from "./bmp/card-art";
import { LogParser as LogParserClient } from "./log-parser";

/** Game key ("j_mime", "v_overstock_norm") → name and picture, from this site's game data. */
function artFor(kind: "joker" | "voucher") {
  const out: Record<string, CardArt> = {};
  for (const [, item] of listItemEntries(kind))
    out[item.key] = { name: item.name, file: item.image };
  return out;
}

/** Playing card fronts, enhancements and seals, keyed as the game (and the logs) name them. */
function playingCardArt(): PlayingCardArt {
  return {
    base: baseCardImage,
    fronts: Object.fromEntries(
      listPlayingCards().map(([key, card]) => [key, card.image]),
    ),
    enhancements: Object.fromEntries(
      listItemEntries("enhancement")
        .filter(([, e]) => e.source === "vanilla")
        .map(([, e]) => [e.key, e.image]),
    ),
    seals: Object.fromEntries(
      listItemEntries("seal").flatMap(([, s]) =>
        s.overlay ? [[s.key, s.overlay]] : [],
      ),
    ),
  };
}

/** The 0.5.x Log Parser (on its own page, /log-parser). */
export function LogParser() {
  return (
    <LogParserClient
      art={{
        jokers: artFor("joker"),
        vouchers: artFor("voucher"),
        playingCards: playingCardArt(),
      }}
    />
  );
}
