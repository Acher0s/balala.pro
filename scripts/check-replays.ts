/**
 * Replays match logs through "What did I block?" and prints how well the replay follows each
 * one: how many shop buys, pack cards, made consumables and made jokers were where the replay
 * put them, and where it first missed.
 *
 *   npx tsx scripts/check-replays.ts                       # the fixtures in src/lib/seed/fixtures
 *   npx tsx scripts/check-replays.ts <match link or id>…   # shared matches on balatromp.com
 *   npx tsx scripts/check-replays.ts <file.json>…          # a saved replay file or a fixture
 *   npx tsx scripts/check-replays.ts --trace <out dir> …   # also write each replay's trace
 *
 * A trace has every event, every roll the replay made (shops, packs, made cards with what was
 * held), every check ("ok" / "MISS") and every resync. Read it from the first MISS backwards.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  findBlocks,
  findBlocksMatch,
  type LogEvent,
  matchSettings,
} from "../src/lib/seed/blocks";
import type { ReaderSettings } from "../src/lib/seed/reader";
import {
  isReadable,
  type ReplayResponse,
  readReplay,
} from "../src/lib/seed/replay-file";

const args = process.argv.slice(2);
const traceAt = args.indexOf("--trace");
const traceDir = traceAt >= 0 ? args.splice(traceAt, 2)[1] : undefined;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const gunzip = async (b: Uint8Array) => gunzipSync(b).toString("utf8");

/** Each readable player log in a source, named for the output. */
async function load(source: string): Promise<[string, LogEvent[]][]> {
  let data:
    | ReplayResponse
    | { events: LogEvent[] }
    | { id: string; replay: ReplayResponse }[];
  const id = !existsSync(source) && UUID.exec(source)?.[0];
  if (id) {
    const res = await fetch(
      `https://balatromp.com/api/proxy/runs/${id}/replay`,
    );
    if (!res.ok) throw new Error(`${id}: ${res.status}`);
    data = (await res.json()) as ReplayResponse;
  } else data = JSON.parse(readFileSync(source, "utf8"));
  const name = id ? id.slice(0, 8) : basename(source, ".json");
  // Many matches in one file: [{ id, replay }], as the console script in the skill saves them.
  if (Array.isArray(data)) {
    const all: [string, LogEvent[]][] = [];
    for (const m of data) {
      const { logs } = await readReplay(m.replay, gunzip);
      logs.forEach((l, i) => {
        if (isReadable(l) && l.events)
          all.push([`${m.id.slice(0, 8)}#${i}`, l.events]);
      });
    }
    return all;
  }
  if ("events" in data) return [[name, data.events]];
  const { logs } = await readReplay(data, gunzip);
  return logs.flatMap((l, i) =>
    isReadable(l) && l.events
      ? [[`${name}#${i}`, l.events] as [string, LogEvent[]]]
      : [],
  );
}

const fixtures = join(import.meta.dirname, "../src/lib/seed/fixtures");
const sources = args.length
  ? args
  : readdirSync(fixtures)
      .filter((f) => f.endsWith("-log.json"))
      .map((f) => join(fixtures, f));

const f = (x: { matched: number; checked: number }) =>
  `${x.matched}/${x.checked}`;

for (const source of sources) {
  // The logs of one match ("<id>#<player>") are replayed together: they share the lobby
  // avatars (a 1.0.5 bug), which are worked out first; the trace replays with them.
  const byMatch = new Map<string, [string, LogEvent[]][]>();
  for (const [name, events] of await load(source)) {
    const id = name.split("#")[0];
    byMatch.set(id, [...(byMatch.get(id) ?? []), [name, events]]);
  }
  for (const logs of byMatch.values()) {
    const ready: {
      name: string;
      events: LogEvent[];
      settings: ReaderSettings;
    }[] = [];
    for (const [name, events] of logs) {
      const read = matchSettings(events);
      if (read.ok) ready.push({ name, events, settings: read.settings });
      else console.log(`${name}: ${read.error}`);
    }
    const reports = findBlocksMatch(ready);
    ready.forEach(({ name, events, settings: s }, i) => {
      const avatars = reports[i].avatars;
      const lines: string[] = [];
      const { agreement: a, firstMiss } = findBlocks(
        events,
        s,
        traceDir ? (l) => lines.push(l) : undefined,
        undefined,
        avatars,
      );
      if (traceDir)
        writeFileSync(
          join(traceDir, `${name}.txt`),
          lines.join(String.fromCharCode(10)),
        );
      console.log(
        `${name.padEnd(22)} ${s.seed} deck ${s.deck ?? "-"} stake ${s.stake}  shop ${f(a.shop)}  packs ${f(a.packs)}  made ${f(a.made)}  jokers ${f(a.jokers)}  first miss: ${firstMiss ?? "none"}${avatars.length ? `  avatars: ${avatars.map((v) => v.key).join(", ")} from #${avatars[0].from}` : ""}`,
      );
    });
  }
}
