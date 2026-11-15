/**
 * Turns one player's log from a balatromp.com match into a test fixture for blocks.test.ts:
 * the events "What did I block?" reads, without names, ids, the lobby code, timings, the Idol
 * rolls or the end-of-run deck.
 *
 *   npx tsx scripts/make-replay-fixture.ts <match link, id or saved file> <out.json> [player] "<source text>"
 *
 * `player` is the log's index (default: the first readable one). Check the output for names
 * before committing it: nothing a player typed should be in the repo.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { LogEvent } from "../src/lib/seed/blocks";
import {
  isReadable,
  type ReplayResponse,
  readReplay,
} from "../src/lib/seed/replay-file";

const [source, out, player, text] = process.argv.slice(2);
if (!source || !out) {
  console.error(
    'Usage: npx tsx scripts/make-replay-fixture.ts <match> <out.json> [player] "<source text>"',
  );
  process.exit(1);
}

/** Events the replay doesn't read, or that carry who played. */
const DROP = new Set([
  "match_manifest",
  "idol_roll",
  "hand_scored",
  "hand_result",
  "set_ante_key",
  "deck_snapshot",
  "chk",
  "life_lost",
  "round_dollars",
  "ready_blind",
  "end",
]);

const id = !existsSync(source) && /[0-9a-f-]{36}/i.exec(source)?.[0];
const data: ReplayResponse = id
  ? await (
      await fetch(`https://balatromp.com/api/proxy/runs/${id}/replay`)
    ).json()
  : JSON.parse(readFileSync(source, "utf8"));
const { logs } = await readReplay(data, async (b) =>
  gunzipSync(b).toString("utf8"),
);
const log =
  player !== undefined && player !== ""
    ? logs[Number(player)]
    : logs.find(isReadable);
if (!log?.events || !isReadable(log)) throw new Error("No readable log.");

const events: LogEvent[] = log.events
  .filter((e) => !DROP.has(e[1]))
  .map(([, op, args]) => {
    if (op !== "lobby_info") return [0, op, args];
    const l = args as {
      gamemode?: string;
      ruleset?: string;
      options?: { the_order_enabled?: boolean; mod_version?: string };
    };
    return [
      0,
      op,
      {
        gamemode: l.gamemode,
        ruleset: l.ruleset,
        options: {
          the_order_enabled: l.options?.the_order_enabled,
          mod_version: l.options?.mod_version,
        },
      },
    ];
  });
writeFileSync(
  out,
  JSON.stringify({ source: text ?? "A match log from balatromp.com.", events }),
);
console.log(`${out}: ${events.length} events`);
