/**
 * "What did I block?": replays one player's match log (balatromp.com's replay events) through
 * the seed reader, and lists every card a roll landed on and passed by because the player had
 * it, or because its in_pool condition wasn't met yet (a gated joker, Penny Pincher, a
 * softlocked planet).
 *
 * The log records what the player did, not what the shop showed, so the shop, packs and the
 * cards jokers and consumables make are rolled again here in the order the log has them. Every
 * card the player bought, picked or used is checked against what the replay put there; the
 * report says how many matched, so a replay that drifted shows it.
 */

import pools from "./pools.generated.json";
import {
  type ConsumableSet,
  type ReaderSettings,
  SHOP_VOUCHERS,
  ShopSim,
  type ShopVoucher,
  tagQueue,
  voucherQueue,
} from "./reader";
import { DECKS, PATCHES } from "./rulesets";

/** One replay event: time in ms, opcode, arguments. */
export type LogEvent = [number, string, unknown];

/** One player's log as /api/what-did-i-block/[id] gives it: null when it isn't shared. */
export interface MatchPlayerLog {
  name: string;
  shared: boolean;
  events: LogEvent[] | null;
}

export type BlockReason = "held" | "locked";

/** A joker blocked from event `from` on because it was seen as a lobby avatar. */
export interface AvatarBlock {
  key: string;
  from: number;
  /** Where in the run that is. */
  place?: string;
}

export interface BlockHit {
  key: string;
  reason: BlockReason;
  /** What was rolling: "Shop", "Buffoon Pack", "Riff-raff", "Tarot made", "Vouchers", … */
  source: string;
  ante: number;
  /** Where in the run, e.g. "Ante 2 · Shop after Small Blind". */
  place: string;
  /** For a locked card: what it was waiting for. */
  why?: string;
  /**
   * The next card the log shows from the same queue was where the replay put it, so the
   * replay was in line with the game here. False: it wasn't, and this may not have happened.
   */
  sure: boolean;
}

export interface Agreement {
  checked: number;
  matched: number;
}

export interface BlockReport {
  settings: ReaderSettings;
  hits: BlockHit[];
  /** How many of the cards the log shows were where the replay put them. */
  agreement: {
    shop: Agreement;
    packs: Agreement;
    made: Agreement;
    jokers: Agreement;
  };
  /** The first place a card wasn't where the replay put it. */
  firstMiss?: string;
  /**
   * Jokers the replay had in a shop slot where the player bought something else, with the
   * event that rolled that shop.
   */
  missedShop: { key: string; at: number }[];
  /** Jokers taken to be blocked by the lobby's avatars from an event on (findBlocksAuto). */
  avatars: AvatarBlock[];
}

export type MatchSettings =
  | { ok: true; settings: ReaderSettings }
  | { ok: false; error: string };

/** The reader settings a log was played on, or why it can't be read. */
export function matchSettings(events: readonly LogEvent[]): MatchSettings {
  const lobby = events.find((e) => e[1] === "lobby_info")?.[2] as
    | {
        ruleset?: string;
        gamemode?: string;
        options?: { the_order_enabled?: boolean; mod_version?: string };
      }
    | undefined;
  const run = events.find((e) => e[1] === "run_info")?.[2] as
    | { deck?: string; seed?: string; stake?: number }
    | undefined;
  if (!lobby || !run?.seed) return { ok: false, error: "The log has no run." };
  if (lobby.options?.the_order_enabled === false)
    return {
      ok: false,
      error:
        "This match was played without The Order; only Order matches can be read.",
    };
  // The patch the match was played on. Logs from before 1.0.5 have no blind keys and no joker
  // list on each hand, and the reader has no pools for those versions.
  const version = lobby.options?.mod_version;
  const patch = PATCHES.find((p) => p.id === `pvp-${version}`);
  if (!patch)
    return {
      ok: false,
      error: `This match was played on Multiplayer ${version ?? "(unknown)"}; only ${PATCHES.map((p) => p.label.replace(/^Multiplayer PvP /, "")).join(", ")} can be read.`,
    };
  const rulesetId = (lobby.ruleset ?? "").replace(/^ruleset_mp_/, "");
  const ruleset = patch.rulesets.find((r) => r.id === rulesetId);
  if (!ruleset)
    return {
      ok: false,
      error: `The ${rulesetId || "unknown"} ruleset isn't supported yet.`,
    };
  const gameModeId = (lobby.gamemode ?? "").replace(/^gamemode_mp_/, "");
  if (gameModeId && gameModeId !== patch.gameMode.id)
    return {
      ok: false,
      error: `The ${gameModeId} game mode isn't supported yet.`,
    };
  const deck = DECKS.find((d) => d.key === deckKey(run.deck))?.id;
  return {
    ok: true,
    settings: {
      seed: run.seed,
      ruleset,
      gameMode: patch.gameMode,
      // The game numbers the mod's stakes after Gold: Planet 9, Spectral 10, Spectral+ 11.
      // The reader calls Spectral+ 9.
      stake: run.stake === 11 ? 9 : (run.stake ?? 1),
      deck,
      pincherUnlocked: false,
      enhancements: [],
      softlocked: SOFTLOCKS.map((s) => s.planet),
    },
  };
}

// ---------------------------------------------------------------------------

/**
 * What a deck starts the run with, as far as the replay goes: vouchers (redeemed before the
 * first ante's voucher is rolled), consumables (made by key, no roll), money and slots.
 * Vanilla's from back.lua; the mod's from objects/decks/*.lua.
 */
const DECK_START: Record<
  string,
  {
    vouchers?: string[];
    consumables?: string[];
    dollars?: number;
    jokerSlots?: number;
    consumableSlots?: number;
  }
