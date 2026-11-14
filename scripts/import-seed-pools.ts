/**
 * Imports the game's item pools, in the order its RNG walks them, for the seed reader.
 *
 *   npm run import-seed-pools                         # default Steam location
 *   npm run import-seed-pools -- "D:\Games\Balatro\Balatro.exe"
 *
 * Writes src/lib/seed/pools.generated.json. Balatro sorts every pool by each item's `order`
 * (Game:init_item_prototypes), and a seed picks an index into that sorted list, so the order
 * here is what decides which card a seed gives. Only the vanilla game is read: the mod's
 * own additions and bans live in src/lib/seed/rulesets.ts.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SeedPools } from "../src/lib/seed/pool-types.ts";
import { type LuaValue, parseAssignedTable } from "./lib/lua.ts";
import { readZip } from "./lib/zip.ts";

const DEFAULT_EXE =
  "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Balatro\\Balatro.exe";
const exePath = process.argv[2] ?? DEFAULT_EXE;
if (!existsSync(exePath)) {
  console.error(
    `Balatro.exe not found at "${exePath}". Pass its path: npm run import-seed-pools -- "<path to Balatro.exe>"`,
  );
  process.exit(1);
}

const zip = readZip(readFileSync(exePath));
const text = (name: string) => {
  const file = zip.get(name);
  if (!file) throw new Error(`${name} is missing from the game archive`);
  return file().toString("utf8");
};
const gameLua = text("game.lua");
const version = text("version.jkr").split("\n")[0].trim();

type Table = Record<string, LuaValue>;
const centers = parseAssignedTable(gameLua, "self.P_CENTERS = {") as Record<
  string,
  Table
>;
const tags = parseAssignedTable(gameLua, "self.P_TAGS = {") as Record<
  string,
  Table
>;
const cards = parseAssignedTable(gameLua, "self.P_CARDS = {");

const num = (v: LuaValue | undefined) => (typeof v === "number" ? v : 0);
const byOrder = (entries: [string, Table][]) =>
  entries.sort((a, b) => num(a[1].order) - num(b[1].order));
const ofSet = (set: string) =>
  byOrder(Object.entries(centers).filter(([, v]) => v.set === set && !v.wip));

const jokers = (rarity: number) =>
  byOrder(
    Object.entries(centers).filter(
      ([, v]) => v.set === "Joker" && v.rarity === rarity && !v.demo && !v.wip,
    ),
  ).map(([k]) => k);

const pools: SeedPools = {
  version,
  jokers: { 1: jokers(1), 2: jokers(2), 3: jokers(3), 4: jokers(4) },
  tarots: ofSet("Tarot").map(([k]) => k),
  planets: ofSet("Planet").map(([k, v]) => ({
    key: k,
    softlock: (v.config as Table | undefined)?.softlock === true,
  })),
  spectrals: ofSet("Spectral").map(([k, v]) => ({
    key: k,
    hidden: v.hidden === true,
  })),
  vouchers: ofSet("Voucher").map(([k, v]) => ({
    key: k,
    requires: Array.isArray(v.requires) ? (v.requires as string[]) : [],
  })),
  boosters: ofSet("Booster").map(([k, v]) => {
    const config = v.config as Table;
    return {
      key: k,
      kind: String(v.kind),
      weight: num(v.weight) || 1,
      size: num(config.extra),
      choose: num(config.choose),
    };
  }),
  enhancements: ofSet("Enhanced").map(([k]) => k),
  noEternal: ofSet("Joker")
    .filter(([, v]) => v.eternal_compat !== true)
    .map(([k]) => k),
  noPerishable: ofSet("Joker")
    .filter(([, v]) => v.perishable_compat !== true)
    .map(([k]) => k),
  tags: byOrder(Object.entries(tags)).map(([k, v]) => ({
    key: k,
    minAnte: typeof v.min_ante === "number" ? v.min_ante : undefined,
  })),
  cards: Object.keys(cards).sort(),
};

const out = join(
  import.meta.dirname,
  "..",
  "src",
  "lib",
  "seed",
  "pools.generated.json",
);
writeFileSync(out, `${JSON.stringify(pools, null, 2)}\n`);
console.log(
  `Wrote ${out} (${version}): ${pools.jokers[1].length}/${pools.jokers[2].length}/${pools.jokers[3].length}/${pools.jokers[4].length} jokers, ${pools.vouchers.length} vouchers, ${pools.tags.length} tags, ${pools.boosters.length} boosters`,
);
