import { describe, expect, it } from "vitest";
import {
  IDOL_RANKS,
  IDOL_SUITS,
  type IdolCard,
  type IdolRank,
  type IdolSuit,
  idolWeights,
} from "./idol";

const card = (
  rank: IdolRank,
  suit: IdolSuit,
  extra: Partial<IdolCard> = {},
): IdolCard => ({ rank, suit, ...extra });
const copies = (n: number, c: IdolCard) => Array.from({ length: n }, () => c);
const standardDeck = () =>
  IDOL_SUITS.flatMap((suit) => IDOL_RANKS.map((rank) => card(rank, suit)));

describe("Idol weights (The Order)", () => {
  it("scores every card of a standard deck the same and breaks ties by rank, then suit", () => {
    const { entries, total } = idolWeights(standardDeck());
    expect(total).toBe(52);
    // 1 copy: progress 2 + three off-suit copies to convert 2.4 + one card below for Strength 0.7.
    for (const e of entries) {
      expect(e.tier).toBe("B");
      expect(e.score).toBeCloseTo(5.1, 10);
      expect(e.chance).toBeCloseTo(1 / 52, 10);
    }
    expect(entries.slice(0, 5).map((e) => `${e.rank} ${e.suit}`)).toEqual([
      "Ace Spades",
      "Ace Hearts",
      "Ace Clubs",
      "Ace Diamonds",
      "King Spades",
    ]);
    expect(entries.at(-1)).toMatchObject({ rank: "2", suit: "Diamonds" });
    expect(entries.at(-1)?.rollTo).toBeCloseTo(1, 10);
  });

  it("puts 5 or more copies in tier A, ahead of any tier B score", () => {
    const deck = [
      ...copies(5, card("King", "Hearts")),
      ...copies(
        4,
        card("Ace", "Spades", { seal: "red", edition: "polychrome" }),
      ),
    ];
    const { entries } = idolWeights(deck);
    expect(entries.map((e) => `${e.rank} ${e.tier}`)).toEqual([
      "King A",
      "Ace B",
    ]);
    // 5 copies, plus a face bonus: 5 face cards against a baseline of 4.5 (the mean per rank).
    expect(entries[0].score).toBeCloseTo(5 + 0.05 * 1.1 * 0.5, 10);
  });

  it("adds seals, editions and enhancements: full in tier A, half in tier B", () => {
    const deck = [
      ...copies(4, card("King", "Hearts")),
      card("King", "Hearts", { seal: "red", enhancement: "glass" }),
    ];
    const [kings] = idolWeights(deck).entries;
    expect(kings.tier).toBe("A");
    expect(kings.score).toBeCloseTo(5 + 1 + 0.5, 10);
  });

  it("counts Wild cards of the same rank toward every other suit", () => {
    const deck = [
      ...copies(4, card("King", "Hearts")),
      card("King", "Spades", { enhancement: "wild" }),
    ];
    const { entries } = idolWeights(deck);
    const hearts = entries.find((e) => e.suit === "Hearts");
    const spades = entries.find((e) => e.suit === "Spades");
    expect(hearts).toMatchObject({ tier: "A", count: 4 });
    expect(hearts?.parts.effectiveCount).toBe(5);
    expect(spades).toMatchObject({ tier: "B" });
    expect(spades?.parts.effectiveCount).toBe(1);
  });

  it("leaves Stone cards out", () => {
    const deck = [
      card("Ace", "Spades"),
      card("2", "Hearts", { enhancement: "stone" }),
    ];
    const result = idolWeights(deck);
    expect(result.stones).toBe(1);
    expect(result.total).toBe(1);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].chance).toBe(1);
  });

  it("returns nothing for an empty deck", () => {
    expect(idolWeights([])).toEqual({ entries: [], stones: 0, total: 0 });
  });
});

describe("Idol deck links", () => {
  it("round-trips a deck, grouping identical cards", async () => {
    const { encodeIdolDeck, decodeIdolDeck } = await import("./idol");
    const deck = [
      ...copies(4, card("King", "Hearts")),
      card("King", "Spades", { enhancement: "wild" }),
      card("Ace", "Hearts", {
        enhancement: "glass",
        seal: "red",
        edition: "polychrome",
      }),
      card("10", "Diamonds", { enhancement: "stone" }),
    ];
    const text = encodeIdolDeck(deck);
    expect(text).toBe("KH*4-KSw-AHgRp-TDt");
    expect(decodeIdolDeck(text)).toEqual(deck);
  });

  it("skips tokens it doesn't understand", async () => {
    const { decodeIdolDeck } = await import("./idol");
    expect(decodeIdolDeck("KH-zz-1X-AS*2")).toEqual([
      card("King", "Hearts"),
      card("Ace", "Spades"),
      card("Ace", "Spades"),
    ]);
  });
});

describe("Idol deck link checks", () => {
  it("points out tokens that aren't cards", async () => {
    const { idolDeckProblems } = await import("./idol");
    expect(idolDeckProblems("KH*4-KSw-AHgRp")).toEqual([]);
    expect(idolDeckProblems("KH-KX-AHz-")).toEqual(["KX", "AHz", ""]);
  });
});