> = {
  b_magic: { vouchers: ["v_crystal_ball"], consumables: ["c_fool", "c_fool"] },
  b_nebula: { vouchers: ["v_telescope"], consumableSlots: -1 },
  b_ghost: { consumables: ["c_hex"] },
  b_zodiac: {
    vouchers: ["v_tarot_merchant", "v_planet_merchant", "v_overstock_norm"],
  },
  b_black: { jokerSlots: 1 },
  b_painted: { jokerSlots: -1 },
  b_yellow: { dollars: 10 },
  b_mp_orange: { consumables: ["c_hanged_man", "c_hanged_man"] },
  b_mp_oracle: { vouchers: ["v_clearance_sale"], consumables: ["c_medium"] },
};

/** The deck's key: the log has the key ("b_mp_violet") or the name ("Magic Deck"). */
function deckKey(deck: string | undefined): string | undefined {
  if (!deck) return undefined;
  if (deck.startsWith("b_")) return deck;
  const known = DECKS.find((d) => d.name === deck);
  if (known) return known.key;
  return `b_${deck
    .replace(/ Deck$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")}`;
}

/** Softlocked planets and the hand that opens them. */
const SOFTLOCKS = [
  { planet: "c_planet_x", hand: "Five of a Kind" },
  { planet: "c_ceres", hand: "Flush House" },
  { planet: "c_eris", hand: "Flush Five" },
] as const;

const GATE_NAME: Record<string, string> = {
  m_glass: "Glass",
  m_steel: "Steel",
  m_stone: "Stone",
  m_lucky: "Lucky",
  m_gold: "Gold",
};

const GATES = pools.enhancementGates as Record<string, string>;

/** What a Tarot does to the cards it's used on. */
const ENHANCES: Record<string, string> = {
  c_magician: "m_lucky",
  c_empress: "m_mult",
  c_hierophant: "m_bonus",
  c_lovers: "m_wild",
  c_chariot: "m_steel",
  c_justice: "m_glass",
  c_devil: "m_gold",
  c_tower: "m_stone",
};
const SUITS: Record<string, string> = {
  c_star: "Diamonds",
  c_moon: "Clubs",
  c_sun: "Hearts",
  c_world: "Spades",
};
const RANKS = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "Jack",
  "Queen",
  "King",
  "Ace",
];

const CONSUMABLE_SETS = new Set(["Tarot", "Planet", "Spectral"]);

type Ref = (number | string)[];

interface PlayingCard {
  rank: string;
  suit: string;
  enhancement?: string;
  seal?: string;
  alive: boolean;
}

const mod = (ref: Ref, prefix: string) =>
  ref
    .slice(1)
    .find((m) => typeof m === "string" && m.startsWith(prefix))
    ?.toString()
    .slice(prefix.length);

function packKind(key: string): string {
  const m = /^p_(?:mp_)?(buffoon|arcana|celestial|spectral|standard)/.exec(key);
  return m ? m[1] : "other";
}

const PACK_INFO = new Map(
  (pools.boosters as { key: string; size: number; choose: number }[]).map(
    (b) => [b.key, b],
  ),
);

function blindName(key: string): string {
  if (key === "bl_small") return "Small Blind";
  if (key === "bl_big") return "Big Blind";
  if (key.startsWith("bl_mp_")) return "PvP Blind";
  const words = key
    .replace(/^bl_(final_)?/, "")
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1));
  return `The ${words.join(" ")}`;
}

/** The joker each slot acts as: Blueprint copies the one to its right, Brainstorm the first. */
function acting(keys: readonly string[]): string[] {
  const at = (i: number, depth: number): string | undefined => {
    if (i >= keys.length || depth > keys.length) return undefined;
    if (keys[i] === "j_blueprint") return at(i + 1, depth + 1);
    if (keys[i] === "j_brainstorm")
      return i === 0 ? undefined : at(0, depth + 1);
    return keys[i];
  };
  return keys.flatMap((_, i) => at(i, 0) ?? []);
}

/** The planet each hand levels, for a Blue Seal's planet. */
const PLANET_OF: Record<string, string> = {
  "High Card": "c_pluto",
  Pair: "c_mercury",
  "Two Pair": "c_uranus",
  "Three of a Kind": "c_venus",
  Straight: "c_saturn",
  Flush: "c_jupiter",
  "Full House": "c_earth",
  "Four of a Kind": "c_mars",
  "Straight Flush": "c_neptune",
  "Five of a Kind": "c_planet_x",
  "Flush House": "c_ceres",
  "Flush Five": "c_eris",
};

/**
 * The hand played cards make and the cards that score (vanilla's evaluate_poker_hand,
 * get_X_same, get_flush, get_straight, with Four Fingers, Shortcut, Smeared, Wild and Stone
 * Cards, and Splash).
 */
