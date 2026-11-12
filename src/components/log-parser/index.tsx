import { listItemEntries } from "@/data/game";
import type { CardArt } from "./bmp/card-art";
import { LogParser as LogParserClient } from "./log-parser";

/** Game key ("j_mime", "v_overstock_norm") → name and picture, from this site's game data. */
function artFor(kind: "joker" | "voucher") {
  const out: Record<string, CardArt> = {};
  for (const [, item] of listItemEntries(kind))
    out[item.key] = { name: item.name, file: item.image };
  return out;
}

/** The 0.5.x Log Parser, for a tool page: <LogParser /> */
export function LogParser() {
  return (
    <LogParserClient
      art={{ jokers: artFor("joker"), vouchers: artFor("voucher") }}
    />
  );
}
