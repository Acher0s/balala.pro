"use client";

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { EditionCard } from "@/components/edition-card";
import type { EditionId } from "@/data/game-types";
import {
  decodeIdolDeck,
  encodeIdolDeck,
  IDOL_BONUS,
  IDOL_PRESETS,
  IDOL_RANKS,
  IDOL_WEIGHTS,
  type IdolCard,
  type IdolEntry,
  type IdolSuit,
  idolWeights,
} from "@/lib/idol";

/** The card art the calculator draws with, gathered on the server. */
export interface IdolArt {
  base: string;
  /** Fronts keyed "<rank>_<suit>", e.g. "King_Hearts". */
  fronts: Record<string, string>;
  enhancements: { id: string; name: string; image: string }[];
  seals: { id: string; name: string; image: string }[];
  editions: { id: string; name: string }[];
}

/** A card in the deck, with an id so one copy can be removed. */
interface DeckCard extends IdolCard {
  id: number;
}

const SUIT_SYMBOL: Record<IdolSuit, string> = {
  Spades: "♠",
  Hearts: "♥",
  Clubs: "♣",
  Diamonds: "♦",
};
/** Suits in the order players think of them, for the picker. */
const SUIT_PICKER: IdolSuit[] = ["Spades", "Hearts", "Clubs", "Diamonds"];

const rankLabel = (rank: string) =>
  ({ Jack: "J", Queen: "Q", King: "K", Ace: "A" })[rank] ?? rank;

/** A playing card drawn the way the game layers it, at a given width (95:71 cards). */
function MiniCard({
  card,
  art,
  width,
}: {
  card: IdolCard;
  art: IdolArt;
  width: number;
}) {
  const enhancement = art.enhancements.find((e) => e.id === card.enhancement);
  const seal = art.seals.find((s) => s.id === card.seal);
  const layers = [
    enhancement?.image ?? art.base,
    // Stone cards have no rank or suit.
    ...(card.enhancement === "stone"
      ? []
      : [art.fronts[`${card.rank}_${card.suit}`]]),
  ];
  const overlays = seal ? [seal.image] : [];
  const height = Math.round((width * 95) / 71);
  if (card.edition)
    return (
      <EditionCard
        layers={layers}
        overlays={overlays}
        edition={card.edition as EditionId}
        alt=""
        width={width}
        height={height}
        pixelated={false}
      />
    );
  return (
    <span className="relative inline-block" style={{ width, height }}>
      {[...layers, ...overlays].map((src) => (
        // biome-ignore lint/performance/noImgElement: tiny pixel-art layers
        <img
          key={src}
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full"
          style={{ margin: 0, maxWidth: "none" }}
          draggable={false}
        />
      ))}
    </span>
  );
}

const describe = (card: IdolCard, art: IdolArt) =>
  [
    `${card.rank} of ${card.suit}`,
    art.enhancements.find((e) => e.id === card.enhancement)?.name,
    art.seals.find((s) => s.id === card.seal)?.name,
    art.editions.find((e) => e.id === card.edition)?.name,
  ]
    .filter(Boolean)
    .join(", ");

