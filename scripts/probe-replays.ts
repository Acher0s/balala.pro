/**
 * Finds where a draw the replay doesn't make happened. For each log's first miss on a queue,
 * it reruns the replay with one or two extra draws on a stream before each event since the
 * last good check of that queue, and prints the spots that give the most checks without a
 * miss. A clear winner points at the event (and so the card or rule) the replay is missing.
 *
 *   npx tsx scripts/probe-replays.ts <file or match>… [--family Tarot|Planet|Spectral|joker] [--from-start]
 *
 * Sources are what check-replays.ts takes (a saved replay, a fixture, an array of
 * { id, replay } from the console script). --from-start searches from the first event instead
 * of the last good check (slower; for queues that are rarely checked, like Uncommon jokers).
 */

import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  findBlocks,
  type LogEvent,
  matchSettings,
} from "../src/lib/seed/blocks";
import {
  isReadable,
  type ReplayResponse,
  readReplay,
} from "../src/lib/seed/replay-file";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args.splice(at, 2)[1] : undefined;
};
const family = flag("--family") ?? "Tarot";
const fromStart = args.includes("--from-start");
const sources = args.filter((a) => a !== "--from-start");

const STREAMS: Record<string, string[]> = {
  Tarot: ["TarotTarot0"],
  Planet: ["PlanetPlanet0"],
  Spectral: ["SpectralSpectral0"],
  joker: [
    ...[1, 2, 3].flatMap((r) => [
      `Joker${r}0`,
      `Joker${r}0_sticker`,
      `_etperJoker${r}0`,
    ]),
    "rarity0",
    "cdt0",
  ],
};
const QUIET = new Set([
  "money_delta",
  "hand_scored",
  "hand_result",
  "idol_roll",
  "set_ante_key",
]);

async function load(source: string): Promise<[string, LogEvent[]][]> {
  const id =
    !existsSync(source) &&
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(
      source,
    )?.[0];
  const data = id
    ? await (
        await fetch(`https://balatromp.com/api/proxy/runs/${id}/replay`)
      ).json()
    : JSON.parse(readFileSync(source, "utf8"));
  const gunzip = async (b: Uint8Array) => gunzipSync(b).toString("utf8");
  const many: { id: string; replay: ReplayResponse }[] = Array.isArray(data)
    ? data
    : "events" in data
      ? []
      : [{ id: id || basename(source, ".json"), replay: data }];
  if (!Array.isArray(data) && "events" in data) return [[source, data.events]];
  const out: [string, LogEvent[]][] = [];
  for (const m of many) {
    const { logs } = await readReplay(m.replay, gunzip);
    logs.forEach((l, i) => {
      if (isReadable(l) && l.events)
        out.push([`${m.id.slice(0, 8)}#${i}`, l.events]);
    });
  }
  return out;
}

for (const source of sources)
  for (const [name, events] of await load(source)) {
    const read = matchSettings(events);
    if (!read.ok) continue;
    const run = (probe?: { at: number; stream: string; n: number }) => {
      const lines: string[] = [];
      findBlocks(events, read.settings, (l) => lines.push(l), probe);
      return lines;
    };
    const ok = `check ${family}: ok`;
    const miss = `check ${family}: MISS`;
    const score = (lines: string[]) =>
      lines.reduce(
        (n, l) => n + (l.includes(ok) ? 1 : l.includes(miss) ? -3 : 0),
        0,
      );
    const base = run();
    const mi = base.findIndex((l) => l.includes(miss));
    if (mi < 0) continue;
    let from = 0;
    if (!fromStart)
      for (let i = mi - 1; i >= 0; i--)
        if (base[i].includes(ok)) {
          from = i;
          break;
        }
    const at = (l: string) => Number(l.slice(1, l.indexOf(" ")));
    const missEvent = base
      .slice(0, mi)
      .reverse()
      .find((l) => l.startsWith("#"));
    const candidates = base
      .slice(from, mi)
      .filter((l) => l.startsWith("#"))
      .map(at)
      .filter((i) => !QUIET.has(events[i][1]));
    if (missEvent) candidates.push(at(missEvent));
    const b0 = score(base);
    let best = { score: b0, stream: "", n: 0, at: [] as number[] };
    for (const stream of STREAMS[family] ?? [family])
      for (const n of [1, 2])
        for (const i of new Set(candidates)) {
          const sc = score(run({ at: i, stream, n }));
          if (sc > best.score) best = { score: sc, stream, n, at: [i] };
          else if (sc === best.score && best.stream === stream && best.n === n)
            best.at.push(i);
        }
    console.log(
      `${name}: first ${family} miss at ${missEvent?.slice(0, 60)}; score ${b0}${
        best.at.length
          ? ` → ${best.score} with ${best.n} more on ${best.stream} before ${best.at
              .map((i) => `#${i} ${events[i][1]}`)
              .join(", ")}`
          : " (no single extra draw helps)"
      }`,
    );
  }
