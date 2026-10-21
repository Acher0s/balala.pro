/**
 * Imports card data and sprites from your own Balatro install.
 *
 *   npm run import-game                         # default Steam location
 *   npm run import-game -- "D:\Games\Balatro\Balatro.exe"
 *
 * Writes src/data/game.generated.json and public/game/<kind>/<id>.webp.
 * Names, rarity, cost and effect text come straight from the game's files, with the
 * effect placeholders (#1#, #2#, …) filled in from each card's starting config.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import sharp from "sharp";
import type {
  GameData,
  GameItem,
  ItemKind,
  Rarity,
} from "../src/data/game-types.ts";
import { parseEffectLine as parseLine } from "../src/lib/effect-text.ts";
import { compile } from "../src/lib/formula.ts";
import {
  balanced,
  type LuaValue,
  parseAssignedTable,
  parseLuaTable,
} from "./lib/lua.ts";
import { readZip } from "./lib/zip.ts";

const DEFAULT_EXE =
  "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Balatro\\Balatro.exe";
const exePath = process.argv[2] ?? DEFAULT_EXE;
if (!existsSync(exePath)) {
  console.error(
    `Balatro.exe not found at "${exePath}". Pass its path: npm run import-game -- "<path to Balatro.exe>"`,
  );
  process.exit(1);
}

const root = join(import.meta.dirname, "..");
const zip = readZip(readFileSync(exePath));
const text = (name: string) => {
  const file = zip.get(name);
  if (!file) throw new Error(`${name} is missing from the game archive`);
  return file().toString("utf8");
};

const gameLua = text("game.lua");
const cardLua = text("card.lua");
const commonEvents = text("functions/common_events.lua");
const version = text("version.jkr").split("\n")[0].trim();

type Table = Record<string, LuaValue>;
const centers = parseAssignedTable(gameLua, "self.P_CENTERS = {") as Record<
  string,
  Table
>;
const playingCards = parseAssignedTable(gameLua, "self.P_CARDS = {") as Record<
  string,
  Table
>;
const descriptions = (parseLuaTable(text("localization/en-us.lua")) as Table)
  .descriptions as Record<
  string,
  Record<string, { name: string; text: string[] }>
>;

// ---------------------------------------------------------------------------
// Effect text values (#1#, #2#, …)

/** loc_vars expressions per card name, collected from the game's UI code. */
function collectLocVars(src: string): Map<string, string> {
  const out = new Map<string, string>();
  const condRe = /(?:else)?if\s+([\s\S]+?)\s+then\b/g;
  const conds = [...src.matchAll(condRe)];
  const namesOf = (cond: string) =>
    [
      ...cond.matchAll(
        /(?:ability\.name|_c\.name|_c\.effect|name_to_check)\s*==\s*['"]([^'"]+)['"]/g,
      ),
    ].map((n) => n[1]);
  conds.forEach((m, idx) => {
    const names = namesOf(m[1]);
    if (names.length === 0) return;
    // The branch runs until the next condition that tests a card name (nested ifs stay inside).
    const next = conds.slice(idx + 1).find((c) => namesOf(c[1]).length > 0);
    const body = src.slice(
      (m.index ?? 0) + m[0].length,
      next?.index ?? src.length,
    );
    const at = body.search(/loc_(?:vars|args) = \{/);
    const vars =
      at === -1 ? "" : balanced(body, body.indexOf("{", at)).slice(1, -1);
    // Later branches win: the description branch comes after the locked/unlock-condition one.
    for (const name of names) out.set(name, vars);
  });
  return out;
}

const jokerVars = collectLocVars(
  cardLua.slice(
    cardLua.indexOf("function Card:generate_UIBox_ability_table"),
    cardLua.indexOf("function Card:get_nominal"),
  ),
);
const otherVars = collectLocVars(
  commonEvents.slice(commonEvents.indexOf("function generate_card_ui")),
);
for (const [name, vars] of collectLocVars(text("back.lua")))
  otherVars.set(name, vars);

function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" || c === '"') {
      const end = s.indexOf(c, i + 1);
      cur += s.slice(i, end + 1);
      i = end;
      continue;
    }
    if ("({[".includes(c)) depth++;
    if (")}]".includes(c)) depth--;
    if (c === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts.filter((p) => !/^\w+\s*=[^=]/.test(p)); // drop named entries like colours = {...}
}