/** One "‹ value ›" control of the top bar; clicking the value also steps forward. */
function Rotator({
  label,
  value,
  onStep,
}: {
  label: string;
  value: string;
  onStep: (by: 1 | -1) => void;
}) {
  const button =
    "rounded-md p-1 text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-foreground";
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-fd-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 rounded-lg border bg-fd-background p-0.5">
        <button
          type="button"
          className={button}
          aria-label={`Previous ${label.toLowerCase()}`}
          onClick={() => onStep(-1)}
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          className="min-w-24 flex-1 rounded-md px-1 py-0.5 text-center text-sm font-medium hover:bg-fd-accent"
          onClick={() => onStep(1)}
        >
          {value}
        </button>
        <button
          type="button"
          className={button}
          aria-label={`Next ${label.toLowerCase()}`}
          onClick={() => onStep(1)}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** Steps through a list, wrapping around. */
function useRotation<T>(options: T[]) {
  const [index, setIndex] = useState(0);
  return {
    value: options[index],
    step: (by: 1 | -1) =>
      setIndex((i) => (i + by + options.length) % options.length),
  };
}

const fmt = (x: number) => (Math.round(x * 1000) / 1000).toString();
const plural = (n: number, one: string, many = `${one}s`) =>
  `${fmt(n)} ${n === 1 ? one : many}`;
const RANK_PLURAL: Record<string, string> = {
  Jack: "Jacks",
  Queen: "Queens",
  King: "Kings",
  Ace: "Aces",
};
const ranks = (rank: string) => RANK_PLURAL[rank] ?? `${rank}s`;
/** "+0.5" for a bonus, nothing for 0. */
const plus = (x: number) => (x ? ` +${fmt(x)}` : "");

/** One line of a weight's breakdown: what it is, how it's worked out, and what it adds. */
interface Step {
  label: string;
  how: string;
  value: number;
}

/** Every term of a card's weight, worked out, in the order the game adds them up. */
function explain(e: IdolEntry, art: IdolArt): Step[] {
  const p = e.parts;
  const W = IDOL_WEIGHTS;
  const copies =
    p.wildsElsewhere > 0
      ? `${plural(p.own, "copy", "copies")} + ${plural(p.wildsElsewhere, "Wild")} ${ranks(e.rank).replace(/s$/, "")} in other suits`
      : plural(p.own, "copy", "copies");
  const steps: Step[] = [];
  if (e.tier === "A")
    steps.push({
      label: "Copies",
      how: `${copies} = ${p.effectiveCount} × ${W.W_COUNT_A}`,
      value: p.count,
    });
  else {
    steps.push({
      label: "Progress to 5",
      how: `${copies} = ${p.effectiveCount} × ${W.W_MAIN}`,
      value: p.count,
    });
    steps.push({
      label: "Suit changers",
      how: `${plural(Math.max(0, p.convertible), `other ${ranks(e.rank).replace(/s$/, "")}`, `other ${ranks(e.rank)}`)} to convert, counting ${p.offSuitCards} (at most ${W.OFF_CAP}, and the ${p.needed} still needed) × ${W.W_OFF}`,
      value: p.offSuit,
    });
    steps.push({
      label: "Strength",
      how: `${plural(p.neighbourCards, `${p.previousRank} of ${e.suit} or Wild ${p.previousRank}`, `${ranks(p.previousRank)} of ${e.suit} or Wild ${ranks(p.previousRank)}`)}, counting ${p.strengthCards} (at most ${W.STR_CAP}, and the ${p.needed} still needed) × ${W.W_STR}`,
      value: p.strength,
    });
  }
  if (p.facePool > 0)
    steps.push({
      label: "Face cards",
      how:
        p.face > 0
          ? `${p.facePool} in the deck, ${fmt(p.facePool - p.faceBaseline)} over the ${fmt(p.faceBaseline)} expected × ${W.W_GEN} × ${W.FACE_MULT}`
          : `${p.facePool} in the deck, not over the ${fmt(p.faceBaseline)} expected`,
      value: p.face,
    });
  if (p.lowPool > 0)
    steps.push({
      label: "Low cards (2–5)",
      how:
        p.low > 0
          ? `${p.lowPool} in the deck, ${fmt(p.lowPool - p.lowBaseline)} over the ${fmt(p.lowBaseline)} expected × ${W.W_GEN}`
          : `${p.lowPool} in the deck, not over the ${fmt(p.lowBaseline)} expected`,
      value: p.low,
    });
  const nameOf = (q: IdolEntry["parts"]["qualities"][number]) =>
    (q.kind === "seal"
      ? art.seals
      : q.kind === "edition"
        ? art.editions
        : art.enhancements
    ).find((x) => x.id === q.id)?.name ?? q.id;
  for (const q of p.qualities)
    steps.push({
      label: nameOf(q),
      how: `${plural(q.copies, "copy", "copies")} × ${q.each}${p.qualityMultiplier !== 1 ? ` × ${p.qualityMultiplier} (half in tier B)` : ""}`,
      value: q.copies * q.each * p.qualityMultiplier,
    });
  return steps;
}

/**
 * The Idol Sorting Weight Calculator. Pick a suit, enhancement, seal and edition in the top bar,
 * then click or drag cards into the deck (or start from a preset); click a card in the deck to
 * take it out, and a row to see how its weight is worked out. The deck is sorted the way The
 * Order sorts it before the Idol rolls, and kept in the page's link (?deck=…) for sharing.
 *
 * `initialDeck` starts it with a deck (link text, like ?deck=…). `deckOnly` shows just that deck,
 * for a guide pointing at a setup: no adding or removing cards, and the page's link is left alone.
 */
export function IdolCalculator({
  art,
  initialDeck = "",
  deckOnly = false,
}: {
  art: IdolArt;
  initialDeck?: string;
  deckOnly?: boolean;
}) {
  const suit = useRotation(SUIT_PICKER);
  const enhancement = useRotation([undefined, ...art.enhancements]);
  const seal = useRotation([undefined, ...art.seals]);
  const edition = useRotation([undefined, ...art.editions]);
  const [deck, setDeck] = useState<DeckCard[]>(() =>
    decodeIdolDeck(initialDeck).map((c, i) => ({ ...c, id: i + 1 })),
  );
  const [nextId, setNextId] = useState(
    () => decodeIdolDeck(initialDeck).length + 1,
  );
  const [dropping, setDropping] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const withIds = (cards: IdolCard[], from: number) =>
    cards.map((c, i) => ({ ...c, id: from + i }));
  const replace = (cards: IdolCard[]) => {
    setDeck(withIds(cards, nextId));
    setNextId((n) => n + cards.length);
  };
  const add = (...cards: IdolCard[]) => {
    setDeck((d) => [...d, ...withIds(cards, nextId)]);
    setNextId((n) => n + cards.length);
  };
  const remove = (id: number) => setDeck((d) => d.filter((c) => c.id !== id));

  // The deck from a shared link, once, in the browser (a deck shown in a guide keeps its own).
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on the first render
  useEffect(() => {
    if (deckOnly) return;
    const text = new URLSearchParams(window.location.search).get(DECK_PARAM);
    if (text) {
      const cards = decodeIdolDeck(text);
      setDeck(withIds(cards, 1));
      setNextId(cards.length + 1);
    }
    setLoaded(true);
  }, []);
  // Every change goes into the link, so the address bar can be shared as it is.
  useEffect(() => {
    if (!loaded || deckOnly) return;
    const url = new URL(window.location.href);
    if (deck.length) url.searchParams.set(DECK_PARAM, encodeIdolDeck(deck));
    else url.searchParams.delete(DECK_PARAM);
    window.history.replaceState(null, "", url);
    setCopied(false);
  }, [deck, loaded, deckOnly]);

  const make = (rank: IdolCard["rank"]): IdolCard => ({
    rank,
    suit: suit.value,
    ...(enhancement.value && { enhancement: enhancement.value.id }),
    ...(seal.value && { seal: seal.value.id }),
    ...(edition.value && { edition: edition.value.id }),
  });

  const result = useMemo(() => idolWeights(deck), [deck]);
  // The deck's cards per group, so each copy can be removed on its own.
  const copiesOf = (e: IdolEntry) =>
    deck.filter(
      (c) =>
        c.rank === e.rank && c.suit === e.suit && c.enhancement !== "stone",
    );
  const stones = deck.filter((c) => c.enhancement === "stone");
  const toggle = (key: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const bonusOf = {
    enhancement: (id?: string) => (id ? (IDOL_BONUS.enhancements[id] ?? 0) : 0),
    seal: (id?: string) => (id ? (IDOL_BONUS.seals[id] ?? 0) : 0),
    edition: (id?: string) => (id ? (IDOL_BONUS.editions[id] ?? 0) : 0),
  };
  const smallButton =
    "rounded-md border px-2 py-1 text-xs hover:bg-fd-accent disabled:opacity-50";
  /** A copy in the deck: removable while building a deck, just a picture when showing one. */
  const copy = (c: DeckCard) =>
    deckOnly ? (
      <span key={c.id} title={describe(c, art)}>
        <MiniCard card={c} art={art} width={36} />
      </span>
    ) : (
      <button
        key={c.id}
        type="button"
        title={`Remove ${describe(c, art)}`}
        onClick={(ev) => {
          ev.stopPropagation();
          remove(c.id);
        }}
        className="rounded hover:opacity-60"
      >
        <MiniCard card={c} art={art} width={36} />
      </button>
    );

  return (
    <div className="not-prose my-6 flex flex-col gap-4">
      {!deckOnly && (
        <section className="flex flex-col gap-3 rounded-xl border bg-fd-card p-4">
          <h4 className="font-semibold">Add cards</h4>
          <div className="flex flex-wrap gap-3">
            <Rotator
              label="Suit"
              value={`${SUIT_SYMBOL[suit.value]} ${suit.value}`}
              onStep={suit.step}
            />
            <Rotator
              label="Enhancement"
              value={`${enhancement.value?.name ?? "None"}${plus(bonusOf.enhancement(enhancement.value?.id))}`}
              onStep={enhancement.step}
            />
            <Rotator
              label="Seal"
              value={`${seal.value?.name ?? "None"}${plus(bonusOf.seal(seal.value?.id))}`}
              onStep={seal.step}
            />
            <Rotator
              label="Edition"
              value={`${edition.value?.name ?? "None"}${plus(bonusOf.edition(edition.value?.id))}`}
              onStep={edition.step}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {IDOL_RANKS.map((rank) => {
              const c = make(rank);
              return (
                <button
                  key={rank}
                  type="button"
                  draggable
                  title={`Add ${describe(c, art)}`}
                  onClick={() => add(c)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      "application/x-idol-card",
                      JSON.stringify(c),
                    );
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  className="cursor-grab rounded-md transition-transform hover:-translate-y-1 active:cursor-grabbing"
                >
                  <MiniCard card={c} art={art} width={71} />
                </button>
              );
            })}
          </div>
          <p className="text-xs text-fd-muted-foreground">
            Click or drag a card into your deck.
          </p>
          <BonusLegend art={art} />
        </section>
      )}

      <section
        aria-label={deckOnly ? "Deck" : "Your deck"}
        onDragOver={(e) => {
          if (
            !deckOnly &&
            e.dataTransfer.types.includes("application/x-idol-card")
          ) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setDropping(true);
          }
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          if (deckOnly) return;
          e.preventDefault();
          setDropping(false);
          const raw = e.dataTransfer.getData("application/x-idol-card");
          if (raw) add(JSON.parse(raw) as IdolCard);
        }}
        className={`flex flex-col gap-3 rounded-xl border-2 bg-fd-card p-4 transition-colors ${
          deckOnly
            ? "border-solid border-fd-border"
            : dropping
              ? "border-fd-primary bg-fd-primary/5"
              : "border-dashed"
        }`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="font-semibold">
            {deckOnly ? "Deck" : "Your deck"}{" "}
            <span className="text-sm font-normal text-fd-muted-foreground">
              {deck.length} {deck.length === 1 ? "card" : "cards"}
              {stones.length > 0 &&
                ` (${stones.length} Stone, which the Idol ignores)`}
            </span>
          </h4>
          {!deckOnly && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-fd-muted-foreground">
                Start from
              </span>
              {IDOL_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={smallButton}
                  onClick={() => {
                    replace(p.deck());
                    setOpen(new Set());
                  }}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                className={smallButton}
                disabled={deck.length === 0}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(window.location.href);
                    setCopied(true);
                  } catch {
                    // Clipboard blocked: the address bar holds the same link.
                  }
                }}
              >
                {copied ? "Link copied" : "Copy link"}
              </button>
            </div>
          )}
        </div>

        {deck.length === 0 ? (
          <p className="py-6 text-center text-sm text-fd-muted-foreground">
            Drop cards here, click them above, or start from a preset.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-fd-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Card</th>
                  <th className="py-2 pr-3 font-medium">Tier</th>
                  <th className="py-2 pr-3 font-medium">Weight</th>
                  <th className="py-2 font-medium">
                    {deckOnly ? "Copies" : "Copies (click to remove)"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.entries.map((e) => {
                  const key = `${e.rank}_${e.suit}`;
                  const expanded = open.has(key);
                  const steps = expanded ? explain(e, art) : [];
                  return (
                    <Fragment key={key}>
                      <tr
                        onClick={() => toggle(key)}
                        className={`cursor-pointer hover:bg-fd-accent/50 ${expanded ? "" : "border-b last:border-0"}`}
                      >
                        <td className="py-1.5 pr-3 font-medium whitespace-nowrap">
                          <button
                            type="button"
                            aria-expanded={expanded}
                            aria-label={`How ${e.rank} of ${e.suit} is weighted`}
                            className="mr-1 align-middle text-fd-muted-foreground"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              toggle(key);
                            }}
                          >
                            <ChevronDown
                              className={`inline size-4 transition-transform ${expanded ? "" : "-rotate-90"}`}
                            />
                          </button>
                          {rankLabel(e.rank)}
                          <span
                            className={
                              e.suit === "Hearts" || e.suit === "Diamonds"
                                ? "text-red-500"
                                : ""
                            }
                          >
                            {SUIT_SYMBOL[e.suit]}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3">
                          <span
                            className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                              e.tier === "A"
                                ? "bg-[#ff9a00] text-white"
                                : "bg-fd-secondary text-fd-muted-foreground"
                            }`}
                          >
                            {e.tier}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3 tabular-nums">
                          {fmt(e.score)}
                        </td>
                        <td className="py-1.5">
                          <div className="flex flex-wrap gap-1">
                            {copiesOf(e).map(copy)}
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-b last:border-0">
                          <td colSpan={4} className="pb-3">
                            <Breakdown entry={e} steps={steps} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {stones.length > 0 && (
                  <tr>
                    <td className="py-1.5 pr-3 text-fd-muted-foreground">
                      Stone
                    </td>
                    <td className="py-1.5 pr-3 text-fd-muted-foreground">—</td>
                    <td className="py-1.5 pr-3 text-fd-muted-foreground">
                      Ignored
                    </td>
                    <td className="py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {stones.map(copy)}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const DECK_PARAM = "deck";

/** How a card's weight adds up, one line per term, as in the game's formula. */
function Breakdown({ entry, steps }: { entry: IdolEntry; steps: Step[] }) {
  return (
    <div className="ml-6 flex flex-col gap-1 rounded-lg bg-fd-secondary/50 p-3 text-xs">
      <p className="mb-1 text-fd-muted-foreground">
        {entry.tier === "A"
          ? `Tier A: at least ${IDOL_WEIGHTS.TARGET_COPIES} copies (counting Wild cards), so it's weighted by its count and quality only, and sorts above every tier B card.`
          : `Tier B: under ${IDOL_WEIGHTS.TARGET_COPIES} copies (counting Wild cards), so it's weighted by how close it is to ${IDOL_WEIGHTS.TARGET_COPIES}.`}
      </p>
      <table className="w-full">
        <tbody>
          {steps.map((s) => (
            <tr key={s.label}>
              <td className="py-0.5 pr-3 font-medium whitespace-nowrap align-top">
                {s.label}
              </td>
              <td className="py-0.5 pr-3 text-fd-muted-foreground">{s.how}</td>
              <td className="py-0.5 text-right tabular-nums whitespace-nowrap align-top">
                {s.value ? `+${fmt(s.value)}` : "0"}
              </td>
            </tr>
          ))}
          <tr className="border-t">
            <td className="pt-1 pr-3 font-semibold">Weight</td>
            <td />
            <td className="pt-1 text-right font-semibold tabular-nums">
              {fmt(entry.score)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Every bonus value the weights use, so it's clear what counts for how much. */
function BonusLegend({ art }: { art: IdolArt }) {
  const W = IDOL_WEIGHTS;
  const named = (
    list: { id: string; name: string }[],
    table: Record<string, number>,
  ) =>
    Object.entries(table).map(([id, value]) => ({
      name: list.find((x) => x.id === id)?.name ?? id,
      value,
    }));
  const groups = [
    { title: "Seals", items: named(art.seals, IDOL_BONUS.seals) },
    { title: "Editions", items: named(art.editions, IDOL_BONUS.editions) },
    {
      title: "Enhancements",
      items: named(art.enhancements, IDOL_BONUS.enhancements),
    },
  ];
  return (
    <details className="rounded-lg border bg-fd-background p-3 text-xs">
      <summary className="cursor-pointer font-medium">
        Values the weights use
      </summary>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 font-medium">Bonus per card</p>
          <ul className="flex flex-col gap-0.5">
            {groups.flatMap((g) =>
              g.items.map((i) => (
                <li
                  key={`${g.title}:${i.name}`}
                  className="flex justify-between gap-3"
                >
                  <span>{i.name}</span>
                  <span className="tabular-nums">+{i.value}</span>
                </li>
              )),
            )}
            <li className="text-fd-muted-foreground">
              Anything else: 0. Counted in full in tier A, ×{W.W_EDITION_B} in
              tier B.
            </li>
          </ul>
        </div>
        <div>
          <p className="mb-1 font-medium">Copies and potential</p>
          <ul className="flex flex-col gap-0.5">
            <li className="flex justify-between gap-3">
              <span>Tier A: per copy</span>
              <span className="tabular-nums">+{W.W_COUNT_A}</span>
            </li>
            <li className="flex justify-between gap-3">
              <span>Tier B: per copy</span>
              <span className="tabular-nums">+{W.W_MAIN}</span>
            </li>
            <li className="flex justify-between gap-3">
              <span>Tier B: per off-suit copy (max {W.OFF_CAP})</span>
              <span className="tabular-nums">+{W.W_OFF}</span>
            </li>
            <li className="flex justify-between gap-3">
              <span>Tier B: per card one rank below (max {W.STR_CAP})</span>
              <span className="tabular-nums">+{W.W_STR}</span>
            </li>
            <li className="flex justify-between gap-3">
              <span>Per 2–5 card over the expected</span>
              <span className="tabular-nums">+{W.W_GEN}</span>
            </li>
            <li className="flex justify-between gap-3">
              <span>Per face card over the expected</span>
              <span className="tabular-nums">
                +{fmt(W.W_GEN * W.FACE_MULT)}
              </span>
            </li>
            <li className="text-fd-muted-foreground">
              Wild cards count as a copy in every suit. {W.TARGET_COPIES} or
              more copies make tier A.
            </li>
          </ul>
        </div>
      </div>
    </details>
  );
}
