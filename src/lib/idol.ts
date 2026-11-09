/**
 * The Idol's target card under The Order (the Multiplayer mod's compatibility/TheOrder.lua,
 * reset_idol_card): which (rank, suit) the reel puts first, and how likely each is.
 *
 * The deck is grouped by rank and suit (Stone cards don't count). Each group gets a tier and a
 * score, and the groups are sorted: tier A first, then by score, then by rank and suit. The roll
 * then walks down that list with each group's share of the deck, so the order decides which
 * stretch of the roll each card owns, while the chance of each is just copies / deck size.
 *
 * Kept as close to the Lua as possible (same operations in the same order), so scores and ties
 * come out the same as in the game.
 */

/** Rank and suit order of Steamodded's SMODS.Rank / SMODS.Suit buffers (index = position). */
export const IDOL_RANKS = [
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
] as const;
export const IDOL_SUITS = ["Diamonds", "Clubs", "Hearts", "Spades"] as const;
export type IdolRank = (typeof IDOL_RANKS)[number];
export type IdolSuit = (typeof IDOL_SUITS)[number];

const FACE: ReadonlySet<string> = new Set(["Jack", "Queen", "King"]);
/** Ranks with a nominal value of 2 to 5. */
const LOW: ReadonlySet<string> = new Set(["2", "3", "4", "5"]);

/** One playing card in the deck. Enhancement and seal are the game's ids (glass, red…). */
export interface IdolCard {
  rank: IdolRank;
  suit: IdolSuit;
  enhancement?: string;
  seal?: string;
  edition?: string;
}

/**
 * What each seal, edition and enhancement adds per card (TheOrder.lua's seal_weight,
 * edition_weight and enhancement_weight). Anything not listed adds 0.
 */
export const IDOL_BONUS = {
  seals: { red: 1.0 } as Record<string, number>,
  editions: { polychrome: 0.5, holo: 0.25, foil: 0.25 } as Record<
    string,
    number
  >,
  enhancements: { glass: 0.5, lucky: 0.01, bonus: 0.01, mult: 0.01 } as Record<
    string,
    number
  >,
};

/** The algorithm's constants, named as in TheOrder.lua. */
export const IDOL_WEIGHTS = {
  /** Copies needed for tier A. */
  TARGET_COPIES: 5,
  /** Multiplier on seals, editions and enhancements in tier A and in tier B. */
  W_EDITION_A: 1.0,
  W_EDITION_B: 0.5,
  /** Tier A: per effective copy. */
  W_COUNT_A: 1.0,
  /** Tier B: per effective copy (progress toward 5). */
  W_MAIN: 2.0,
  /** Tier B: per off-suit copy a suit changer could convert, at most OFF_CAP. */
  W_OFF: 0.8,
  OFF_CAP: 3,
  /** Tier B: per same-suit card one rank below that Strength could raise, at most STR_CAP. */
  W_STR: 0.7,
  STR_CAP: 2,
  /** Face and low ranks: per card over the baseline (face cards × 1.1). */
  W_GEN: 0.05,
  FACE_MULT: 1.1,
};

const bonus = (table: Record<string, number>, id: string | undefined) =>
  id !== undefined && Object.hasOwn(table, id) ? table[id] : 0.0;
const editionWeight = (card: IdolCard) =>
  bonus(IDOL_BONUS.editions, card.edition);
const enhancementWeight = (card: IdolCard) =>
  bonus(IDOL_BONUS.enhancements, card.enhancement);
const sealWeight = (card: IdolCard) => bonus(IDOL_BONUS.seals, card.seal);

const isWild = (card: IdolCard) => card.enhancement === "wild";

/** One kind of seal, edition or enhancement in a group, with how many copies have it. */
export interface IdolQuality {
  kind: "seal" | "edition" | "enhancement";
  id: string;
  copies: number;
  /** Bonus per copy, before the tier's multiplier. */
  each: number;
}

/** Every part of a group's score and the numbers behind it, to show where it comes from. */
export interface IdolScore {
  /** Physical copies of this rank and suit. */
  own: number;
  /** Wild cards of the same rank in other suits, which also count as this card. */
  wildsElsewhere: number;
  /** own + wildsElsewhere. */
  effectiveCount: number;
  /** Tier A: the count term; tier B: progress toward 5 copies (W_MAIN). */
  count: number;
  /** Tier B: copies still needed to reach 5. */
  needed: number;
  /** Tier B: off-suit, non-Wild cards of this rank. */
  convertible: number;
  /** Tier B: how many of those count (capped at 3 and at `needed`). */
  offSuitCards: number;
  offSuit: number;
  /** Tier B: the rank below (wrapping 2 → Ace). */
  previousRank: string;
  /** Tier B: same-suit cards of the rank below, plus its Wild cards in other suits. */
  neighbourCards: number;
  /** Tier B: how many of those count (capped at 2 and at `needed`). */
  strengthCards: number;
  strength: number;
  /** Face cards (J, Q, K) in the deck, and what's expected for that many ranks. */
  facePool: number;
  faceBaseline: number;
  face: number;
  /** 2–5 cards in the deck, and what's expected for that many ranks. */
  lowPool: number;
  lowBaseline: number;
  low: number;
  qualities: IdolQuality[];
  /** Sum of the seal, edition and enhancement bonuses, before the multiplier. */
  qualityRaw: number;
  qualityMultiplier: number;
  /** After the multiplier. */
  quality: number;
}