/** Card.ability as the game builds it from a center's config (see Card:set_ability). */
function ability(config: Table): Table {
  return {
    mult: config.mult ?? 0,
    h_mult: config.h_mult ?? 0,
    h_x_mult: config.h_x_mult ?? 0,
    h_dollars: config.h_dollars ?? 0,
    p_dollars: config.p_dollars ?? 0,
    t_mult: config.t_mult ?? 0,
    t_chips: config.t_chips ?? 0,
    x_mult: config.Xmult ?? 1,
    h_size: config.h_size ?? 0,
    d_size: config.d_size ?? 0,
    extra: config.extra ?? null,
    type: config.type ?? "",
    bonus: config.bonus ?? 0,
    perma_bonus: 0,
  };
}

function lookupPath(obj: LuaValue, path: string[]): LuaValue | undefined {
  let cur: LuaValue | undefined = obj;
  for (const p of path) {
    if (cur && typeof cur === "object" && !Array.isArray(cur) && p in cur)
      cur = (cur as Table)[p];
    else return undefined;
  }
  return cur;
}

const tags = parseAssignedTable(gameLua, "self.P_TAGS = {") as Record<
  string,
  Table
>;
// Display names as the game shows them ("Bonus Card", not the internal "Bonus").
const centerNames = new Map(
  [...Object.entries(centers), ...Object.entries(tags)].map(([k, v]) => [
    k,
    String(v.name),
  ]),
);
for (const set of Object.values(descriptions)) {
  for (const [k, d] of Object.entries(set))
    if (d?.name) centerNames.set(k, d.name);
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/** Resolves one loc_vars expression to display text, or null if it depends on game state. */
function resolveExpr(
  raw: string,
  scope: { self?: Table; config: Table },
): string | null {
  // Multiplayer mod state (MP.LOBBY, MP.GAME…) is game state too.
  let e = raw.trim().replace(/\bMP\./g, "G.MP.");
  const str = /^(['"])(.*)\1$/.exec(e);
  if (str) return str[2];

  const nameText =
    /^localize\{.*type\s*=\s*'name_text'.*key\s*=\s*('?[\w.]+'?)/.exec(e);
  if (nameText) {
    const key = resolveExpr(nameText[1], scope);
    return key ? (centerNames.get(key) ?? null) : null;
  }
  const loc =
    /^localize\((.+),\s*'(poker_hands|suits_plural|suits_singular)'\)$/.exec(e);
  if (loc) {
    const v = resolveExpr(loc[1], scope);
    if (v === null) return null;
    return loc[2] === "suits_singular" ? v.replace(/s$/, "") : v;
  }

  e = e.replace(/^(''|"")\s*\.\.\s*/, "");
  // ((specific_vars and specific_vars.x) or fallback) → fallback
  e = e.replace(/^\(?\(specific_vars[^)]*\)\s*or\s*([^()]+?)\)?$/, "$1");
  // Top-level "<game state> or N" → N
  const topOr = /^([^()]*\bG\.[^()]*?)\s+or\s+(-?\d+(?:\.\d+)?)$/.exec(e);
  if (topOr) e = topOr[2];
  // "<game state> and A or B" (e.g. a high-stake variant) → B, the default
  const andOr = /^\(?([^()]*\bG\.[^()]*?)\s+and\s+(.+?)\s+or\s+(.+?)\)?$/.exec(
    e,
  );
  if (andOr) e = andOr[3];
  e = e.replace(/\(?G\.GAME and G\.GAME\.probabilities\.normal or 1\)?/g, "1");
  e = e.replace(/G\.GAME\.probabilities\.normal/g, "1");
  // State-dependent values default to the fallback the game itself uses: (x or 0)
  e = e.replace(
    /\(([^()]*?)\s+or\s+(-?\d+(?:\.\d+)?)\)/g,
    (_m, inner: string, fallback: string) =>
      /G\.|tally|#/.test(inner) ? fallback : `(${inner} or ${fallback})`,
  );
  e = e.replace(/math\.(min|max|floor|ceil|abs)/g, "$1");

  let failed = false;
  let stringResult: string | null = null;
  e = e.replace(
    /(self\.ability|card\.ability|_c\.config|effect_config)((?:\.\w+)+)/g,
    (_m, base: string, path: string) => {
      const obj = base.endsWith(".ability") ? scope.self : scope.config;
      const v = obj ? lookupPath(obj, path.slice(1).split(".")) : undefined;
      if (typeof v === "number") return String(v);
      if (typeof v === "string") {
        stringResult = v;
        return "0";
      }
      failed = true;
      return "0";
    },
  );
  if (failed || /G\.|#|\.\.|\bor\b|\band\b|localize/.test(e)) return null;
  if (stringResult !== null && e.trim() === "0") return stringResult;
  try {
    return formatNumber(compile(e).evaluate());
  } catch {
    return null;
  }
}

const unresolved: string[] = [];

function resolveVars(
  name: string,
  exprs: string | undefined,
  scope: { self?: Table; config: Table },
  lines: string[],
): string[] {
  if (!exprs) return [];
  return splitTopLevel(exprs).map((ex, i) => {
    const v = resolveExpr(ex, scope);
    if (v === null) {
      // Only worth reporting when the text actually shows this value.
      if (lines.some((l) => l.includes(`#${i + 1}#`)))
        unresolved.push(`${name} #${i + 1}#: ${ex}`);
      return "?";
    }
    return v;
  });
}

// ---------------------------------------------------------------------------
// Items

const RARITIES: Rarity[] = ["common", "uncommon", "rare", "legendary"];
const KIND_BY_SET: Record<string, ItemKind> = {
  Joker: "joker",
  Tarot: "tarot",
  Planet: "planet",
  Spectral: "spectral",
  Voucher: "voucher",
  Enhanced: "enhancement",
  Back: "deck",
};
const SHEET_BY_KIND: Record<ItemKind, string> = {
  joker: "Jokers",
  tarot: "Tarots",
  planet: "Tarots",
  spectral: "Tarots",
  voucher: "Vouchers",
  enhancement: "Enhancers",
  seal: "Enhancers",
  deck: "Enhancers",
};

const handLevels = new Map<string, { l_mult: number; l_chips: number }>();
for (const m of gameLua.matchAll(
  /\["([^"]+)"\]\s*=\s*\{[^}]*?l_mult\s*=\s*(\d+),\s*l_chips\s*=\s*(\d+)/g,
)) {
  handLevels.set(m[1], { l_mult: Number(m[2]), l_chips: Number(m[3]) });
}

function idFromKey(key: string) {
  return key.replace(/^[a-z]_/, "");
}

interface SpriteJob {
  kind: ItemKind;
  id: string;
  pos: { x: number; y: number };
  soul?: { x: number; y: number };
  /** Sheet the soul layer comes from, when it isn't the item's own sheet. */
  soulSheet?: string;
  /** A mod's own sprite sheet; vanilla items use the game's sheet for their kind. */
  sheet?: Buffer;
  cell?: { w: number; h: number };
}
const jobs: SpriteJob[] = [];

const data: GameData = {
  version,
  items: {
    joker: {},
    tarot: {},
    planet: {},
    spectral: {},
    voucher: {},
    enhancement: {},
    seal: {},
    deck: {},
  },
  cards: {},
  baseCard: "/game/enhancement/base.webp",
};

for (const [key, center] of Object.entries(centers)) {
  const kind = KIND_BY_SET[String(center.set)];
  const desc = descriptions[String(center.set)]?.[key];
  if (!kind || !desc || !center.pos) continue;
  const name = String(center.name);
  const config = (center.config ?? {}) as Table;
  const id = idFromKey(key);

  let vars: string[];
  if (kind === "planet") {
    const hand = String(config.hand_type);
    const lv = handLevels.get(hand);
    vars = ["1", hand, String(lv?.l_mult ?? "?"), String(lv?.l_chips ?? "?")];
  } else if (kind === "joker") {
    vars = resolveVars(
      name,
      jokerVars.get(name),
      { self: ability(config), config },
      desc.text,
    );
  } else {
    vars = resolveVars(
      name,
      otherVars.get(name) ?? otherVars.get(String(center.effect)),
      { config },
      desc.text,
    );
  }
  // A single placeholder with no known expression: use the card's only numeric config value.
  if (vars.length === 0 && desc.text.some((l) => l.includes("#1#"))) {
    const nums = Object.values(config).filter(
      (v): v is number => typeof v === "number",
    );
    if (nums.length === 1) vars = [formatNumber(nums[0])];
    else unresolved.push(`${name}: no loc_vars found`);
  }

  const item: GameItem = {
    key,
    name: desc.name ?? name,
    kind,
    text: desc.text.map((l) => parseLine(l, vars)),
    image: `/game/${kind}/${id}.webp`,
    w: 0,
    h: 0,
    source: "vanilla",
  };
  if (kind === "joker") item.rarity = RARITIES[Number(center.rarity) - 1];
  if (typeof center.cost === "number") item.cost = center.cost;
  data.items[kind][id] = item;
  jobs.push({
    kind,
    id,
    pos: center.pos as { x: number; y: number },
    soul: center.soul_pos as { x: number; y: number } | undefined,
  });
  // The Soul's gem isn't a soul_pos: the game draws a shared sprite from the Enhancers sheet
  // on top of it (G.shared_soul in game.lua, drawn in Card:draw).
  if (key === "c_soul") {
    const job = jobs[jobs.length - 1];
    job.soul = centers.soul?.pos as { x: number; y: number };
    job.soulSheet = "Enhancers";
  }
}

// Seals: sprite positions live in G.shared_seals, text in descriptions.Other.<colour>_seal
const sealBlock = gameLua.slice(
  gameLua.indexOf("self.shared_seals"),
  gameLua.indexOf("self.shared_seals") + 800,
);
for (const m of sealBlock.matchAll(
  /(\w+)\s*=\s*Sprite\([^)]*?\{x\s*=\s*(\d+),\s*y\s*=\s*(\d+)\}\)/g,
)) {
  const id = m[1].toLowerCase();
  const desc = descriptions.Other[`${id}_seal`];
  if (!desc) continue;
  data.items.seal[id] = {
    key: m[1],
    name: desc.name,
    kind: "seal",
    text: desc.text.map((l) => parseLine(l, [])),
    image: `/game/seal/${id}.webp`,
    overlay: `/game/seal/${id}-overlay.webp`,
    w: 0,
    h: 0,
    source: "vanilla",
  };
  jobs.push({ kind: "seal", id, pos: { x: Number(m[2]), y: Number(m[3]) } });
}

// ---------------------------------------------------------------------------
// Multiplayer mod (read from the installed mod, if present)

const MOD_DIR =
  process.env.BMP_MOD_DIR ??
  join(process.env.APPDATA ?? "", "Balatro", "Mods", "BalatroMultiplayer");
let modVersion: string | null = null;

if (existsSync(join(MOD_DIR, "Multiplayer.json"))) {
  modVersion = String(
    JSON.parse(readFileSync(join(MOD_DIR, "Multiplayer.json"), "utf8")).version,
  );
  const modLoc = (
    parseLuaTable(
      readFileSync(join(MOD_DIR, "localization", "en-us.lua"), "utf8"),
    ) as Table
  ).descriptions as typeof descriptions;
  const luaFiles = (
    readdirSync(MOD_DIR, { recursive: true, encoding: "utf8" }) as string[]
  )
    .filter((f) => f.endsWith(".lua") && !f.startsWith("localization"))
    .map((f) => join(MOD_DIR, f));

  // Atlases are global: one file may use an atlas defined in another.
  const atlases = new Map<string, { path: string; px: number; py: number }>();
  const defs: { file: string; type: string; def: Table }[] = [];
  for (const file of luaFiles) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(
      /SMODS\.(Atlas|Joker|Consumable|Back)\s*\(\s*\{/g,
    )) {
      const def = parseLuaTable(src, src.indexOf("{", m.index)) as Table;
      if (m[1] === "Atlas") {
        // Some atlases compute their path in code; only plain file names can be read.
        if (typeof def.path !== "string") continue;
        atlases.set(String(def.key), {
          path: String(def.path),
          px: Number(def.px ?? 71),
          py: Number(def.py ?? 95),
        });
      } else defs.push({ file, type: m[1], def });
    }
  }

  const modSheets = new Map<string, Buffer>();
  const modSheet = (path: string) => {
    let buf = modSheets.get(path);
    if (!buf) {
      buf = readFileSync(join(MOD_DIR, "assets", "2x", path));
      modSheets.set(path, buf);
    }
    return buf;
  };

  for (const { file, type, def } of defs) {
    const key = String(def.key);
    // Jokers and decks (Backs) say what they are by their type; consumables by their set.
    const set = type === "Consumable" ? String(def.set) : type;
    const kind = KIND_BY_SET[set];
    const prefix = { Joker: "j", Back: "b" }[type] ?? "c";
    const fullKey = `${prefix}_mp_${key}`;
    const desc = modLoc[set]?.[fullKey];
    if (!kind || !desc) continue;

    // objects/jokers/standard/ticket.lua → "standard"; objects/jokers/pizza.lua → "multiplayer"
    const folders = relative(join(MOD_DIR, "objects"), file)
      .split(sep)
      .slice(1, -1);
    const suffix = /_(sandbox|experimental|release)$/.exec(key)?.[1];
    const source = suffix ?? folders[0] ?? "multiplayer";

    const config = (def.config ?? {}) as Table;
    const fn = (def.loc_vars as { expr?: string } | undefined)?.expr ?? "";
    let exprs: string | undefined;
    const ret = fn.search(/return\s*\{[^}]*?\bvars\s*=\s*\{/);
    if (ret !== -1) {
      const varsAt = fn.slice(ret).search(/\bvars\s*=\s*\{/) + ret;
      exprs = balanced(fn, fn.indexOf("{", varsAt)).slice(1, -1);
      // `local n, d = SMODS.get_probability_vars(card, base, odds, …)` → n = base, d = odds
      for (const m of fn.matchAll(
        /local\s+(\w+)\s*,\s*(\w+)\s*=\s*SMODS\.get_probability_vars\(\s*card\s*,\s*([^,]+),\s*([^,)]+)/g,
      )) {
        exprs = exprs
          .replace(new RegExp(`\\b${m[1]}\\b`, "g"), `(${m[3].trim()})`)
          .replace(new RegExp(`\\b${m[2]}\\b`, "g"), `(${m[4].trim()})`);
      }
      // Inline `local x = …` helpers so their expressions can be resolved.
      for (const m of fn.matchAll(/local\s+(\w+)\s*=\s*([^\n]+)/g)) {
        exprs = exprs.replace(
          new RegExp(`\\b${m[1]}\\b`, "g"),
          `(${m[2].trim()})`,
        );
      }
    }
    const vars = resolveVars(
      desc.name,
      exprs,
      { self: ability(config), config },
      desc.text,
    );

    const id = `mp_${key}`;
    const item: GameItem = {
      key: fullKey,
      name: desc.name,
      kind,
      text: desc.text.map((l) => parseLine(l, vars)),
      image: `/game/${kind}/${id}.webp`,
      w: 0,
      h: 0,
      source,
    };
    if (kind === "joker" && typeof def.rarity === "number")
      item.rarity = RARITIES[def.rarity - 1];
    if (typeof def.cost === "number") item.cost = def.cost;
    data.items[kind][id] = item;

    // Atlases may be referenced with the mod's prefix ("mp_decks" for the atlas "decks").
    const atlasKey = def.atlas ? String(def.atlas) : undefined;
    const atlas = atlasKey
      ? (atlases.get(atlasKey) ?? atlases.get(atlasKey.replace(/^mp_/, "")))
      : undefined;
    jobs.push({
      kind,
      id,
      pos: (def.pos as { x: number; y: number }) ?? { x: 0, y: 0 },
      soul: def.soul_pos as { x: number; y: number } | undefined,
      sheet: atlas ? modSheet(atlas.path) : undefined,
      cell: atlas ? { w: atlas.px * 2, h: atlas.py * 2 } : undefined,
    });
  }
}

// ---------------------------------------------------------------------------
// Sprites

const CELL_W = 142; // 71 × 95 at the game's 2x texture scale
const CELL_H = 190;
const sheets = new Map<string, Buffer>();
const sheet = (name: string) => {
  let buf = sheets.get(name);
  if (!buf) {
    const file = zip.get(`resources/textures/2x/${name}.png`);
    if (!file) throw new Error(`Missing sprite sheet ${name}.png`);
    buf = file();
    sheets.set(name, buf);
  }
  return buf;
};
const crop = (
  buf: Buffer,
  pos: { x: number; y: number },
  cell = { w: CELL_W, h: CELL_H },
) =>
  sharp(buf)
    .extract({
      left: pos.x * cell.w,
      top: pos.y * cell.h,
      width: cell.w,
      height: cell.h,
    })
    .png()
    .toBuffer();

const outDir = join(root, "public", "game");
rmSync(outDir, { recursive: true, force: true });
const write = async (rel: string, png: Buffer) => {
  const file = join(outDir, rel);
  mkdirSync(join(file, ".."), { recursive: true });
  await sharp(png).webp({ lossless: true }).toFile(file);
};

for (const job of jobs) {
  const src = job.sheet ?? sheet(SHEET_BY_KIND[job.kind]);
  let img = await crop(src, job.pos, job.cell);
  if (job.soul) {
    const soulSrc = job.soulSheet ? sheet(job.soulSheet) : src;
    const soul = await crop(soulSrc, job.soul, job.cell);
    img = await sharp(img)
      .composite([{ input: soul }])
      .png()
      .toBuffer();
  }
  if (job.kind === "joker" && job.id === "wee") {
    // The game draws Wee Joker with Joker's sprite at 70% size (card.lua, Card:set_ability):
    // shrink it onto a full-size transparent card so it shows as small as in the game.
    const { width = CELL_W, height = CELL_H } = await sharp(img).metadata();
    const small = await sharp(img)
      .resize(Math.round(width * 0.7), Math.round(height * 0.7), {
        kernel: "nearest",
      })
      .png()
      .toBuffer();
    img = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: small, gravity: "center" }])
      .png()
      .toBuffer();
  }
  if (job.kind === "seal") {
    // Seals are drawn on top of a card, so their sheet cell is mostly empty:
    // keep the full cell for <PlayingCard> and trim it for showing the seal on its own.
    await write(`seal/${job.id}-overlay.webp`, img);
    img = await sharp(img).trim().png().toBuffer();
  }
  const { width, height } = await sharp(img).metadata();
  const item = data.items[job.kind][job.id];
  item.w = width ?? CELL_W;
  item.h = height ?? CELL_H;
  await write(`${job.kind}/${job.id}.webp`, img);
}

const base = centers.c_base?.pos as { x: number; y: number };
await write("enhancement/base.webp", await crop(sheet("Enhancers"), base));
for (const [key, card] of Object.entries(playingCards)) {
  await write(
    `card/${key}.webp`,
    await crop(sheet("8BitDeck"), card.pos as { x: number; y: number }),
  );
  data.cards[key] = {
    suit: String(card.suit),
    value: String(card.value),
    image: `/game/card/${key}.webp`,
  };
}

if (modVersion) data.modVersion = modVersion;
writeFileSync(
  join(root, "src", "data", "game.generated.json"),
  `${JSON.stringify(data, null, 1)}\n`,
);

const counts = Object.entries(data.items)
  .map(([k, v]) => `${Object.keys(v).length} ${k}`)
  .join(", ");
console.log(
  `Imported Balatro ${version}: ${counts}, ${Object.keys(data.cards).length} playing cards.`,
);
if (unresolved.length) {
  console.log(
    `\n${unresolved.length} values depend on game state and show as "?" (fix them in src/data/overrides.ts):`,
  );
  for (const u of unresolved) console.log(`  - ${u}`);
}
