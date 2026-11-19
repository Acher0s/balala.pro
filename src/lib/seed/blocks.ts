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
  bannedKeys,
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
   * Jokers the replay had in a shop slot where the player bought something else, or in a pack
   * that showed a joker the replay didn't have, with the event that rolled that shop or pack.
   */
  missedShop: { key: string; at: number }[];
  /** Jokers taken to be blocked by the lobby's avatars from an event on (findBlocksAuto). */
  avatars: AvatarBlock[];
}

/** Why a roll passed a card by, in a walkthrough step. */
export type PassedBy = "held" | "on screen" | "in use" | "avatar" | "locked";

/** One roll the replay made in a step: what it gave, and the cards it passed by on the way. */
export interface StepRoll {
  /** What was rolling: "Shop", "Buffoon Pack", "The Emperor", … */
  source: string;
  /** The key it landed on ("j_blueprint", "c_moon"), or a playing card's "H_K". */
  got?: string;
  passed: { key: string; by: PassedBy; why?: string }[];
}

/** One event of a log, replayed: for the walkthrough and a late start of the seed reader. */
export interface ReplayStep {
  /** The event's index in the log. */
  at: number;
  op: string;
  /** The cards the event names (bought, picked, used, sold), by key. */
  keys: string[];
  ante: number;
  place: string;
  dollars: number;
  rolls: StepRoll[];
  /** Cards the log showed here and whether the replay had them there ("Shop", "Tarot", …). */
  checks: { family: string; ok: boolean }[];
  /** The seed reader's settings for reading on from right after this event. */
  settings: ReaderSettings;
}

/** Events a walkthrough shows even when nothing rolled. */
const STEP_OPS = new Set([
  "select_blind",
  "skip_blind",
  "cashout",
  "reroll",
  "leave_shop",
  "buy",
  "open_pack",
  "pack_pick",
  "pack_skip",
  "use",
  "sell",
]);

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
      stake: readerStake(run.stake ?? 1),
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

/**
 * The reader's stake for the log's. The game numbers the mod's stakes after Gold
 * (objects/stakes, loaded in that order): Planet 9 (Eternals and Perishables, like Orange),
 * Spectral 10 (and Rentals, like Gold), Spectral+ 11 (the reader's 9). Only the stickers matter
 * to the rolls.
 */
function readerStake(stake: number): number {
  return stake === 9 ? 7 : stake === 10 ? 8 : stake === 11 ? 9 : stake;
}

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

/** Cards that put new playing cards in the deck, which the log shows only once drawn. */
const CARD_MAKERS = new Set([
  "c_familiar",
  "c_grim",
  "c_incantation",
  "c_cryptid",
]);

/**
 * Playing cards the log first shows already enhanced, though not as a pick or a buy: they were
 * made unseen (Incantation, Familiar, Grim, Cryptid; Marble Joker's Stone Cards), so the deck
 * had that enhancement from the last such card's use (or from the start if there was none).
 * The enhancement-gated jokers follow it: an Incantation's Steel Card opens Steel Joker
 * before the card is ever drawn.
 */
export function hiddenEnhanced(
  events: readonly LogEvent[],
): { id: number; enhancement: string; from: number }[] {
  const out: { id: number; enhancement: string; from: number }[] = [];
  const keys = new Map<number, string>();
  let maker = 0;
  let marble = 0;
  const keyOf = (ref: unknown) => {
    if (!Array.isArray(ref) || typeof ref[0] !== "number") return undefined;
    if (ref[0] < 0 && typeof ref[2] === "string") {
      keys.set(-ref[0], ref[2]);
      return ref[2];
    }
    return keys.get(ref[0]);
  };
  const scan = (value: unknown, at: number, skip?: unknown) => {
    if (!Array.isArray(value) || value === skip) return;
    if (
      value[0] !== undefined &&
      typeof value[0] === "number" &&
      value[1] === "pc"
    ) {
      if (value[0] >= 0) return;
      const e = mod(value as Ref, "e:");
      if (e)
        out.push({
          id: -value[0],
          enhancement: e,
          from: e === "m_stone" ? Math.max(maker, marble) : maker,
        });
      return;
    }
    for (const v of value) scan(v, at, skip);
  };
  events.forEach(([, op, args], i) => {
    const a = (args ?? []) as unknown[];
    if (op === "use" || op === "pack_pick") {
      const key = keyOf(a[2]);
      if (key && CARD_MAKERS.has(key)) maker = i;
    }
    if (op === "select_blind") {
      for (let j = i; j < events.length; j++)
        if (events[j][1] === "play") {
          if (
            ((events[j][2] as unknown[])[2] as string[]).some((t) =>
              t.startsWith("j_marble"),
            )
          )
            marble = i;
          break;
        }
    }
    // A card picked or bought is seen as it arrives, a skipped pack's cards never join the
    // deck, and the cards a Tarot or Spectral is used on may show it done already: none count.
    if (
      [
        "lobby_info",
        "run_info",
        "deck_snapshot",
        "use",
        "pack_pick",
        "pack_skip",
      ].includes(op)
    )
      return;
    scan(a, i, op === "buy" ? a[2] : undefined);
  });
  return out;
}

/**
 * Jokers that leave between two hands without being sold (Gros Michel going extinct, Popcorn or
 * Turtle Bean running out, Ankh or Hex, Ceremonial Dagger, Madness): the log only shows them
 * gone at the next hand. Each is taken off at the first point it could have gone: an Ankh or
 * Hex used in between, else the end of the round (cashout), else the next blind. Returns the
 * event they're taken off before, and which.
 */