/** A group's seals, editions and enhancements that have a bonus, counted per kind. */
function qualitiesOf(cards: IdolCard[]): IdolQuality[] {
  const out: IdolQuality[] = [];
  const add = (
    kind: IdolQuality["kind"],
    id: string | undefined,
    each: number,
  ) => {
    if (!id || !each) return;
    const found = out.find((q) => q.kind === kind && q.id === id);
    if (found) found.copies++;
    else out.push({ kind, id, copies: 1, each });
  };
  for (const card of cards) {
    add("seal", card.seal, sealWeight(card));
    add("edition", card.edition, editionWeight(card));
    add("enhancement", card.enhancement, enhancementWeight(card));
  }
  return out;
}

export interface IdolEntry {
  rank: IdolRank;
  suit: IdolSuit;
  /** Physical copies in the deck. */
  count: number;
  cards: IdolCard[];
  tier: "A" | "B";
  score: number;
  parts: IdolScore;
  /** count / deck size: the chance the Idol picks this card. */
  chance: number;
  /** The stretch of the roll (0–1) that picks it, from the sorted order. */
  rollFrom: number;
  rollTo: number;
}

export interface IdolResult {
  /** Sorted the way the game sorts them: the first owns the start of the roll. */
  entries: IdolEntry[];
  /** Stone cards, which the Idol ignores. */
  stones: number;
  total: number;
}

const roundToNearest05 = (x: number) => Math.floor(x * 20 + 0.5) / 20;