export function evaluateHand(
  cards: readonly PlayingCard[],
  jokers: readonly string[],
): { name: string; scoring: PlayingCard[] } {
  const need = jokers.includes("j_four_fingers") ? 4 : 5;
  const gap = jokers.includes("j_shortcut") ? 2 : 1;
  const smeared = jokers.includes("j_smeared");
  const ranked = cards.filter((c) => c.enhancement !== "m_stone");
  const value = (c: PlayingCard) => RANKS.indexOf(c.rank) + 2;

  const groups = new Map<number, PlayingCard[]>();
  for (const c of ranked)
    groups.set(value(c), [...(groups.get(value(c)) ?? []), c]);
  const same = (n: number) =>
    [...groups.values()].filter((g) => g.length === n);
  const five = same(5);
  const four = same(4);
  const three = same(3);
  const pairs = same(2);

  const suitOf = (s: string) =>
    smeared ? (s === "Hearts" || s === "Diamonds" ? "red" : "black") : s;
  let flush: PlayingCard[] = [];
  if (cards.length >= need)
    for (const suit of ["Spades", "Hearts", "Clubs", "Diamonds"]) {
      const of = ranked.filter(
        (c) => c.enhancement === "m_wild" || suitOf(c.suit) === suitOf(suit),
      );
      if (of.length >= need) {
        flush = of;
        break;
      }
    }

  let straight: PlayingCard[] = [];
  if (cards.length >= need) {
    const values = new Set<number>();
    for (const c of ranked) {
      values.add(value(c));
      if (value(c) === 14) values.add(1);
    }
    let run: number[] = [];
    let best: number[] = [];
    for (let v = 1; v <= 14; v++) {
      if (!values.has(v)) continue;
      run = run.length && v - run[run.length - 1] <= gap ? [...run, v] : [v];
      if (run.length >= need && run.length >= best.length) best = run;
    }
    if (best.length >= need)
      straight = ranked.filter(
        (c) => best.includes(value(c)) || (value(c) === 14 && best.includes(1)),
      );
  }

  const name =
    five.length && flush.length
      ? "Flush Five"
      : three.length && pairs.length && flush.length
        ? "Flush House"
        : five.length
          ? "Five of a Kind"
          : straight.length && flush.length
            ? "Straight Flush"
            : four.length
              ? "Four of a Kind"
              : three.length && pairs.length
                ? "Full House"
                : flush.length
                  ? "Flush"
                  : straight.length
                    ? "Straight"
                    : three.length
                      ? "Three of a Kind"
                      : pairs.length >= 2
                        ? "Two Pair"
                        : pairs.length
                          ? "Pair"
                          : "High Card";
  const byHand: Record<string, PlayingCard[]> = {
    "Flush Five": [...flush, ...five.flat()],
    "Flush House": [...flush, ...three.flat(), ...pairs.flat()],
    "Five of a Kind": five.flat(),
    "Straight Flush": [...straight, ...flush],
    "Four of a Kind": four.flat(),
    "Full House": [...three.flat(), ...pairs.flat()],
    Flush: flush,
    Straight: straight,
    "Three of a Kind": three.flat(),
    "Two Pair": pairs.flat(),
    Pair: pairs.flat(),
    "High Card": ranked.length
      ? [ranked.reduce((a, c) => (value(c) > value(a) ? c : a))]
      : [],
  };
  const scores = new Set(byHand[name]);
  const scoring = cards.filter(
    (c) =>
      scores.has(c) ||
      c.enhancement === "m_stone" ||
      jokers.includes("j_splash"),
  );
  return { name, scoring };
}

/** What a Spectral does to a card's seal. */
const SEALS: Record<string, string> = {
  c_talisman: "Gold",
  c_deja_vu: "Red",
  c_trance: "Blue",
  c_medium: "Purple",
};

/** A consumable the player holds. */
interface HeldConsumable {
  set: string;
  key: string;
  edition?: string;
  /** Made by the replay and not shown by the log yet. */
  unseen?: boolean;
  /** The replay before it rolled this card; absent for a card made without a roll. */
  before?: ShopSim;
}

/** The queue a card was rolled from, as far as checking it goes. */
function familyOf(key: string, source: string): string {
  if (key.startsWith("j_")) return "joker";
  if (key.startsWith("v_")) return "voucher";
  const set = TAROTS.has(key)
    ? "Tarot"
    : PLANETS.has(key)
      ? "Planet"
      : "Spectral";
  return source.endsWith("Pack") ? `${set}:pack` : set;
}

const TAROTS = new Set(pools.tarots);
const RARITY = new Map<string, 1 | 2 | 3>();
for (const r of [1, 2, 3] as const)
  for (const k of (pools.jokers as Record<string, string[]>)[r])
    RARITY.set(k, r);
const PLANETS = new Set(pools.planets.map((p) => p.key));
// ---------------------------------------------------------------------------