function vanishedJokers(events: readonly LogEvent[]): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const keys = new Map<number, string>();
  const keyOf = (ref: unknown) => {
    if (!Array.isArray(ref) || typeof ref[0] !== "number") return undefined;
    if (ref[0] < 0 && ref[1] === "Joker") keys.set(-ref[0], ref[2] as string);
    return ref[0] < 0 ? (ref[2] as string) : keys.get(ref[0]);
  };
  let last: { at: number; keys: string[] } | undefined;
  let sold: string[] = [];
  let cut: number | undefined;
  events.forEach(([, op, args], i) => {
    const a = (args ?? []) as unknown[];
    if (op === "buy" || op === "pack_pick") keyOf(a[2]);
    if (op === "reorder")
      for (const m of (a[2] as unknown[][]) ?? []) keyOf(m[0]);
    if (op === "sell" && a[0] === 4) {
      const k = keyOf(a[2]);
      if (k) sold.push(k);
    }
    if (op === "use") {
      const k =
        Array.isArray(a[2]) && (a[2][0] as number) < 0
          ? (a[2][2] as string)
          : undefined;
      if (k === "c_ankh" || k === "c_hex") cut ??= i;
    }
    if (op === "cashout" || op === "select_blind") cut ??= i;
    if (op !== "play") return;
    const now = ((a[2] as string[]) ?? []).map((t) => t.split("|")[0]);
    if (last && cut !== undefined) {
      const left = [...now];
      const gone: string[] = [];
      for (const k of last.keys) {
        const at = left.indexOf(k);
        if (at >= 0) left.splice(at, 1);
        else {
          const s = sold.indexOf(k);
          if (s >= 0) sold.splice(s, 1);
          else gone.push(k);
        }
      }
      if (gone.length) out.set(cut, [...(out.get(cut) ?? []), ...gone]);
    }
    last = { at: i, keys: now };
    sold = [];
    cut = undefined;
  });
  return out;
}

/**
 * Consumables bought to keep that the log never shows again, while the player later buys or
 * picks the same card without Showman: the game didn't count the first as held (it offered
 * the card again), so it left without a log event. Returns the events of those buys.
 * (NKRWQ99V: a Lovers bought at #313 and never used, then offered four more times.)
 */
function unheldBuys(events: readonly LogEvent[]): Set<number> {
  const out = new Set<number>();
  const kept = new Map<number, { key: string; at: number }>();
  const seen = new Set<number>();
  let showman = false;
  events.forEach(([, op, args], i) => {
    const a = (args ?? []) as unknown[];
    const r = a[2] as Ref | undefined;
    if (op === "play")
      showman = ((a[2] as string[]) ?? []).some((t) =>
        t.startsWith("j_ring_master"),
      );
    const id =
      Array.isArray(r) && typeof r[0] === "number" ? Math.abs(r[0]) : 0;
    if (op === "use" || op === "sell") seen.add(id);
    if (op === "reorder")
      for (const m of (a[2] as unknown[][]) ?? [])
        if (Array.isArray(m[0])) seen.add(Math.abs(m[0][0] as number));
    if (
      (op === "buy" || op === "pack_pick") &&
      Array.isArray(r) &&
      (r[0] as number) < 0
    ) {
      const key = r[2] as string;
      if (!showman)
        for (const [k, c] of kept)
          if (c.key === key && !seen.has(k)) {
            out.add(c.at);
            kept.delete(k);
          }
      if (op === "buy" && CONSUMABLE_SETS.has(r[1] as string) && a[4] !== true)
        kept.set(id, { key, at: i });
    }
  });
  // A buy only counts if its card was never shown again at all.
  for (const [k, c] of kept) if (seen.has(k)) out.delete(c.at);
  return out;
}

/**
 * A softlocked planet (Planet X, Ceres, Eris) the log shows proves its hand was played before
 * the card was rolled. When the replay's reading of the hands missed it (Ouija turns the hand
 * into one rank without the log saying which cards), the hand counts as played from the roll
 * that showed the card: the shop's cashout or reroll for a buy, the pack's opening for a pick,
 * or the sighting itself otherwise. Returns the events to count the hands at, and which.
 */
function softlockEvidence(events: readonly LogEvent[]): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const keys = new Map<number, string>();
  const done = new Set<string>();
  let shopRoll = 0;
  let packRoll = 0;
  events.forEach(([, op, args], i) => {
    if (op === "cashout" || op === "reroll") shopRoll = i;
    if (op === "open_pack") packRoll = i;
    const a = (args ?? []) as unknown[];
    const refs = op === "pack_skip" ? ((a[0] as unknown[]) ?? []) : [a[2]];
    for (const r of refs) {
      if (!Array.isArray(r) || typeof r[0] !== "number") continue;
      if (r[0] < 0 && typeof r[2] === "string") keys.set(-r[0], r[2]);
      const key = r[0] < 0 ? (r[2] as string) : keys.get(r[0]);
      const soft = SOFTLOCKS.find((x) => x.planet === key);
      if (!soft || done.has(soft.hand)) continue;
      done.add(soft.hand);
      const at =
        op === "buy"
          ? shopRoll
          : op === "pack_pick" || op === "pack_skip"
            ? packRoll
            : i;
      out.set(at, [...(out.get(at) ?? []), soft.hand]);
    }
  });
  return out;
}

/** Skip tags that open a pack when taken (tag.lua); Charm and Meteor's art number is unseeded. */
const TAG_PACKS: Record<string, string> = {
  tag_buffoon: "p_buffoon_mega_1",
  tag_charm: "p_arcana_mega_1",
  tag_meteor: "p_celestial_mega_1",
  tag_ethereal: "p_spectral_normal_1",
  tag_standard: "p_standard_mega_1",
};
const TAG_NAMES: Record<string, string> = {
  tag_buffoon: "Buffoon Tag",
  tag_charm: "Charm Tag",
  tag_meteor: "Meteor Tag",
  tag_ethereal: "Ethereal Tag",
  tag_standard: "Standard Tag",
};

