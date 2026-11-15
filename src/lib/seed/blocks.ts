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
  const patch = PATCHES[0];
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
  const deck = DECKS.find((d) => d.key === run.deck)?.id;
  return {
    ok: true,
    settings: {
      seed: run.seed,
      ruleset,
      gameMode: patch.gameMode,
      stake: run.stake ?? 1,
      deck,
      pincherUnlocked: false,
      enhancements: [],
      softlocked: SOFTLOCKS.map((s) => s.planet),
    },
  };
}

// ---------------------------------------------------------------------------

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

/** Five played cards' hand, for the three softlocked hands only. */
function softHand(cards: PlayingCard[], smeared: boolean): string | undefined {
  if (cards.length !== 5) return undefined;
  const ranked = cards.filter((c) => c.enhancement !== "m_stone");
  if (ranked.length !== 5) return undefined;
  const counts = new Map<string, number>();
  for (const c of ranked) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  const shape = [...counts.values()].sort((a, b) => b - a).join("");
  const suitOf = (s: string) =>
    smeared ? (s === "Hearts" || s === "Diamonds" ? "red" : "black") : s;
  const suits = new Set(
    ranked.filter((c) => c.enhancement !== "m_wild").map((c) => suitOf(c.suit)),
  );
  const flush = suits.size <= 1;
  if (shape === "5") return flush ? "Flush Five" : "Five of a Kind";
  if (shape === "32" && flush) return "Flush House";
  return undefined;
}

/** A consumable made outside the shop and packs, and where the replay makes it. */
interface Made {
  id: number;
  set: ConsumableSet;
  key: string;
  /** The Fool's copy: no roll. */
  copy: boolean;
}

/**
 * Where each made consumable is rolled. It shows up in the log the first time it's used, sold
 * or moved, so it's put at the card that made it when that's in the log (The Emperor, The High
 * Priestess, Séance, The Fool, Cartomancer's blind), else right before it's first seen in a
 * blind, or before the shop is rolled when it's first seen in a shop.
 */