/** Replays one player's log and lists what they blocked. */
export function findBlocks(
  events: readonly LogEvent[],
  settings: ReaderSettings,
  /** Debugging: called with a line for every event, roll and check. */
  trace?: (line: string) => void,
  /**
   * Debugging: move a stream on by `n` draws right before event `at`, to test whether a draw
   * the replay doesn't make happened there (scripts/probe-replays.ts).
   */
  probe?: { at: number; stream: string; n: number },
  /**
   * Jokers blocked from an event on because the player looked at them as lobby avatars (a
   * bug in Multiplayer 1.0.5: the avatar card stays in G.GAME.used_jokers for the rest of the
   * run). findBlocksAuto finds them.
   */
  avatars: readonly AvatarBlock[] = [],
): BlockReport {
  const missedShop: { key: string; at: number }[] = [];
  const avatarsOut = avatars.map((a) => ({ ...a }));
  let eventAt = 0;
  let shopEvent = 0;
  const avatarNow = (key: string) =>
    avatars.some((a) => a.key === key && eventAt >= a.from);
  const hits: BlockHit[] = [];
  const agreement = {
    shop: { checked: 0, matched: 0 },
    packs: { checked: 0, matched: 0 },
    made: { checked: 0, matched: 0 },
    jokers: { checked: 0, matched: 0 },
  };
  let firstMiss: string | undefined;

  // Where we are.
  let ante = 1;
  let blind = "Small Blind";
  let inShop = false;
  let bossesBeaten = 0;
  let afterBoss = false;
  let nextBlind: "small" | "big" | "boss" = "small";
  let handsThisRound = 0;
  const place = () =>
    `Ante ${ante} · ${inShop ? `Shop after ${blind}` : blind}`;
  // Hits waiting for the next card their queue shows, to know whether the replay was in line.
  const pending = new Map<string, BlockHit[]>();
  const check = (a: Agreement, ok: boolean, family: string) => {
    trace?.(`  check ${family}: ${ok ? "ok" : "MISS"}`);
    a.checked++;
    if (ok) a.matched++;
    else firstMiss ??= place();
    for (const h of pending.get(family) ?? []) h.sure = ok;
    pending.delete(family);
  };

  // What the player has. Money starts at $4 and moves with every money_delta (ease_dollars).
  let dollars = 4;
  const items = new Map<number, { set: string; key: string }>();
  const cards = new Map<number, PlayingCard>();
  const jokers = new Map<number, { key: string; edition?: string }>();
  const consumables = new Map<number, HeldConsumable>();
  const vouchers = new Set<string>();
  const redeemed: { ante: number; key: string }[] = [];
  let synthetic = 1e9;
  let lastTarotPlanet: string | undefined;
  /** G.GAME.last_hand_played: a Blue Seal makes its planet. */
  let lastHand: string | undefined;

  // What's on screen.
  let shop: (string | null)[] = [];
  let pack: string[] = [];
  let picksLeft = 0;
  let forcedRarity: 2 | 3 | undefined;

  const played = new Set<string>();
  let extinct = false;
  let pincherLocked = settings.ruleset.pennyPincher ?? false;

  let sim = new ShopSim(settings, { vouchers: {} });
  let skips: { key: string; reason: "owned" | "locked" }[] = [];
  sim.watch((key, reason) => skips.push({ key, reason }));

  const heldKeys = () =>
    new Set([
      ...[...jokers.values()].map((j) => j.key),
      ...[...consumables.values()].map((c) => c.key),
    ]);

  const why = (key: string): string | undefined => {
    if (GATES[key]) return `No ${GATE_NAME[GATES[key]]} Card in the deck yet`;
    if (key === "j_mp_penny_pincher") return "Opens at the first PvP blind";
    if (key === "j_cavendish") return "Gros Michel hasn't gone extinct";
    if (key === "j_gros_michel") return "Gros Michel went extinct";
    const soft = SOFTLOCKS.find((s) => s.planet === key);
    if (soft) return `No ${soft.hand} played yet`;
    return undefined;
  };

  /**
   * The consumable being used: it's out of its slot but still exists until its use is over,
   * so what it makes skips its key (The Emperor never makes an Emperor).
   */
  let using: string | undefined;

  /** Sets what the game skips, from what's held and on screen. */
  const syncOwned = (s: ShopSim) => {
    s.owned.clear();
    if ([...jokers.values()].some((j) => j.key === "j_ring_master")) return;
    for (const k of heldKeys()) s.owned.add(k);
    if (using) s.owned.add(using);
    for (const a of avatars) if (eventAt >= a.from) s.owned.add(a.key);
    for (const k of shop) if (k) s.owned.add(k);
    for (const k of pack) if (k) s.owned.add(k);
  };

  const commit = (source: string, found: typeof skips) => {
    const held = heldKeys();
    for (const s of found) {
      const avatar = s.reason === "owned" && avatarNow(s.key);
      if (s.reason === "owned" && !held.has(s.key) && !avatar) continue; // on screen, not held
      const hit: BlockHit = {
        key: s.key,
        reason: s.reason === "owned" ? "held" : "locked",
        source,
        ante,
        place: place(),
        why:
          s.reason === "locked"
            ? why(s.key)
            : avatar && !held.has(s.key)
              ? "Probably a lobby avatar (Multiplayer 1.0.5 bug)"
              : undefined,
        sure: false,
      };
      hits.push(hit);
      const f = familyOf(s.key, source);
      pending.set(f, [...(pending.get(f) ?? []), hit]);
    }
  };

  /** One roll on the replay's queues; the cards it passes by are recorded. */
  const roll = <T>(source: string, fn: (s: ShopSim) => T): T => {
    syncOwned(sim);
    skips = [];
    const out = fn(sim);
    commit(source, skips);
    skips = [];
    return out;
  };

  /**
   * Rolls a queue on until `key` comes up (what took the rolls in between isn't in the log),
   * and goes on from there. Nothing is recorded for those rolls. False if it doesn't come up.
   */
  const resync = (set: string, key: string): boolean => {
    const rarity = RARITY.get(key);
    if (!CONSUMABLE_SETS.has(set) && !rarity) return false;
    const fork = sim.fork();
    for (let n = 0; n < 10; n++) {
      syncOwned(fork);
      const got = CONSUMABLE_SETS.has(set)
        ? fork.consumable(set as ConsumableSet)
        : fork.otherJoker(rarity).key;
      if (got === key) {
        skips = [];
        sim = fork;
        trace?.(`  resync ${set}: ${n + 1} rolls on`);
        return true;
      }
    }
    skips = [];
    return false;
  };

  // Consumables ------------------------------------------------------------

  const startSlots = () => ({
    jokers: start.jokerSlots,
    consumables: start.consumableSlots,
  });

  const consumableLimit = () =>
    2 +
    (startSlots().consumables ?? 0) +
    (vouchers.has("v_crystal_ball") ? 1 : 0) +
    [...consumables.values()].filter((c) => c.edition === "negative").length;
  const consumableRoom = () => consumableLimit() - consumables.size;

  /** A consumable made by a joker, a seal or a Tarot, when there's room for it. */
  const makeConsumable = (source: string, set: ConsumableSet) => {
    if (consumableRoom() <= 0) return;
    const before = sim.fork();
    const key = roll(source, (s) => s.consumable(set));
    consumables.set(synthetic++, { set, key, unseen: true, before });
    trace?.(
      `  ${source} made ${key} (held: ${[...consumables.values()].map((c) => c.key + (c.unseen ? "?" : "")).join(" ")})`,
    );
  };

  /**
   * The replay rolled `c` but the game had `key` there: the game's queue was some draws ahead
   * (made by something the replay doesn't follow). Find how many from the roll, and move the
   * queue on by as many.
   */
  const realign = (c: HeldConsumable, key: string): boolean => {
    if (!c.before || !CONSUMABLE_SETS.has(c.set)) return false;
    const set = c.set as ConsumableSet;
    for (let k = 1; k <= 6; k++) {
      const f = c.before.fork();
      f.skip(`${set}${set}0`, k);
      const got = f.consumable(set);
      skips = [];
      if (got === key) {
        sim.skip(`${set}${set}0`, k);
        trace?.(`  realign ${set}: ${k} ahead`);
        return true;
      }
    }
    return false;
  };

  /**
   * A consumable the log shows for the first time without it being bought or picked: one the
   * replay made (checked), a card made without a roll (The Fool, a Blue Seal), or one made by
   * something the replay doesn't follow (the queue is rolled on until it comes up).
   */
  const sightMade = (
    id: number,
    set: string,
    key: string,
    edition?: string,
  ) => {
    if (consumables.has(id)) return;
    const unseen = [...consumables].filter(([, c]) => c.unseen);
    const same = unseen.find(([, c]) => c.key === key);
    if (same) {
      consumables.delete(same[0]);
      consumables.set(id, { set, key, edition });
      if (same[1].before) check(agreement.made, true, set);
      return;
    }
    const blueSeal =
      set === "Planet" &&
      lastHand !== undefined &&
      PLANET_OF[lastHand] === key &&
      [...cards.values()].some((c) => c.alive && c.seal === "Blue");
    if (blueSeal) {
      // A Blue Seal's planet: the last hand's, by key.
    } else if (CONSUMABLE_SETS.has(set)) {
      const wrong = unseen.find(([, c]) => c.set === set && c.before);
      if (wrong) {
        consumables.delete(wrong[0]);
        check(agreement.made, false, set);
        if (!realign(wrong[1], key)) resync(set, key);
      } else check(agreement.made, resync(set, key), set);
    }
    consumables.set(id, { set, key, edition });
  };

  // Jokers -----------------------------------------------------------------

  const updateLocks = () => {
    const enh = new Set<string>();
    for (const c of cards.values())
      if (c.alive && c.enhancement) enh.add(c.enhancement);
    sim.setLocks({
      enhancements: [...enh],
      grosMichelExtinct: extinct,
      softlocked: SOFTLOCKS.filter((s) => !played.has(s.hand)).map(
        (s) => s.planet,
      ),
    });
  };

  /** Learns a card from a ref; returns its id and what it is. */
  const learn = (ref: unknown) => {
    if (!Array.isArray(ref) || typeof ref[0] !== "number") return undefined;
    const r = ref as Ref;
    const id = Math.abs(r[0] as number);
    if ((r[0] as number) < 0) {
      if (r[1] === "pc")
        cards.set(id, {
          suit: r[2] as string,
          rank: r[3] as string,
          enhancement: mod(r, "e:"),
          seal: mod(r, "s:"),
          alive: true,
        });
      else items.set(id, { set: r[1] as string, key: r[2] as string });
    } else {
      const c = cards.get(id);
      if (c) {
        c.enhancement = mod(r, "e:");
        c.seal = mod(r, "s:");
      }
    }
    return {
      id,
      fresh: (r[0] as number) < 0,
      item: items.get(id),
      card: cards.get(id),
      edition: mod(r, "ed:"),
    };
  };
  const learnAll = (refs: unknown) =>
    Array.isArray(refs) ? refs.map(learn) : [];

  /** A consumable ref the log shows outside a buy or a pick. */
  const seeConsumable = (ref: unknown) => {
    const got = learn(ref);
    if (got?.item && CONSUMABLE_SETS.has(got.item.set))
      sightMade(got.id, got.item.set, got.item.key, got.edition);
    return got;
  };

  const jokerLimit = () =>
    5 +
    (startSlots().jokers ?? 0) +
    (vouchers.has("v_antimatter") ? 1 : 0) +
    [...jokers.values()].filter((j) => j.edition === "negative").length;
  const room = () => jokerLimit() - jokers.size;

  let expectedNew: string[] = [];
  const makeJokers = (
    source: string,
    n: number,
    rarity: 1 | 3 | 4 | "judgement",
  ) => {
    for (let i = 0; i < n && room() > 0; i++) {
      const j = roll(source, (s) => s.otherJoker(rarity));
      trace?.(`  ${source} made ${j.key}`);
      jokers.set(synthetic++, { key: j.key, edition: j.edition });
      expectedNew.push(j.key);
    }
  };

  /** The jokers in order, as the next hand shows them (the log has no order before that). */
  const nextJokerOrder = (from: number): string[] => {
    const held = [...jokers.values()].map((j) => j.key);
    for (let j = from; j < events.length; j++)
      if (events[j][1] === "play") {
        // Only the jokers held now, in the hand's order; jokers made since are left out.
        const left = [...held];
        const order: string[] = [];
        for (const t of (events[j][2] as unknown[])[2] as string[]) {
          const at = left.indexOf(t.split("|")[0]);
          if (at >= 0) order.push(...left.splice(at, 1));
        }
        return [...order, ...left];
      }
    return held;
  };

  /** Probability rolls: Oops! All 6s doubles the odds. */
  const odds = () =>
    2 ** [...jokers.values()].filter((j) => j.key === "j_oops").length;

  // Shop -------------------------------------------------------------------

  const shopSize = () =>
    2 +
    (vouchers.has("v_overstock_norm") ? 1 : 0) +
    (vouchers.has("v_overstock_plus") ? 1 : 0);

  const shopSlot = () => {
    const item = roll("Shop", (s) => s.next());
    return item.kind === "card" ? null : item.key;
  };

  /**
   * The shop's slots. An Uncommon or Rare Tag fills every slot of the shop it opens with its
   * joker (seen in a real match: both slots, then the rerolls are the usual cards). The code
   * says the tag triggers once (tag.triggered), so this is from the log, not the Lua.
   */
  const rollShop = (forced?: 2 | 3) => {
    shop = [];
    for (let i = 0; i < shopSize(); i++)
      shop.push(
        forced
          ? roll(forced === 2 ? "Uncommon Tag" : "Rare Tag", (s) =>
              s.tagJoker(forced),
            ).key
          : shopSlot(),
      );
    trace?.(`${place()} shop: ${shop.join(" ")}`);
  };

  const redeem = (key: string) => {
    vouchers.add(key);
    redeemed.push({ ante: bossesBeaten + 1, key });
    if ((SHOP_VOUCHERS as readonly string[]).includes(key) && sim.mods.vouchers)
      sim.mods.vouchers[key as ShopVoucher] = sim.slots + 1;
    if (key === "v_overstock_norm" || key === "v_overstock_plus")
      shop.push(shopSlot());
  };

  /** A Tarot, Planet or Spectral used: on cards, or making cards. */
  const applyUse = (key: string, targets: ReturnType<typeof learn>[]) => {
    using = key;
    try {
      applyEffects(key, targets);
    } finally {
      using = undefined;
    }
    if (TAROTS.has(key) || PLANETS.has(key)) lastTarotPlanet = key;
  };
  const applyEffects = (key: string, targets: ReturnType<typeof learn>[]) => {
    const hit = targets.flatMap((t) => (t?.card ? [t.card] : []));
    if (ENHANCES[key]) for (const c of hit) c.enhancement = ENHANCES[key];
    if (SUITS[key]) for (const c of hit) c.suit = SUITS[key];
    if (SEALS[key]) for (const c of hit) c.seal = SEALS[key];
    if (key === "c_strength")
      for (const c of hit)
        c.rank = RANKS[(RANKS.indexOf(c.rank) + 1) % RANKS.length] ?? c.rank;
    if (key === "c_death" && hit.length === 2)
      Object.assign(hit[0], { ...hit[1], alive: true });
    if (key === "c_hanged_man") for (const c of hit) c.alive = false;
    if (key === "c_judgement" && room() > 0)
      makeJokers("Judgement", 1, "judgement");
    if (key === "c_wraith" && room() > 0) makeJokers("Wraith", 1, 3);
    if (key === "c_soul" && room() > 0) makeJokers("The Soul", 1, 4);
    // The used card has left its slot already (G.FUNCS.use_card), so it doesn't take room.
    if (key === "c_emperor" || key === "c_high_priestess") {
      const n = Math.min(2, consumableRoom());
      for (let i = 0; i < n; i++)
        makeConsumable(
          key === "c_emperor" ? "The Emperor" : "The High Priestess",
          key === "c_emperor" ? "Tarot" : "Planet",
        );
    }
    if (
      key === "c_fool" &&
      lastTarotPlanet &&
      lastTarotPlanet !== "c_fool" &&
      consumableRoom() > 0
    )
      consumables.set(synthetic++, {
        set: TAROTS.has(lastTarotPlanet) ? "Tarot" : "Planet",
        key: lastTarotPlanet,
        unseen: true,
      });
  };

  const removeJoker = (id: number, key?: string) => {
    if (jokers.delete(id)) return;
    for (const [k, j] of jokers)
      if (j.key === key && k >= 1e9) {
        jokers.delete(k);
        return;
      }
    for (const [k, j] of jokers)
      if (j.key === key) {
        jokers.delete(k);
        return;
      }
  };

  /** A joker the replay made, shown by the log before the next hand (sold or moved). */
  const confirmJoker = (got: ReturnType<typeof learn>) => {
    if (!got?.fresh || got.item?.set !== "Joker") return;
    const at = expectedNew.indexOf(got.item.key);
    if (at < 0) return;
    expectedNew.splice(at, 1);
    check(agreement.jokers, true, "joker");
  };

  /** A joker in the log that the replay doesn't have yet: one it made, or one it missed. */
  const bindJoker = (id: number, key: string, edition?: string) => {
    if (jokers.has(id)) return;
    for (const [k, j] of jokers)
      if (k >= 1e9 && j.key === key) {
        jokers.delete(k);
        jokers.set(id, { key, edition });
        return;
      }
    jokers.set(id, { key, edition });
  };

  for (const [r, keys] of Object.entries(settings.ruleset.added.jokers ?? {}))
    for (const k of keys ?? [])
      if (Number(r) < 4) RARITY.set(k, Number(r) as 1 | 2 | 3);
  const tags = tagQueue(settings, 12);

  // The deck's starting vouchers and consumables.
  const run = events.find((e) => e[1] === "run_info")?.[2] as
    | { deck?: string }
    | undefined;
  const start = DECK_START[deckKey(run?.deck) ?? ""] ?? {};
  dollars += start.dollars ?? 0;
  for (const v of start.vouchers ?? []) {
    vouchers.add(v);
    if ((SHOP_VOUCHERS as readonly string[]).includes(v) && sim.mods.vouchers)
      sim.mods.vouchers[v as ShopVoucher] = 1;
  }
  for (const c of start.consumables ?? [])
    consumables.set(synthetic++, {
      set: TAROTS.has(c) ? "Tarot" : PLANETS.has(c) ? "Planet" : "Spectral",
      key: c,
      unseen: true,
    });

  /** The first blind after a boss, played or skipped, starts the next ante. */
  const newAnte = () => {
    if (!afterBoss) return;
    ante++;
    afterBoss = false;
  };

  events.forEach((e, i) => {
    const [, op, args] = e;
    const a = (args ?? []) as unknown[];
    eventAt = i;
    if (op === "cashout" || op === "reroll") shopEvent = i;
    for (const a of avatarsOut) if (a.from === i) a.place = place();
    updateLocks();
    if (probe && probe.at === i) sim.skip(probe.stream, probe.n);
    if (trace && op !== "money_delta" && op !== "hand_scored")
      trace(`#${i} ${op} $${dollars} ${JSON.stringify(args).slice(0, 150)}`);
    switch (op) {
      case "money_delta":
        dollars += Number(a[0]) || 0;
        break;
      case "select_blind": {
        const key = a[1] as string;
        newAnte();
        inShop = false;
        shop = [];
        handsThisRound = 0;
        blind = blindName(key);
        nextBlind =
          key === "bl_small" ? "big" : key === "bl_big" ? "boss" : "small";
        // setting_blind, joker by joker (copies included).
        for (const k of acting(nextJokerOrder(i))) {
          if (k === "j_riff_raff") makeJokers("Riff-raff", 2, 1);
          if (k === "j_cartomancer") makeConsumable("Cartomancer", "Tarot");
        }
        if (key.startsWith("bl_mp_") && pincherLocked) {
          // update_draw_to_hand, after Riff-raff's setting_blind.
          pincherLocked = false;
          sim.pincherUnlocked = true;
        }
        break;
      }
      case "skip_blind": {
        newAnte();
        const t = tags[ante - 1];
        const tag = nextBlind === "small" ? t?.small : t?.big;
        blind = nextBlind === "small" ? "Small Blind" : "Big Blind";
        nextBlind = nextBlind === "small" ? "big" : "boss";
        if (tag === "tag_top_up") makeJokers("Top-up Tag", 2, 1);
        if (tag === "tag_uncommon") forcedRarity = 2;
        if (tag === "tag_rare") forcedRarity = 3;
        break;
      }
      case "cashout":
        if (blind !== "Small Blind" && blind !== "Big Blind") {
          bossesBeaten++;
          afterBoss = true;
        }
        inShop = true;
        rollShop(forcedRarity);
        forcedRarity = undefined;
        break;
      case "reroll":
        rollShop();
        break;
      case "leave_shop":
        shop = [];
        break;
      case "buy": {
        const got = learn(a[2]);
        const slot = (a[1] as number) - 1;
        if (got?.item) {
          const { key, set } = got.item;
          let at = shop[slot] === key ? slot : shop.indexOf(key);
          check(agreement.shop, at >= 0, familyOf(key, "Shop"));
          if (at < 0 && shop[slot]?.startsWith("j_"))
            missedShop.push({ key: shop[slot] as string, at: shopEvent });
          if (at < 0) {
            at = slot;
            resync(set, key);
          }
          shop.splice(at, 1);
          if (set === "Joker")
            jokers.set(got.id, { key, edition: got.edition });
          else if (CONSUMABLE_SETS.has(set)) {
            if (a[4] === true) applyUse(key, []);
            else consumables.set(got.id, { set, key, edition: got.edition });
          }
        } else if (got?.card) shop.splice(slot, 1);
        break;
      }
      case "open_pack": {
        const got = learn(a[2]);
        const key = got?.item?.key ?? "";
        const info = PACK_INFO.get(key) ?? { size: 0, choose: 0 };
        const kind = packKind(key);
        const name = got?.item ? packName(key) : "Pack";
        pack = [];
        picksLeft = info.choose;
        for (let n = 0; n < info.size; n++) {
          if (kind === "buffoon")
            pack.push(roll(name, (s) => s.buffoonCard()).key);
          else if (kind === "arcana")
            pack.push(roll(name, (s) => s.packConsumable("Tarot")));
          else if (kind === "spectral")
            pack.push(roll(name, (s) => s.packConsumable("Spectral")));
          else if (kind === "celestial") {
            // Telescope: the first card is the most played hand's planet, not rolled.
            if (n === 0 && vouchers.has("v_telescope")) pack.push("");
            else pack.push(roll(name, (s) => s.packConsumable("Planet")));
          }
        }
        if (kind === "standard") pack = [];
        trace?.(`  pack: ${pack.join(" ")}`);
        // open_booster: Hallucination, 1 in 2 (TheOrder.toml: "halu" .. ante_based() = "halu0").
        for (const k of acting([...jokers.values()].map((j) => j.key)))
          if (k === "j_hallucination" && consumableRoom() > 0)
            if (sim.chance("halu0") < odds() / 2)
              makeConsumable("Hallucination", "Tarot");
        break;
      }
      case "pack_pick": {
        const got = learn(a[2]);
        const targets = learnAll(a[3]);
        if (got?.item) {
          const { key, set } = got.item;
          let at = pack.indexOf(key);
          if (at < 0 && set === "Planet") at = pack.indexOf("");
          check(agreement.packs, at >= 0, familyOf(key, "Pack"));
          if (at >= 0) pack.splice(at, 1);
          if (set === "Joker")
            jokers.set(got.id, { key, edition: got.edition });
          else applyUse(key, targets);
        }
        picksLeft--;
        if (picksLeft <= 0) pack = [];
        break;
      }
      case "pack_skip": {
        for (const ref of (a[0] as unknown[]) ?? []) {
          const got = learn(ref);
          if (!got?.item) continue;
          let at = pack.indexOf(got.item.key);
          if (at < 0 && got.item.set === "Planet") at = pack.indexOf("");
          check(agreement.packs, at >= 0, familyOf(got.item.key, "Pack"));
          if (at >= 0) pack.splice(at, 1);
        }
        pack = [];
        break;
      }
      case "use": {
        const got = seeConsumable(a[2]);
        const targets = learnAll(a[3]);
        if (!got?.item) break;
        const { key, set } = got.item;
        if (set === "Voucher") redeem(key);
        else {
          consumables.delete(got.id);
          applyUse(key, targets);
        }
        break;
      }
      case "sell": {
        const got = a[0] === 4 ? learn(a[2]) : seeConsumable(a[2]);
        confirmJoker(got);
        if (!got?.item) break;
        if (a[0] === 4) removeJoker(got.id, got.item.key);
        else consumables.delete(got.id);
        break;
      }
      case "reorder":
        for (const m of (a[2] as unknown[][]) ?? []) {
          const got = a[0] === 5 ? seeConsumable(m[0]) : learn(m[0]);
          confirmJoker(got);
          if (a[0] === 4 && got?.item?.set === "Joker")
            bindJoker(got.id, got.item.key, got.edition);
        }
        break;
      case "discard":
        // A Purple Seal discarded makes a Tarot.
        for (const t of learnAll(a[1]))
          if (t?.card?.seal === "Purple")
            makeConsumable("Purple Seal", "Tarot");
        break;
      case "play": {
        const hand = learnAll(a[1]).flatMap((t) => (t?.card ? [t.card] : []));
        const tokens = ((a[2] as string[]) ?? []).map((t) => {
          const [key, edition] = t.split("|");
          return { key, edition };
        });
        // The jokers made since the last hand should be here.
        for (const key of expectedNew)
          check(
            agreement.jokers,
            tokens.some((t) => t.key === key),
            "joker",
          );
        expectedNew = [];
        // The snapshot is what the player has: drop what's gone, add what's new.
        const want = new Map<string, number>();
        for (const t of tokens) want.set(t.key, (want.get(t.key) ?? 0) + 1);
        for (const [id, j] of [...jokers]) {
          const n = want.get(j.key) ?? 0;
          if (n > 0) want.set(j.key, n - 1);
          else {
            // Gone without being sold: Gros Michel going extinct opens Cavendish.
            if (j.key === "j_gros_michel") extinct = true;
            jokers.delete(id);
          }
        }
        for (const [key, n] of want)
          for (let k = 0; k < n; k++) {
            const edition = tokens.find((t) => t.key === key)?.edition;
            jokers.set(synthetic++, { key, edition });
          }
        const keys = tokens.map((t) => t.key);
        const roles = acting(keys);
        const { name, scoring } = evaluateHand(hand, keys);
        played.add(name);
        lastHand = name;
        trace?.(
          `  hand: ${hand.map((c) => `${c.rank}${c.suit[0]}${c.enhancement ? `(${c.enhancement.slice(2)})` : ""}${c.seal ? `[${c.seal}]` : ""}`).join(" ")} = ${name}`,
        );
        // individual: 8 Ball, for every scoring 8 and every retrigger (Red Seal, Seltzer, the
        // mod's Hanging Chad on the first two scoring cards), while there's room.
        const balls = roles.filter((k) => k === "j_8_ball").length;
        if (balls)
          scoring.forEach((c, at) => {
            if (c.rank !== "8" || c.enhancement === "m_stone") return;
            const reps =
              1 +
              (c.seal === "Red" ? 1 : 0) +
              roles.filter((k) => k === "j_mp_seltzer" || k === "j_selzer")
                .length +
              (at < 2
                ? roles.filter((k) => k === "j_mp_hanging_chad").length
                : 0);
            for (let r = 0; r < reps * balls; r++)
              if (consumableRoom() > 0 && sim.chance("8ball") < odds() / 4)
                makeConsumable("8 Ball", "Tarot");
          });
        // joker_main, joker by joker (copies included). The money is what it was before the
        // hand: what the hand earns is added after.
        for (const k of roles) {
          if (k === "j_vagabond" && dollars <= 4)
            makeConsumable("Vagabond", "Tarot");
          if (
            k === "j_superposition" &&
            /Straight/.test(name) &&
            scoring.some((c) => c.rank === "Ace")
          )
            makeConsumable("Superposition", "Tarot");
          if (k === "j_seance" && name === "Straight Flush")
            makeConsumable("Séance", "Spectral");
        }
        // destroying_card: Sixth Sense (not copied).
        if (
          keys.includes("j_sixth_sense") &&
          handsThisRound === 0 &&
          hand.length === 1 &&
          hand[0].rank === "6"
        ) {
          makeConsumable("Sixth Sense", "Spectral");
          hand[0].alive = false;
        }
        handsThisRound++;
        break;
      }
    }
  });

  // Vouchers: each ante's offers, with what the player had redeemed by then.
  voucherQueue(
    settings,
    bossesBeaten + 1,
    (va, key) => redeemed.some((r) => r.ante === va && r.key === key),
    start.vouchers ?? [],
    (va, keys) => {
      for (const key of keys)
        hits.push({
          key,
          reason: "held",
          source: "Vouchers",
          ante: va,
          place: `Ante ${va} · Vouchers`,
          sure: true,
        });
    },
  );

  return {
    settings,
    hits,
    agreement,
    firstMiss,
    missedShop,
    avatars: avatarsOut,
  };
}