/** The queue a card was rolled from, as far as checking it goes. */
function familyOf(key: string, source: string): string {
  // Each rarity is its own queue.
  if (key.startsWith("j_")) return `joker:${RARITY.get(key) ?? "?"}`;
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
// The rulesets' own cards (the mod's jokers and planets), so their queue is known.
const RULESETS = PATCHES.flatMap((p) => p.rulesets);
for (const ruleset of RULESETS)
  for (const r of [1, 2, 3] as const)
    for (const k of ruleset.added.jokers?.[r] ?? []) RARITY.set(k, r);
const PLANETS = new Set([
  ...pools.planets.map((p) => p.key),
  ...RULESETS.flatMap((r) => r.added.Planet ?? []),
]);
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
  /** Filled with every step worth showing, for a walkthrough (replaySteps). */
  steps?: ReplayStep[],
): BlockReport {
  const missedShop: { key: string; at: number }[] = [];
  const avatarsOut = avatars.map((a) => ({ ...a }));
  let eventAt = 0;
  let shopEvent = 0;
  let packEvent = 0;
  /** A joker the log shows from a pack the replay rolled differently: its jokers are suspects. */
  /**
   * The jokers each queue (rarity) rolled since the log last showed it in line: when it then
   * misses, any of them that can be an avatar may have been blocked (Chaos the Clown rolled in
   * shops nobody bought from, two Commons before the miss).
   */
  const rolledSince = new Map<string, { key: string; at: number }[]>();
  const noteRolled = (key: string | null | undefined, at: number) => {
    if (!key?.startsWith("j_")) return;
    const f = familyOf(key, "");
    rolledSince.set(f, [...(rolledSince.get(f) ?? []), { key, at }]);
  };
  const suspects = (bought: string) => {
    for (const r of rolledSince.get(familyOf(bought, "")) ?? [])
      missedShop.push(r);
  };
  const missedInPack = () => {
    for (const k of pack)
      if (k.startsWith("j_")) missedShop.push({ key: k, at: packEvent });
  };
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
  let shopsEntered = 0;
  let afterBoss = false;
  let nextBlind: "small" | "big" | "boss" = "small";
  let handsThisRound = 0;
  const place = () =>
    `Ante ${ante} · ${inShop ? `Shop after ${blind}` : blind}`;
  // Hits waiting for the next card their queue shows, to know whether the replay was in line.
  const pending = new Map<string, BlockHit[]>();
  /**
   * The queues the log has just shown in line, and where: a skip there and then is sure without
   * waiting for the next card (a bought Brainstorm pins the Rare queue for that shop).
   */
  const inLine = new Map<string, string>();
  let stepRolls: StepRoll[] = [];
  let stepChecks: { family: string; ok: boolean }[] = [];
  const check = (a: Agreement, ok: boolean, family: string) => {
    trace?.(`  check ${family}: ${ok ? "ok" : "MISS"}`);
    if (steps) stepChecks.push({ family, ok });
    a.checked++;
    if (ok) {
      a.matched++;
      inLine.set(family, place());
      rolledSince.delete(family);
    } else {
      firstMiss ??= place();
      inLine.delete(family);
    }
    for (const h of pending.get(family) ?? []) h.sure = ok;
    pending.delete(family);
  };

  // What the player has. Money starts at $4 and moves with every money_delta (ease_dollars).
  let dollars = 4;
  const items = new Map<number, { set: string; key: string }>();
  const cards = new Map<number, PlayingCard>();
  /**
   * `perish`: a Perishable joker's rounds left (5 when made, Orange Stake and up); at 0 it's
   * debuffed and does nothing. The log has no stickers: they're the replay's roll of the slot.
   */
  const jokers = new Map<
    number,
    { key: string; edition?: string; perish?: number }
  >();
  /** The last roll of each joker: whether it came Perishable (for when it's bought or picked). */
  const rolledPerishable = new Map<string, boolean>();
  const perishOf = (key: string) =>
    rolledPerishable.get(key) ? { perish: 5 } : {};
  /** Keys in order with debuffed copies blanked, for what acts (and what Blueprint copies). */
  const live = (keys: readonly string[]): string[] => {
    const dead = new Map<string, number>();
    for (const j of jokers.values())
      if (j.perish === 0) dead.set(j.key, (dead.get(j.key) ?? 0) + 1);
    return keys.map((k) => {
      const n = dead.get(k) ?? 0;
      if (n <= 0) return k;
      dead.set(k, n - 1);
      return "";
    });
  };
  const consumables = new Map<number, HeldConsumable>();
  const vouchers = new Set<string>();
  const redeemed: { ante: number; key: string }[] = [];
  let synthetic = 1e9;
  let lastTarotPlanet: string | undefined;
  /** Cards Certificate has added (at each blind's start), seals unseen until drawn. */
  let certificateCards = 0;
  /** G.GAME.last_hand_played: a Blue Seal makes its planet. */
  let lastHand: string | undefined;
  /** The cards of the last hand played: a Blue Seal there isn't held at the round's end. */
  let lastPlayed = new Set<number>();

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

  /** What the game skips: what's held, in use and on screen (nothing with Showman). */
  const ownedKeys = (): string[] => {
    if ([...jokers.values()].some((j) => j.key === "j_ring_master")) return [];
    return [
      ...new Set([
        ...heldKeys(),
        ...(using ? [using] : []),
        ...avatars.filter((a) => eventAt >= a.from).map((a) => a.key),
        ...shop.filter((k): k is string => !!k),
        ...pack.filter(Boolean),
      ]),
    ];
  };
  /** Sets what the game skips, from what's held and on screen. */
  const syncOwned = (s: ShopSim) => {
    s.owned.clear();
    for (const k of ownedKeys()) s.owned.add(k);
  };

  /** A roll's passed-by cards, for a walkthrough step, each with what kept it out. */
  const passedBy = (
    found: typeof skips,
    held: Set<string> = heldKeys(),
  ): StepRoll["passed"] =>
    found.map((s) =>
      s.reason === "locked"
        ? { key: s.key, by: "locked" as const, why: why(s.key) }
        : {
            key: s.key,
            by: held.has(s.key)
              ? ("held" as const)
              : s.key === using
                ? ("in use" as const)
                : avatarNow(s.key)
                  ? ("avatar" as const)
                  : ("on screen" as const),
          },
    );
  const keyOf = (out: unknown): string | undefined => {
    if (typeof out === "string") return out || undefined;
    if (out && typeof out === "object") {
      const o = out as { key?: string; card?: string };
      return o.key ?? o.card;
    }
    return undefined;
  };

  const commit = (
    source: string,
    found: typeof skips,
    sure = false,
    held: Set<string> = heldKeys(),
  ) => {
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
        sure,
      };
      const f = familyOf(s.key, source);
      if (inLine.get(f) === place()) hit.sure = true;
      hits.push(hit);
      if (hit.sure) continue;
      pending.set(f, [...(pending.get(f) ?? []), hit]);
    }
  };

  /** One roll on the replay's queues; the cards it passes by are recorded. */
  const roll = <T>(source: string, fn: (s: ShopSim) => T): T => {
    syncOwned(sim);
    skips = [];
    const out = fn(sim);
    if (out && typeof out === "object" && "stickers" in out) {
      const j = out as unknown as { key: string; stickers: readonly string[] };
      rolledPerishable.set(j.key, j.stickers.includes("perishable"));
    }
    if (steps)
      stepRolls.push({ source, got: keyOf(out), passed: passedBy(skips) });
    commit(source, skips);
    skips = [];
    return out;
  };

  /**
   * Rolls a queue on until `key` comes up (what took the rolls in between isn't in the log),
   * and goes on from there. False if it doesn't come up. The cards the game must have passed
   * over on the way are known from the card the log shows, so the ones the player held (or
   * that were locked) are recorded as blocked, and sure: the second Campfire skipped while the
   * first was held, found when the Brainstorm after it is bought.
   */
  const resync = (
    set: string,
    key: string,
    /** What was held when the shop was rolled (cards sold since still blocked it). */
    heldThen?: Set<string>,
  ): boolean => {
    const rarity = RARITY.get(key);
    if (!CONSUMABLE_SETS.has(set) && !rarity) return false;
    const fork = sim.fork();
    const passed: typeof skips = [];
    for (let n = 0; n < 10; n++) {
      syncOwned(fork);
      for (const k of heldThen ?? []) fork.owned.add(k);
      skips = [];
      const got = CONSUMABLE_SETS.has(set)
        ? fork.consumable(set as ConsumableSet)
        : fork.otherJoker(rarity).key;
      passed.push(...skips);
      if (got === key) {
        skips = [];
        sim = fork;
        if (steps)
          stepRolls.push({
            source: `Caught up ${n + 1} roll${n ? "s" : ""} on ${set}`,
            got: key,
            passed: passedBy(
              passed,
              new Set([...heldKeys(), ...(heldThen ?? [])]),
            ),
          });
        trace?.(`  resync ${set}: ${n + 1} rolls on`);
        if (n < 3)
          inLine.set(familyOf(key, set === "Joker" ? "Shop" : ""), place());
        // Only a short way on: further, the replay was out of line and the in-between is a guess.
        if (n < 3)
          commit(
            set === "Joker" ? "Shop" : `${set} (shop)`,
            passed,
            true,
            new Set([...heldKeys(), ...(heldThen ?? [])]),
          );
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

  const banned = bannedKeys(settings);
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
  /** A Blue Seal can be in the deck: one seen, or Certificate's (often never seen). */
  const blueSealPossible = () => blueSealsHeld() > 0;
  /** How many Blue Seals can be held at the round's end: the ones not in the last hand. */
  const blueSealsHeld = () =>
    [...cards].filter(
      ([id, c]) => c.alive && c.seal === "Blue" && !lastPlayed.has(id),
    ).length +
    // Certificate adds a card with a random seal each round, and it stays in the deck after
    // Certificate is sold.
    certificateCards;

  /**
   * Blue Seals held in hand at the round's end make the last hand's planet, by key. The log
   * only shows it when it's used, sold or moved, often after the shop, where it already counted
   * as held (0d60c738: a Pluto kept Pluto out of the next shop). So look through the shop and
   * the next round, up to its last hand, for that planet showing up unbought, and make it now.
   * One used before the cashout is already seen; one after a High Priestess or a Fool may be
   * theirs, so the look stops there.
   */
  const blueSealPlanets = (from: number) => {
    const key = lastHand && PLANET_OF[lastHand];
    if (!key || !blueSealPossible()) return;
    // A banned planet (Small World culls most of them): create_card's forced key is dropped
    // and the card is drawn from the pool instead, which under The Order is the shop's
    // "PlanetPlanet0". Any planet showing up unbought is then one of these.
    const drawn = banned.has(key);
    // Up to the next round's last hand: after it, a planet can be that round's Blue Seal's.
    let end = events.length;
    for (let j = from + 1; j < events.length; j++)
      if (events[j][1] === "play") end = j;
      else if (events[j][1] === "cashout") break;
    let n = 0;
    // Cards first seen in the look, by id: a High Priestess bought now and used later.
    const seen = new Map<number, string>();
    for (let j = from + 1; j < end; j++) {
      const [, op, args] = events[j];
      let fresh = 0;
      const walk = (x: unknown) => {
        if (!Array.isArray(x)) return;
        if (typeof x[0] === "number" && typeof x[1] === "string") {
          if (x[0] < 0 && typeof x[2] === "string") {
            seen.set(-x[0], x[2]);
            if (x[1] === "Planet" && (drawn || x[2] === key)) fresh++;
          }
          return;
        }
        for (const y of x) walk(y);
      };
      walk(args);
      if (op === "use") {
        const ref = (args as unknown[] | null)?.[2];
        const id = Array.isArray(ref) ? Math.abs(ref[0] as number) : NaN;
        const used = seen.get(id) ?? items.get(id)?.key;
        if (used === "c_high_priestess" || used === "c_fool") break;
      }
      if (op !== "buy" && op !== "pack_pick") n += fresh;
    }
    for (
      let k = 0;
      k < Math.min(n, blueSealsHeld()) && consumableRoom() > 0;
      k++
    )
      if (drawn) makeConsumable(`Blue Seal (${key} banned)`, "Planet");
      else consumables.set(synthetic++, { set: "Planet", key, unseen: true });
  };

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
      blueSealPossible();
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

  const hidden = hiddenEnhanced(events);
  const updateLocks = () => {
    const enh = new Set<string>();
    for (const c of cards.values())
      if (c.alive && c.enhancement) enh.add(c.enhancement);
    for (const h of hidden)
      if (eventAt >= h.from && (cards.get(h.id)?.alive ?? true))
        enh.add(h.enhancement);
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
  /**
   * Made jokers a 1.0.6 log's joker_hit will name, by its source: the log says what Wraith,
   * Judgement, The Soul and Riff-raff made right after each one, not only at the next hand.
   */
  let pendingHits: { source: string; key: string }[] = [];
  const HIT_SOURCE: Record<string, string> = {
    Judgement: "judgement",
    Wraith: "wraith",
    "The Soul": "soul",
    "Riff-raff": "riffraff",
  };
  /** Where each made joker was rolled: a lobby avatar may have kept another out there. */
  const madeAt = new Map<string, number>();
  const makeJokers = (
    source: string,
    n: number,
    rarity: 1 | 3 | 4 | "judgement",
  ) => {
    for (let i = 0; i < n && room() > 0; i++) {
      const j = roll(source, (s) => s.otherJoker(rarity));
      trace?.(`  ${source} made ${j.key}`);
      jokers.set(synthetic++, { key: j.key, edition: j.edition });
      order.push(j.key);
      expectedNew.push(j.key);
      madeAt.set(j.key, eventAt);
      if (HIT_SOURCE[source])
        pendingHits.push({ source: HIT_SOURCE[source], key: j.key });
    }
  };

  /**
   * The jokers' order as the player left it: each hand sets it, then buys and made jokers go on
   * the end, sales and rearranging (reorder) change it. Blueprint and Brainstorm copy by
   * position, so this is the order at a blind's start (a player can move Blueprint next to
   * Cartomancer for the blind and back before the first hand).
   */
  let order: string[] = [];
  const orderAtBlind = (from: number): string[] =>
    order.length === jokers.size ? order : nextJokerOrder(from);

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
    2 **
    [...jokers.values()].filter((j) => j.key === "j_oops" && j.perish !== 0)
      .length;

  // Shop -------------------------------------------------------------------

  const shopSize = () =>
    2 +
    (vouchers.has("v_overstock_norm") ? 1 : 0) +
    (vouchers.has("v_overstock_plus") ? 1 : 0);

  const shopSlot = () => {
    const item = roll("Shop", (s) => s.next());
    const key = item.kind === "card" ? null : item.key;
    noteRolled(key, shopEvent);
    return key;
  };

  /**
   * The shop's slots. An Uncommon or Rare Tag fills every slot of the shop it opens with its
   * joker (seen in a real match: both slots, then the rerolls are the usual cards). The code
   * says the tag triggers once (tag.triggered), so this is from the log, not the Lua.
   */
  /** What the player held when the shop on screen was rolled. */
  let heldAtShop = new Set<string>();
  const rollShop = (forced?: 2 | 3) => {
    heldAtShop = heldKeys();
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
    // change_shop_size: the shop grows by one and every empty slot is filled, so slots bought
    // before the Overstock are rolled again too.
    if (key === "v_overstock_norm" || key === "v_overstock_plus")
      while (inShop && shop.length < shopSize()) shop.push(shopSlot());
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
    check(agreement.jokers, true, familyOf(got.item.key, ""));
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

  const vanish = vanishedJokers(events);
  // Small World allows duplicates, so buying a card already held proves nothing there.
  const unheld = settings.ruleset.smallWorld
    ? new Set<number>()
    : unheldBuys(events);
  const evidence = softlockEvidence(events);
  for (const [r, keys] of Object.entries(settings.ruleset.added.jokers ?? {}))
    for (const k of keys ?? [])
      if (Number(r) < 4) RARITY.set(k, Number(r) as 1 | 2 | 3);
  const tags = tagQueue(settings, 12);

  // The deck's starting vouchers and consumables.
  const run = events.find((e) => e[1] === "run_info")?.[2] as
    | { deck?: string }
    | undefined;
  const deck = deckKey(run?.deck);
  const start = DECK_START[deck ?? ""] ?? {};
  /** Double Tags held, and packs tags have yet to open (each after the last is done). */
  let doubles = 0;
  const tagPacks: { key: string; name: string }[] = [];
  const openNextTagPack = () => {
    const next = tagPacks.shift();
    if (next) openPack(next.key, next.name);
  };
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

  /** A booster opened: from the shop, or by a tag (Buffoon, Charm, Meteor, Ethereal, Standard). */
  const openPack = (key: string, name: string) => {
    const info = PACK_INFO.get(key) ?? { size: 0, choose: 0 };
    const kind = packKind(key);
    pack = [];
    picksLeft = info.choose;
    for (let n = 0; n < info.size; n++) {
      if (kind === "buffoon") {
        const joker = roll(name, (s) => s.buffoonCard()).key;
        pack.push(joker);
        noteRolled(joker, packEvent);
      } else if (kind === "arcana")
        // Omen Globe: each card is a Spectral when "omen_globe" rolls over 0.8 (Steamodded's
        // Arcana Pack create_card).
        pack.push(
          roll(name, (s) =>
            s.packConsumable(
              vouchers.has("v_omen_globe") && s.chance("omen_globe") > 0.8
                ? "Spectral"
                : "Tarot",
            ),
          ),
        );
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
    for (const k of acting(live([...jokers.values()].map((j) => j.key))))
      if (k === "j_hallucination" && consumableRoom() > 0)
        if (sim.chance("halu0") < odds() / 2)
          makeConsumable("Hallucination", "Tarot");
  };

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
    for (const h of evidence.get(i) ?? []) played.add(h);
    // Gros Michel's end-of-round roll, one per copy held: pseudorandom("gros_michel") below
    // 1 in 6 (Oops! All 6s doubles it) and it goes extinct, opening Cavendish from the next
    // shop. Checked against every round a held Gros Michel ended in the matches seen.
    // Perishable jokers count their rounds down first (end_round), so one debuffed now doesn't
    // roll: a debuffed joker does nothing.
    let extinctNow = 0;
    if (op === "cashout") {
      for (const j of jokers.values())
        if (j.perish !== undefined && j.perish > 0) j.perish--;
      for (const j of [...jokers.values()])
        if (
          j.key === "j_gros_michel" &&
          j.perish !== 0 &&
          sim.chance("gros_michel") < odds() / 6
        )
          extinctNow++;
    }
    if (extinctNow) extinct = true;
    for (const k of vanish.get(i) ?? []) {
      removeJoker(-1, k);
      const o = order.lastIndexOf(k);
      if (o >= 0) order.splice(o, 1);
      if (k === "j_gros_michel") extinctNow--;
    }
    // One the log doesn't show leaving yet (no hand played after it): it's gone all the same.
    for (; extinctNow > 0; extinctNow--) {
      removeJoker(-1, "j_gros_michel");
      const o = order.lastIndexOf("j_gros_michel");
      if (o >= 0) order.splice(o, 1);
    }
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
        for (const k of acting(live(orderAtBlind(i)))) {
          if (k === "j_certificate") certificateCards++;
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
        // A Double Tag copies the next tag taken (each Double once); it doesn't copy itself.
        if (tag === "tag_double") {
          doubles++;
          break;
        }
        const copies = 1 + doubles;
        doubles = 0;
        for (let c = 0; c < copies; c++) {
          if (tag === "tag_top_up") makeJokers("Top-up Tag", 2, 1);
          // These tags open their pack at once (tag.lua), one after another; the log has no
          // open_pack for them, only the picks after the skip_blind.
          const tagPack = TAG_PACKS[tag ?? ""];
          if (tagPack)
            tagPacks.push({
              key: tagPack,
              name: `${packName(tagPack)} (${TAG_NAMES[tag as string]})`,
            });
        }
        packEvent = i;
        openNextTagPack();
        if (tag === "tag_uncommon") forcedRarity = 2;
        if (tag === "tag_rare") forcedRarity = 3;
        break;
      }
      case "joker_hit": {
        // 1.0.6: [source, created, destroyed], logged just after the effect. Check the jokers
        // the replay made for it now, and take the game's in their place.
        const [source, created] = a as [string, string[] | undefined];
        const got = (created ?? []).map((t) => t.split("|")[0]);
        const mine = pendingHits.filter((h) => h.source === source);
        for (const h of mine.slice(0, got.length)) {
          pendingHits.splice(pendingHits.indexOf(h), 1);
          const at = expectedNew.indexOf(h.key);
          if (at < 0) continue;
          expectedNew.splice(at, 1);
          const hit = got.indexOf(h.key);
          check(agreement.jokers, hit >= 0, familyOf(h.key, ""));
          if (hit >= 0) {
            got.splice(hit, 1);
            continue;
          }
          missedShop.push({ key: h.key, at: madeAt.get(h.key) ?? i });
          suspects(h.key);
          const real = got.shift();
          const o = order.indexOf(h.key);
          if (o >= 0) {
            if (real) order[o] = real;
            else order.splice(o, 1);
          }
          for (const [id, j] of jokers)
            if (id >= 1e9 && j.key === h.key) {
              if (real) j.key = real;
              else jokers.delete(id);
              break;
            }
        }
        break;
      }
      case "cashout":
        shopsEntered++;
        blueSealPlanets(i);
        if (blind !== "Small Blind" && blind !== "Big Blind") {
          bossesBeaten++;
          afterBoss = true;
          // Anaglyph Deck: a Double Tag after each Boss Blind.
          if (deck === "b_anaglyph") doubles++;
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
        // A card the log already showed bought: the first buy didn't go through (no room) and
        // this one did. The replay took it at the first; nothing more to do.
        if (got && !got.fresh) break;
        if (got?.item) {
          const { key, set } = got.item;
          let at = shop[slot] === key ? slot : shop.indexOf(key);
          check(agreement.shop, at >= 0, familyOf(key, "Shop"));
          if (at < 0 && shop[slot]?.startsWith("j_"))
            missedShop.push({ key: shop[slot] as string, at: shopEvent });
          if (at < 0 && set === "Joker") suspects(key);
          if (at < 0) {
            at = slot;
            resync(set, key, heldAtShop);
          }
          const rolled = shop[at] === key;
          shop.splice(at, 1);
          if (set === "Joker") {
            jokers.set(got.id, {
              key,
              edition: got.edition,
              ...(rolled ? perishOf(key) : {}),
            });
            order.push(key);
          } else if (CONSUMABLE_SETS.has(set)) {
            if (a[4] === true) applyUse(key, []);
            else if (!unheld.has(i))
              consumables.set(got.id, { set, key, edition: got.edition });
          }
        } else if (got?.card) shop.splice(slot, 1);
        break;
      }
      case "open_pack": {
        packEvent = i;
        const got = learn(a[2]);
        const key = got?.item?.key ?? "";
        openPack(key, got?.item ? packName(key) : "Pack");
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
          if (at < 0 && set === "Joker") {
            missedInPack();
            suspects(key);
          }
          if (at >= 0) pack.splice(at, 1);
          if (set === "Joker") {
            jokers.set(got.id, {
              key,
              edition: got.edition,
              ...(at >= 0 ? perishOf(key) : {}),
            });
            order.push(key);
          } else applyUse(key, targets);
        }
        picksLeft--;
        if (picksLeft <= 0) {
          pack = [];
          openNextTagPack();
        }
        break;
      }
      case "pack_skip": {
        for (const ref of (a[0] as unknown[]) ?? []) {
          const got = learn(ref);
          // A skipped pack's playing cards never join the deck (its Glass Card doesn't open
          // Glass Joker).
          if (got?.card && got.fresh) got.card.alive = false;
          if (!got?.item) continue;
          let at = pack.indexOf(got.item.key);
          if (at < 0 && got.item.set === "Planet") at = pack.indexOf("");
          check(agreement.packs, at >= 0, familyOf(got.item.key, "Pack"));
          if (at < 0 && got.item.set === "Joker") {
            missedInPack();
            suspects(got.item.key);
          }
          if (at >= 0) pack.splice(at, 1);
        }
        pack = [];
        openNextTagPack();
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
        if (a[0] === 4 && typeof a[1] === "number") order.splice(a[1] - 1, 1);
        if (!got?.item) break;
        if (a[0] === 4) removeJoker(got.id, got.item.key);
        else consumables.delete(got.id);
        break;
      }
      case "reorder":
        if (a[0] === 4 && Array.isArray(a[1]) && a[1].length === order.length)
          order = (a[1] as number[]).map((p) => order[p - 1]);
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
        const handRefs = learnAll(a[1]);
        lastPlayed = new Set(handRefs.flatMap((t) => (t?.card ? [t.id] : [])));
        const hand = handRefs.flatMap((t) => (t?.card ? [t.card] : []));
        const tokens = ((a[2] as string[]) ?? []).map((t) => {
          const [key, edition] = t.split("|");
          return { key, edition };
        });
        // The jokers made since the last hand should be here.
        for (const key of expectedNew) {
          const ok = tokens.some((t) => t.key === key);
          check(agreement.jokers, ok, familyOf(key, ""));
          // The game made another joker: the one the replay made may have been kept out.
          // Or a card of that queue rolled in a shop since, passed by in the game and not here
          // (4ef1445c: Baron, so the Wraith's Rare came one later).
          if (!ok) {
            missedShop.push({ key, at: madeAt.get(key) ?? i });
            suspects(key);
          }
        }
        expectedNew = [];
        pendingHits = [];
        // The snapshot is what the player has: drop what's gone, add what's new, and take each
        // joker's edition from it (Ectoplasm, Wheel of Fortune or Hex change it unlogged, and a
        // Negative one is a joker slot: Judgement had room for a joker made Negative later).
        const want = new Map<string, (string | undefined)[]>();
        for (const t of tokens)
          want.set(t.key, [...(want.get(t.key) ?? []), t.edition]);
        for (const [id, j] of [...jokers]) {
          const left = want.get(j.key) ?? [];
          if (left.length === 0) {
            // Gone without being sold (Gros Michel's extinction is rolled at the round's end).
            jokers.delete(id);
            continue;
          }
          const same = left.indexOf(j.edition);
          j.edition = left.splice(same >= 0 ? same : 0, 1)[0];
        }
        for (const [key, editions] of want)
          for (const edition of editions)
            jokers.set(synthetic++, { key, edition });
        const keys = tokens.map((t) => t.key);
        order = [...keys];
        const roles = acting(live(keys));
        const { name, scoring } = evaluateHand(hand, live(keys));
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
    if (steps && (STEP_OPS.has(op) || stepRolls.length || stepChecks.length)) {
      steps.push({
        at: i,
        op,
        keys: stepKeys(op, a, (id) => items.get(id)?.key),
        ante,
        place: place(),
        dollars,
        rolls: stepRolls,
        checks: stepChecks,
        // The shop on screen isn't counted: reading on means rerolling, which replaces it.
        settings: sim.lateStart(
          ownedKeys().filter((k) => !shop.includes(k) || heldKeys().has(k)),
          ante,
          shopsEntered,
          place(),
        ),
      });
    }
    stepRolls = [];
    stepChecks = [];
  });

  // Skips after the last card their queue showed: nothing came after to check them against, so
  // they're sure when that queue was in line at its last check (the replay never lost it).
  for (const [family, waiting] of pending)
    if (inLine.has(family)) for (const h of waiting) h.sure = true;

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

/** The cards an event names: refs it carries ([id, set, key]), or held ids (sell, use). */
function stepKeys(
  op: string,
  a: readonly unknown[],
  itemKey: (id: number) => string | undefined,
): string[] {
  if (op === "sell" || op === "use")
    return (Array.isArray(a[2]) ? a[2] : []).flatMap((id) => {
      const k = typeof id === "number" ? itemKey(Math.abs(id)) : undefined;
      return k ? [k] : [];
    });
  const out: string[] = [];
  const walk = (x: unknown) => {
    if (!Array.isArray(x)) return;
    if (typeof x[0] === "number" && typeof x[1] === "string") {
      if (x[1] === "pc") out.push(`${x[3]} of ${x[2]}`);
      else if (typeof x[2] === "string") out.push(x[2]);
      return;
    }
    for (const y of x) walk(y);
  };
  walk(op === "pack_skip" ? [] : a);
  return out;
}

/**
 * The log replayed step by step, with the lobby avatars findBlocksAuto found: for each event
 * worth showing, what it rolled, what those rolls passed by and why, and the seed reader's
 * settings for reading on from there (a late start).
 */
export function replaySteps(
  events: readonly LogEvent[],
  settings: ReaderSettings,
  avatars: readonly AvatarBlock[] = [],
): ReplayStep[] {
  const steps: ReplayStep[] = [];
  findBlocks(events, settings, undefined, undefined, avatars, steps);
  return steps;
}

const misses = (r: BlockReport) =>
  Object.values(r.agreement).reduce((n, a) => n + a.checked - a.matched, 0);

/** Versions with the lobby-avatar bug (fixed in the next update). */
const AVATAR_BUG = new Set(["1.0.5"]);

/** The jokers a player can pick as their avatar (balatromp.com's avatar picker). */
export const AVATARS: ReadonlySet<string> = new Set([
  "j_joker",
  "j_jolly",
  "j_zany",
  "j_mad",
  "j_crazy",
  "j_droll",
  "j_sly",
  "j_wily",
  "j_clever",
  "j_devious",
  "j_crafty",
  "j_baron",
  "j_lucky_cat",
  "j_smiley",
  "j_midas_mask",
  "j_swashbuckler",
  "j_vampire",
  "j_photograph",
  "j_square",
  "j_scary_face",
  "j_madness",
  "j_odd_todd",
  "j_even_steven",
  "j_ancient",
  "j_fortune_teller",
  "j_sixth_sense",
  "j_faceless",
  "j_bull",
  "j_card_sharp",
  "j_space",
  "j_astronomer",
  "j_constellation",
  "j_runner",
  "j_hiker",
  "j_idol",
  "j_luchador",
  "j_matador",
  "j_scholar",
  "j_stuntman",
  "j_wee",
  "j_burglar",
  "j_chaos",
  "j_egg",
  "j_mr_bones",
  "j_ring_master",
  "j_pareidolia",
  "j_throwback",
  "j_blue_joker",
  "j_green_joker",
  "j_golden",
  "j_smeared",
  "j_troubadour",
  "j_blueprint",
  "j_merry_andy",
  "j_brainstorm",
  "j_abstract",
  "j_turtle_bean",
  "j_vagabond",
  "j_dusk",
  "j_burnt",
  "j_mime",
  "j_perkeo",
  "j_stone",
]);

/**
 * findBlocks, with the lobby-avatar bug worked out. In Multiplayer 1.0.5, looking at the lobby
 * info (at any time in the run) leaves both players' avatar jokers in G.GAME.used_jokers, so
 * that player's shop and packs skip both from then on. Only the player who looked is affected.
 *
 * The log records neither the avatars nor the look, so this only speculates where nothing else
 * explains a miss: the jokers the replay had in a slot where the player bought something else
 * are tried as the avatars (only the 63 jokers the avatar picker offers, `AVATARS`), one or
 * two, blocked together from the shop where the first of them missed (or from the start).
 * Such a guess is kept when it takes away a miss (three in a log with over 20). `known` is the match's avatars when found
 * from the other player's log: on a tie it wins, as one look blocks both.
 */
export function findBlocksAuto(
  events: readonly LogEvent[],
  settings: ReaderSettings,
  known: readonly string[] = [],
  /** Try only `known` (the match's pair), not this log's own suspects. */
  onlyKnown = false,
): BlockReport {
  const base = findBlocks(events, settings);
  const lobby = events.find((e) => e[1] === "lobby_info")?.[2] as
    | { options?: { mod_version?: string } }
    | undefined;
  if (!AVATAR_BUG.has(lobby?.options?.mod_version ?? "")) return base;
  if (misses(base) === 0) return base;

  const firstMissAt = new Map<string, number>();
  for (const m of base.missedShop)
    if (AVATARS.has(m.key) && !firstMissAt.has(m.key))
      firstMissAt.set(m.key, m.at);
  const keys = [...firstMissAt.keys()].slice(0, 5);
  const guesses: { set: string[]; known: boolean }[] = [
    ...(known.length
      ? [{ set: known.filter((k) => AVATARS.has(k)), known: true }]
      : []),
    ...(onlyKnown
      ? []
      : [
          ...keys.map((k) => ({ set: [k], known: false })),
          ...keys.flatMap((k, i) =>
            keys.slice(i + 1).map((l) => ({ set: [k, l], known: false })),
          ),
        ]),
  ];

  let best: { report: BlockReport; known: boolean } | undefined;
  for (const guess of guesses) {
    // One look blocks both from the same moment: the first shop either of them missed in,
    // or the start of the run. The later start first, as it claims less.
    const starts = guess.set.flatMap((k) => firstMissAt.get(k) ?? []);
    const from = starts.length ? Math.min(...starts) : 0;
    for (const at of [...new Set([from, 0])]) {
      const report = findBlocks(
        events,
        settings,
        undefined,
        undefined,
        guess.set.map((key) => ({ key, from: at })),
      );
      const gain = misses(base) - misses(report);
      // Only jokers that can be avatars are tried, so one miss less is enough, unless the
      // replay is out of line anyway (many misses), where one could be chance.
      // The match's pair, found in the other player's log, needs no more than that.
      const enough = gain >= (!guess.known && misses(base) > 20 ? 3 : 1);
      if (!enough) continue;
      // Fewer misses wins. On a tie the match's known pair wins (one look blocks both), then
      // fewer avatars.
      const tie = best && misses(report) === misses(best.report);
      if (
        !best ||
        misses(report) < misses(best.report) ||
        (tie && guess.known && !best.known) ||
        (tie &&
          guess.known === best.known &&
          report.avatars.length < best.report.avatars.length)
      )
        best = { report, known: guess.known };
    }
  }
  return best?.report ?? base;
}

/**
 * findBlocksAuto for every log of a match. Both players have the same two avatars, so the
 * jokers either log points to are tried as the match's avatars (each one, and each pair) in
 * every log, each log from its own moment; the set with the fewest misses over the whole match
 * wins, and on a tie it beats the logs' separate guesses (one pair explains both).
 */
export function findBlocksMatch(
  logs: readonly { events: readonly LogEvent[]; settings: ReaderSettings }[],
): BlockReport[] {
  const first = logs.map((l) => findBlocksAuto(l.events, l.settings));
  const found = [
    ...new Set(first.flatMap((r) => r.avatars.map((a) => a.key))),
  ].slice(0, 4);
  if (!found.length) return first;
  const total = (rs: BlockReport[]) => rs.reduce((n, r) => n + misses(r), 0);
  const sets = [
    ...found.map((k) => [k]),
    ...found.flatMap((k, i) => found.slice(i + 1).map((l) => [k, l])),
  ];
  let best = first;
  let bestShared = false;
  for (const set of sets) {
    const rs = logs.map((l) => findBlocksAuto(l.events, l.settings, set, true));
    if (
      total(rs) < total(best) ||
      (total(rs) === total(best) && !bestShared) ||
      (total(rs) === total(best) && set.length < (best[0]?.avatars.length ?? 0))
    ) {
      best = rs;
      bestShared = true;
    }
  }
  return best;
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