export function idolWeights(deck: IdolCard[]): IdolResult {
  // Step 1: group by (rank, suit), in deck order.
  interface Group {
    rank: IdolRank;
    suit: IdolSuit;
    count: number;
    wildCount: number;
    cards: IdolCard[];
  }
  const groups = new Map<string, Group>();
  let stones = 0;
  for (const card of deck) {
    if (card.enhancement === "stone") {
      stones++;
      continue;
    }
    const key = `${card.rank}_${card.suit}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        rank: card.rank,
        suit: card.suit,
        count: 0,
        wildCount: 0,
        cards: [],
      };
      groups.set(key, g);
    }
    g.count++;
    g.cards.push(card);
    if (isWild(card)) g.wildCount++;
  }
  const list = [...groups.values()];
  if (list.length === 0) return { entries: [], stones, total: 0 };

  // Step 2: positions in Steamodded's rank and suit order (1-based, like Lua).
  const rankIndex = (r: string) => IDOL_RANKS.indexOf(r as IdolRank) + 1;
  const suitIndex = (s: string) => IDOL_SUITS.indexOf(s as IdolSuit) + 1;

  // Step 3: per-rank totals, wilds per rank, distinct ranks, deck size.
  const rankTotals = new Map<string, number>();
  const wildByRank = new Map<string, number>();
  for (const g of list) {
    rankTotals.set(g.rank, (rankTotals.get(g.rank) ?? 0) + g.count);
    wildByRank.set(g.rank, (wildByRank.get(g.rank) ?? 0) + g.wildCount);
  }
  const distinctRanks = rankTotals.size;
  let totalCards = 0;
  for (const g of list) totalCards += g.count;
  const rawMeanByNumber = totalCards / distinctRanks;

  // Step 4: face and low pools against their mean-based baselines.
  let facePool = 0;
  let lowPool = 0;
  let faceRanksPresent = 0;
  let lowRanksPresent = 0;
  for (const [rank, total] of rankTotals) {
    if (FACE.has(rank)) {
      facePool += total;
      faceRanksPresent++;
    } else if (LOW.has(rank)) {
      lowPool += total;
      lowRanksPresent++;
    }
  }
  const faceBaseline = roundToNearest05(rawMeanByNumber * faceRanksPresent);
  const lowBaseline = roundToNearest05(rawMeanByNumber * lowRanksPresent);
  const { W_GEN, FACE_MULT } = IDOL_WEIGHTS;
  const GEN_FLOOR = 0.0;
  const faceScore = (rank: string) =>
    FACE.has(rank)
      ? Math.max(
          GEN_FLOOR,
          W_GEN * FACE_MULT * Math.max(0.0, facePool - faceBaseline),
        )
      : 0.0;
  const lowScore = (rank: string) =>
    LOW.has(rank)
      ? Math.max(GEN_FLOOR, W_GEN * Math.max(0.0, lowPool - lowBaseline))
      : 0.0;

  // Step 5: the rank below, wrapping from 2 to Ace.
  const previousRank = (rank: string) => {
    const idx = rankIndex(rank);
    return idx === 1 ? IDOL_RANKS[IDOL_RANKS.length - 1] : IDOL_RANKS[idx - 2];
  };

  // Step 6: weights.
  const {
    TARGET_COPIES,
    W_EDITION_A,
    W_EDITION_B,
    W_COUNT_A,
    W_MAIN,
    W_OFF,
    OFF_CAP,
    W_STR,
    STR_CAP,
  } = IDOL_WEIGHTS;

  // Step 7: score each group.
  const scored = list.map((g) => {
    const wildElsewhere = (wildByRank.get(g.rank) ?? 0) - g.wildCount;
    const effectiveCount = g.count + wildElsewhere;
    const face = faceScore(g.rank);
    const low = lowScore(g.rank);
    let sealScore = 0.0;
    let editionScore = 0.0;
    for (const card of g.cards) {
      sealScore = sealScore + sealWeight(card);
      editionScore =
        editionScore + editionWeight(card) + enhancementWeight(card);
    }
    let score: number;
    let tier: 1 | 0;
    const parts: IdolScore = {
      own: g.count,
      wildsElsewhere: wildElsewhere,
      effectiveCount,
      count: 0,
      needed: 0,
      convertible: 0,
      offSuitCards: 0,
      offSuit: 0,
      previousRank: previousRank(g.rank),
      neighbourCards: 0,
      strengthCards: 0,
      strength: 0,
      facePool: FACE.has(g.rank) ? facePool : 0,
      faceBaseline: FACE.has(g.rank) ? faceBaseline : 0,
      face,
      lowPool: LOW.has(g.rank) ? lowPool : 0,
      lowBaseline: LOW.has(g.rank) ? lowBaseline : 0,
      low,
      qualities: qualitiesOf(g.cards),
      qualityRaw: sealScore + editionScore,
      qualityMultiplier: 0,
      quality: 0,
    };
    if (effectiveCount >= TARGET_COPIES) {
      tier = 1;
      parts.count = W_COUNT_A * effectiveCount;
      parts.qualityMultiplier = W_EDITION_A;
      parts.quality = (sealScore + editionScore) * W_EDITION_A;
      score =
        W_COUNT_A * effectiveCount +
        face +
        low +
        (sealScore + editionScore) * W_EDITION_A;
    } else {
      tier = 0;
      const needed = TARGET_COPIES - effectiveCount;
      const mainHit = W_MAIN * effectiveCount;
      const convertiblePool =
        (rankTotals.get(g.rank) ?? 0) - g.count - wildElsewhere;
      const offCards = Math.min(
        OFF_CAP,
        Math.max(0.0, convertiblePool),
        needed,
      );
      const offHit = W_OFF * offCards;
      const prev = previousRank(g.rank);
      const neighbour = groups.get(`${prev}_${g.suit}`);
      const physicalSameSuit = neighbour ? neighbour.count : 0;
      const neighbourWildSameSuit = neighbour ? neighbour.wildCount : 0;
      const prevWildElsewhere =
        (wildByRank.get(prev) ?? 0) - neighbourWildSameSuit;
      const neighbourCount = physicalSameSuit + prevWildElsewhere;
      const strengthCards = Math.min(STR_CAP, neighbourCount, needed);
      const strengthAdj = W_STR * strengthCards;
      parts.count = mainHit;
      parts.needed = needed;
      parts.convertible = convertiblePool;
      parts.offSuitCards = offCards;
      parts.offSuit = offHit;
      parts.neighbourCards = neighbourCount;
      parts.strengthCards = strengthCards;
      parts.strength = strengthAdj;
      parts.qualityMultiplier = W_EDITION_B;
      parts.quality = (sealScore + editionScore) * W_EDITION_B;
      score =
        mainHit +
        offHit +
        strengthAdj +
        face +
        low +
        (sealScore + editionScore) * W_EDITION_B;
    }
    return { g, tier, score, parts };
  });

  // Step 8: tier, then score, then higher rank, then later suit.
  scored.sort((a, b) => {
    if (a.tier !== b.tier) return b.tier - a.tier;
    if (a.score !== b.score) return b.score - a.score;
    const ra = rankIndex(a.g.rank);
    const rb = rankIndex(b.g.rank);
    if (ra !== rb) return rb - ra;
    return suitIndex(b.g.suit) - suitIndex(a.g.suit);
  });

  // Step 9: the roll walks down the list, each card owning count / total of it.
  let threshold = 0;
  const entries = scored.map(({ g, tier, score, parts }) => {
    const from = threshold;
    threshold = threshold + g.count / totalCards;
    return {
      rank: g.rank,
      suit: g.suit,
      count: g.count,
      cards: g.cards,
      tier: tier === 1 ? ("A" as const) : ("B" as const),
      score,
      parts,
      chance: g.count / totalCards,
      rollFrom: from,
      rollTo: threshold,
    };
  });
  return { entries, stones, total: totalCards };
}

/** Starting decks: the game's 52-card deck and the decks that change it. */
export const IDOL_PRESETS: {
  id: string;
  label: string;
  deck: () => IdolCard[];
}[] = [
  { id: "empty", label: "Empty", deck: () => [] },
  {
    id: "regular",
    label: "Regular",
    deck: () =>
      IDOL_SUITS.flatMap((suit) => IDOL_RANKS.map((rank) => ({ rank, suit }))),
  },
  {
    // Abandoned Deck: no face cards.
    id: "abandoned",
    label: "Abandoned",
    deck: () =>
      IDOL_SUITS.flatMap((suit) =>
        IDOL_RANKS.filter((rank) => !FACE.has(rank)).map((rank) => ({
          rank,
          suit,
        })),
      ),
  },
  {
    // Checkered Deck: 26 Spades and 26 Hearts.
    id: "checkered",
    label: "Checkered",
    deck: () =>
      (["Spades", "Spades", "Hearts", "Hearts"] as const).flatMap((suit) =>
        IDOL_RANKS.map((rank) => ({ rank, suit })),
      ),
  },
];

// A deck as a short text for links: one token per kind of card, joined by "-". A token is the
// rank (2–9, T, J, Q, K, A) and suit (S, H, C, D), then one letter each for the enhancement
// (lower case), seal (upper case) and edition, and "*n" for n copies: "KH*4-KSw-AHgR".
const RANK_CODES: Record<string, IdolRank> = {
  T: "10",
  J: "Jack",
  Q: "Queen",
  K: "King",
  A: "Ace",
};
const SUIT_CODES: Record<string, IdolSuit> = {
  S: "Spades",
  H: "Hearts",
  C: "Clubs",
  D: "Diamonds",
};
const ENHANCEMENT_CODES: Record<string, string> = {
  b: "bonus",
  m: "mult",
  w: "wild",
  g: "glass",
  s: "steel",
  t: "stone",
  o: "gold",
  l: "lucky",
};
const SEAL_CODES: Record<string, string> = {
  R: "red",
  B: "blue",
  G: "gold",
  P: "purple",
};
const EDITION_CODES: Record<string, string> = {
  f: "foil",
  h: "holo",
  p: "polychrome",
};
const codeOf = (table: Record<string, string>, value: string | undefined) =>
  Object.keys(table).find((k) => table[k] === value) ?? "";

function cardToken(card: IdolCard) {
  const rank = codeOf(RANK_CODES, card.rank) || card.rank;
  return (
    rank +
    codeOf(SUIT_CODES, card.suit) +
    codeOf(ENHANCEMENT_CODES, card.enhancement) +
    codeOf(SEAL_CODES, card.seal) +
    codeOf(EDITION_CODES, card.edition)
  );
}

/** The deck as link text, identical cards grouped: "KH*4-KSw-AHgR". */
export function encodeIdolDeck(deck: IdolCard[]): string {
  const counts = new Map<string, number>();
  for (const card of deck) {
    const token = cardToken(card);
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts]
    .map(([token, n]) => (n > 1 ? `${token}*${n}` : token))
    .join("-");
}

/** Reads a deck from link text; tokens it doesn't understand are skipped. */
export function decodeIdolDeck(text: string): IdolCard[] {
  const deck: IdolCard[] = [];
  for (const part of text.split("-")) {
    const m = /^(10|[2-9TJQKA])([SHCD])([a-zA-Z]*)(?:\*(\d{1,3}))?$/.exec(part);
    if (!m) continue;
    const rank = (RANK_CODES[m[1]] ?? m[1]) as IdolRank;
    const card: IdolCard = { rank, suit: SUIT_CODES[m[2]] };
    for (const letter of m[3]) {
      if (ENHANCEMENT_CODES[letter])
        card.enhancement = ENHANCEMENT_CODES[letter];
      else if (SEAL_CODES[letter]) card.seal = SEAL_CODES[letter];
      else if (EDITION_CODES[letter]) card.edition = EDITION_CODES[letter];
    }
    const n = Math.min(Number(m[4] ?? 1), 500);
    for (let i = 0; i < n; i++) deck.push({ ...card });
  }
  return deck;
}