const misses = (r: BlockReport) =>
  Object.values(r.agreement).reduce((n, a) => n + a.checked - a.matched, 0);

/** Versions with the lobby-avatar bug (fixed in the next update). */
const AVATAR_BUG = new Set(["1.0.5"]);

/**
 * findBlocks, with the lobby-avatar bug worked out. In Multiplayer 1.0.5, looking at the
 * players' avatars in the lobby info leaves those jokers in G.GAME.used_jokers, so the shop
 * and packs skip them from then on. The log doesn't say when (or whether) anyone looked, so
 * this only speculates where nothing else explains a miss: each joker the replay had in a
 * slot where the player bought something else is tried as blocked, from the start of the run
 * or from the shop where it first missed, alone or with one other (each player has an
 * avatar; a match on record had both blocked). The block is kept only when it takes away two
 * misses or more, or all of them.
 */
export function findBlocksAuto(
  events: readonly LogEvent[],
  settings: ReaderSettings,
): BlockReport {
  const base = findBlocks(events, settings);
  const lobby = events.find((e) => e[1] === "lobby_info")?.[2] as
    | { options?: { mod_version?: string } }
    | undefined;
  if (!AVATAR_BUG.has(lobby?.options?.mod_version ?? "")) return base;
  const options = new Map<string, AvatarBlock[]>();
  for (const m of base.missedShop)
    if (!options.has(m.key) && options.size < 4)
      // The later start first: on a tie it's kept, as it claims fewer blocked rolls.
      options.set(m.key, [
        ...(m.at > 0 ? [{ key: m.key, from: m.at }] : []),
        { key: m.key, from: 0 },
      ]);
  const each = [...options.values()];
  const sets: AvatarBlock[][] = [
    ...each.flat().map((a) => [a]),
    ...each.flatMap((as, i) =>
      each
        .slice(i + 1)
        .flatMap((bs) => as.flatMap((a) => bs.map((b) => [a, b]))),
    ),
  ];
  let best = base;
  for (const set of sets) {
    const r = findBlocks(events, settings, undefined, undefined, set);
    // Fewer misses wins; on a tie, fewer avatars.
    if (
      misses(r) < misses(best) ||
      (misses(r) === misses(best) && r.avatars.length < best.avatars.length)
    )
      best = r;
  }
  const gain = misses(base) - misses(best);
  return gain >= 2 || (gain > 0 && misses(best) === 0) ? best : base;
}

function packName(key: string): string {
  const kind = packKind(key);
  const size = /_jumbo_/.test(key)
    ? "Jumbo "
    : /_mega_/.test(key)
      ? "Mega "
      : "";
  const name =
    {
      buffoon: "Buffoon",
      arcana: "Arcana",
      celestial: "Celestial",
      spectral: "Spectral",
      standard: "Standard",
    }[kind as "buffoon"] ?? "";
  return `${size}${name} Pack`;
}