function placeMade(events: readonly LogEvent[]): {
  before: Map<number, Made[]>;
  after: Map<number, Made[]>;
} {
  const before = new Map<number, Made[]>();
  const after = new Map<number, Made[]>();
  const push = (m: Map<number, Made[]>, i: number, made: Made) =>
    m.set(i, [...(m.get(i) ?? []), made]);
  const seen = new Set<number>();
  let shopStart = -1;
  let inShop = false;
  let creators: { at: number; set?: string; key?: string; left: number }[] = [];
  let lastUsed: string | undefined;

  const nextJokers = (from: number) => {
    for (let j = from; j < events.length; j++)
      if (events[j][1] === "play")
        return (events[j][2] as unknown[])[2] as string[];
    return [];
  };

  const sight = (i: number, ref: unknown, acquired: boolean) => {
    if (!Array.isArray(ref) || typeof ref[0] !== "number") return;
    const id = Math.abs(ref[0]);
    if (ref[0] > 0 || seen.has(id)) return;
    seen.add(id);
    const set = ref[1] as string;
    if (acquired || !CONSUMABLE_SETS.has(set)) return;
    const key = ref[2] as string;
    const made: Made = { id, set: set as ConsumableSet, key, copy: false };
    const by = creators.find(
      (c) => c.left > 0 && (c.key ? c.key === key : c.set === set),
    );
    if (by) {
      by.left--;
      made.copy = by.key !== undefined;
      push(after, by.at, made);
    } else if (inShop && shopStart >= 0) push(before, shopStart, made);
    else push(before, i, made);
  };
  const sightAll = (i: number, refs: unknown) => {
    if (Array.isArray(refs)) for (const r of refs) sight(i, r, false);
  };

  events.forEach((e, i) => {
    const [, op, args] = e;
    const a = args as unknown[];
    switch (op) {
      case "select_blind":
        inShop = false;
        creators = [];
        if (nextJokers(i).some((j) => j.startsWith("j_cartomancer")))
          creators.push({ at: i, set: "Tarot", left: 1 });
        break;
      case "cashout":
        inShop = true;
        shopStart = i;
        creators = [];
        break;
      case "buy":
        sight(i, a[2], true);
        break;
      case "pack_pick":
        sight(i, a[2], true);
        sightAll(i, a[3]);
        break;
      case "pack_skip":
        for (const r of (a[0] as unknown[]) ?? []) sight(i, r, true);
        break;
      case "use": {
        sight(i, a[2], false);
        sightAll(i, a[3]);
        const ref = a[2] as Ref;
        const key = (ref[0] as number) < 0 ? (ref[2] as string) : undefined;
        const used = key ?? usedKey(events, i);
        if (used === "c_emperor")
          creators.push({ at: i, set: "Tarot", left: 2 });
        if (used === "c_high_priestess")
          creators.push({ at: i, set: "Planet", left: 2 });
        if (used === "c_seance")
          creators.push({ at: i, set: "Spectral", left: 1 });
        if (used === "c_fool" && lastUsed)
          creators.push({ at: i, key: lastUsed, left: 1 });
        if (
          used &&
          used !== "c_fool" &&
          (used.startsWith("c_") || false) &&
          isTarotOrPlanet(used)
        )
          lastUsed = used;
        break;
      }
      case "sell":
        sight(i, a[2], false);
        break;
      case "reorder":
        for (const m of (a[2] as unknown[][]) ?? []) sight(i, m[0], false);
        break;
      case "play":
      case "discard":
        sightAll(i, a[1]);
        break;
    }
  });
  return { before, after };
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
const isTarotOrPlanet = (k: string) => TAROTS.has(k) || PLANETS.has(k);

/** The key of the card a `use` at `i` acts on, when it was seen before (positive id). */
function usedKey(events: readonly LogEvent[], i: number): string | undefined {
  const ref = (events[i][2] as unknown[])[2] as Ref;
  const id = ref[0] as number;
  for (let j = i - 1; j >= 0; j--) {
    const found = findRef(events[j][2], -id);
    if (found) return found[2] as string;
  }
  return undefined;
}

function findRef(value: unknown, id: number): Ref | undefined {
  if (!Array.isArray(value)) return undefined;
  if (value[0] === id && typeof value[1] === "string") return value as Ref;
  for (const v of value) {
    const r = findRef(v, id);
    if (r) return r;
  }
  return undefined;
}

// ---------------------------------------------------------------------------

/** Replays one player's log and lists what they blocked. */
export function findBlocks(
  events: readonly LogEvent[],
  settings: ReaderSettings,
): BlockReport {
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
  const place = () =>
    `Ante ${ante} · ${inShop ? `Shop after ${blind}` : blind}`;
  // Hits waiting for the next card their queue shows, to know whether the replay was in line.
  const pending = new Map<string, BlockHit[]>();
  const check = (a: Agreement, ok: boolean, family: string) => {
    a.checked++;
    if (ok) a.matched++;
    else firstMiss ??= place();
    for (const h of pending.get(family) ?? []) h.sure = ok;
    pending.delete(family);
  };

  // What the player has.
  const items = new Map<number, { set: string; key: string }>();
  const cards = new Map<number, PlayingCard>();
  const jokers = new Map<number, { key: string; edition?: string }>();
  const consumables = new Map<number, string>();
  const vouchers = new Set<string>();
  const redeemed: { ante: number; key: string }[] = [];
  let synthetic = 1e9;

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
      ...consumables.values(),
      ...unclaimed.map((u) => u.key),
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

  /** Sets what the game skips, from what's held and on screen. */
  const syncOwned = (s: ShopSim) => {
    s.owned.clear();
    if ([...jokers.values()].some((j) => j.key === "j_ring_master")) return;
    for (const k of heldKeys()) s.owned.add(k);
    for (const k of shop) if (k) s.owned.add(k);
    for (const k of pack) if (k) s.owned.add(k);
  };

  const commit = (source: string, found: typeof skips) => {
    const held = heldKeys();
    for (const s of found) {
      if (s.reason === "owned" && !held.has(s.key)) continue; // on screen, not held
      const hit: BlockHit = {
        key: s.key,
        reason: s.reason === "owned" ? "held" : "locked",
        source,
        ante,
        place: place(),
        why: s.reason === "locked" ? why(s.key) : undefined,
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
   * Made consumables the replay has rolled but the log hasn't shown yet: the card that made
   * them made more than one (The Emperor's two), or one was used later than the next. They're
   * held until they show up, and dropped after a shop they don't show up in.
   */
  let unclaimed: { set: ConsumableSet; key: string; shop: number }[] = [];
  let shops = 0;

  /**
   * A made consumable the log shows: one already rolled, or the next roll of its queue. If the
   * next roll isn't it, look a few rolls further (made cards the log doesn't show yet took the
   * ones in between; they're kept for later) and go on from there.
   */
  const claimMade = (set: ConsumableSet, key: string): boolean => {
    const at = unclaimed.findIndex((u) => u.set === set && u.key === key);
    if (at >= 0) {
      unclaimed.splice(at, 1);
      return true;
    }
    const fork = sim.fork();
    const extra: string[] = [];
    const found: typeof skips = [];
    for (let n = 0; n < 6; n++) {
      syncOwned(fork);
      for (const k of extra) fork.owned.add(k);
      skips = [];
      const got = fork.consumable(set);
      found.push(...skips);
      if (got === key) {
        sim = fork;
        skips = [];
        for (const k of extra) unclaimed.push({ set, key: k, shop: shops });
        // Keep the newest few: more than that means the replay is off, not that they're held.
        while (unclaimed.filter((u) => u.set === set).length > 3)
          unclaimed.splice(
            unclaimed.findIndex((u) => u.set === set),
            1,
          );
        commit(`${set} made`, found);
        return true;
      }
      extra.push(got);
    }
    skips = [];
    return false;
  };

  /**
   * Puts a queue back in line after a card the log shows wasn't where the replay put it: roll
   * that card's queue on until it comes up (what took the rolls in between isn't in the log),
   * and go on from there. Nothing is recorded for those rolls.
   */
  const resync = (set: string, key: string) => {
    const rarity = RARITY.get(key);
    if (!CONSUMABLE_SETS.has(set) && !rarity) return;
    const fork = sim.fork();
    for (let n = 0; n < 10; n++) {
      syncOwned(fork);
      const got = CONSUMABLE_SETS.has(set)
        ? fork.consumable(set as ConsumableSet)
        : fork.otherJoker(rarity).key;
      if (got === key) {
        skips = [];
        sim = fork;
        return;
      }
    }
    skips = [];
  };

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
          alive: true,
        });
      else items.set(id, { set: r[1] as string, key: r[2] as string });
    } else {
      const c = cards.get(id);
      if (c) c.enhancement = mod(r, "e:");
    }
    return {
      id,
      item: items.get(id),
      card: cards.get(id),
      edition: mod(r, "ed:"),
    };
  };
  const learnAll = (refs: unknown) =>
    Array.isArray(refs) ? refs.map(learn) : [];

  const jokerLimit = () =>
    5 +
    (vouchers.has("v_antimatter") ? 1 : 0) +
    [...jokers.values()].filter((j) => j.edition === "negative").length;
  const room = () => jokerLimit() - jokers.size;

  const makeJokers = (
    source: string,
    n: number,
    rarity: 1 | 3 | 4 | "judgement",
  ) => {
    for (let i = 0; i < n && room() > 0; i++) {
      const j = roll(source, (s) => s.otherJoker(rarity));
      jokers.set(synthetic++, { key: j.key, edition: j.edition });
      expectedNew.push(j.key);
    }
  };
  let expectedNew: string[] = [];

  const shopSize = () =>
    2 +
    (vouchers.has("v_overstock_norm") ? 1 : 0) +
    (vouchers.has("v_overstock_plus") ? 1 : 0);

  const rollShop = (forced?: 2 | 3) => {
    shop = [];
    for (let i = 0; i < shopSize(); i++) {
      if (i === 0 && forced) {
        shop.push(
          roll(forced === 2 ? "Uncommon Tag" : "Rare Tag", (s) =>
            s.tagJoker(forced),
          ).key,
        );
        continue;
      }
      const item = roll("Shop", (s) => s.next());
      shop.push(item.kind === "card" ? null : item.key);
    }
  };

  const redeem = (key: string) => {
    vouchers.add(key);
    redeemed.push({ ante: bossesBeaten + 1, key });
    if ((SHOP_VOUCHERS as readonly string[]).includes(key) && sim.mods.vouchers)
      sim.mods.vouchers[key as ShopVoucher] = sim.slots + 1;
    if (key === "v_overstock_norm" || key === "v_overstock_plus")
      shop.push(
        (() => {
          const item = roll("Shop", (s) => s.next());
          return item.kind === "card" ? null : item.key;
        })(),
      );
  };

  const applyUse = (key: string, targets: ReturnType<typeof learn>[]) => {
    const hit = targets.flatMap((t) => (t?.card ? [t.card] : []));
    if (ENHANCES[key]) for (const c of hit) c.enhancement = ENHANCES[key];
    if (SUITS[key]) for (const c of hit) c.suit = SUITS[key];
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
  const made = placeMade(events);

  const makeConsumables = (list: Made[] | undefined) => {
    for (const m of list ?? []) {
      if (!m.copy) check(agreement.made, claimMade(m.set, m.key), m.set);
      consumables.set(m.id, m.key);
    }
  };

  events.forEach((e, i) => {
    const [, op, args] = e;
    const a = (args ?? []) as unknown[];
    updateLocks();
    makeConsumables(made.before.get(i));
    switch (op) {
      case "select_blind": {
        const key = a[1] as string;
        if (afterBoss) {
          ante++;
          afterBoss = false;
        }
        inShop = false;
        shop = [];
        blind = blindName(key);
        nextBlind =
          key === "bl_small" ? "big" : key === "bl_big" ? "boss" : "small";
        if ([...jokers.values()].some((j) => j.key === "j_riff_raff"))
          makeJokers("Riff-raff", 2, 1);
        if (key.startsWith("bl_mp_") && pincherLocked) {
          // update_draw_to_hand, after Riff-raff's setting_blind.
          pincherLocked = false;
          sim.pincherUnlocked = true;
        }
        break;
      }
      case "skip_blind": {
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
        unclaimed = unclaimed.filter((u) => u.shop >= shops);
        shops++;
        break;
      case "buy": {
        const got = learn(a[2]);
        const slot = (a[1] as number) - 1;
        if (got?.item) {
          const { key, set } = got.item;
          let at = shop[slot] === key ? slot : shop.indexOf(key);
          check(agreement.shop, at >= 0, familyOf(key, "Shop"));
          if (at < 0) {
            at = slot;
            resync(set, key);
          }
          shop.splice(at, 1);
          if (set === "Joker")
            jokers.set(got.id, { key, edition: got.edition });
          else if (CONSUMABLE_SETS.has(set) && a[4] !== true)
            consumables.set(got.id, key);
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
        const got = learn(a[2]);
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
        const got = learn(a[2]);
        if (!got?.item) break;
        if (a[0] === 4) removeJoker(got.id, got.item.key);
        else consumables.delete(got.id);
        break;
      }
      case "reorder":
        for (const m of (a[2] as unknown[][]) ?? []) {
          const got = learn(m[0]);
          if (a[0] === 4 && got?.item?.set === "Joker")
            bindJoker(got.id, got.item.key, got.edition);
        }
        break;
      case "discard":
        learnAll(a[1]);
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
        const smeared = tokens.some((t) => t.key === "j_smeared");
        const h = softHand(hand, smeared);
        if (h) played.add(h);
        break;
      }
    }
    makeConsumables(made.after.get(i));
  });

  // Vouchers: each ante's offers, with what the player had redeemed by then.
  voucherQueue(
    settings,
    bossesBeaten + 1,
    (va, key) => redeemed.some((r) => r.ante === va && r.key === key),
    [],
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

  return { settings, hits, agreement, firstMiss };
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
