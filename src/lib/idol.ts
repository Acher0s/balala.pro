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

function editionWeight(card: IdolCard) {
  if (card.edition === "polychrome") return 0.5;
  if (card.edition === "holo") return 0.25;
  if (card.edition === "foil") return 0.25;
  return 0.0;
}

function enhancementWeight(card: IdolCard) {
  if (card.enhancement === "glass") return 0.5;
  if (card.enhancement === "lucky") return 0.01;
  if (card.enhancement === "bonus") return 0.01;
  if (card.enhancement === "mult") return 0.01;
  return 0.0;
}

function sealWeight(card: IdolCard) {
  return card.seal === "red" ? 1.0 : 0.0;
}

const isWild = (card: IdolCard) => card.enhancement === "wild";

/** Every part of a group's score, to show where it comes from. */
export interface IdolScore {
  /** Copies plus Wild cards of the same rank in other suits. */
  effectiveCount: number;
  /** Tier A: the count term; tier B: progress toward 5 copies (W_MAIN). */
  count: number;
  /** Tier B: off-suit copies a suit changer could turn into this suit (up to 3). */
  offSuit: number;
  /** Tier B: same-suit cards one rank below that Strength could raise (up to 2). */
  strength: number;
  face: number;
  low: number;
  /** Seals, editions and enhancements, after the tier's multiplier. */
  quality: number;
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
  const W_GEN = 0.05;
  const GEN_FLOOR = 0.0;
  const faceScore = (rank: string) =>
    FACE.has(rank)
      ? Math.max(
          GEN_FLOOR,
          W_GEN * 1.1 * Math.max(0.0, facePool - faceBaseline),
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
  const TARGET_COPIES = 5;
  const W_EDITION_A = 1.0;
  const W_EDITION_B = 0.5;
  const W_COUNT_A = 1.0;
  const W_MAIN = 2.0;
  const W_OFF = 0.8;
  const W_STR = 0.7;

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
      effectiveCount,
      count: 0,
      offSuit: 0,
      strength: 0,
      face,
      low,
      quality: 0,
    };
    if (effectiveCount >= TARGET_COPIES) {
      tier = 1;
      parts.count = W_COUNT_A * effectiveCount;
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
      const offHit =
        W_OFF * Math.min(3, Math.max(0.0, convertiblePool), needed);
      const prev = previousRank(g.rank);
      const neighbour = groups.get(`${prev}_${g.suit}`);
      const physicalSameSuit = neighbour ? neighbour.count : 0;
      const neighbourWildSameSuit = neighbour ? neighbour.wildCount : 0;
      const prevWildElsewhere =
        (wildByRank.get(prev) ?? 0) - neighbourWildSameSuit;
      const neighbourCount = physicalSameSuit + prevWildElsewhere;
      const strengthAdj = W_STR * Math.min(2, neighbourCount, needed);
      parts.count = mainHit;
      parts.offSuit = offHit;
      parts.strength = strengthAdj;
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
