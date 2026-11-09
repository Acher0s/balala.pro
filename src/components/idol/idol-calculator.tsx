"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { EditionCard } from "@/components/edition-card";
import type { EditionId } from "@/data/game-types";
import {
  IDOL_RANKS,
  IDOL_SUITS,
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

/** Steps through a list (with "None" first when `none`), wrapping around. */
function useRotation<T>(options: T[]) {
  const [index, setIndex] = useState(0);
  return {
    value: options[index],
    step: (by: 1 | -1) =>
      setIndex((i) => (i + by + options.length) % options.length),
  };
}

const fmt = (x: number) => (Math.round(x * 1000) / 1000).toString();

/** Where a card's weight comes from, for its tooltip. */
function breakdown(e: IdolEntry) {
  const p = e.parts;
  const lines = [
    `Effective copies: ${p.effectiveCount}${p.effectiveCount !== e.count ? ` (${e.count} + Wild cards)` : ""}`,
    `${e.tier === "A" ? "Copies" : "Progress to 5"}: ${fmt(p.count)}`,
  ];
  if (e.tier === "B") {
    lines.push(`Suit changers: ${fmt(p.offSuit)}`);
    lines.push(`Strength: ${fmt(p.strength)}`);
  }
  if (p.face) lines.push(`Face cards: ${fmt(p.face)}`);
  if (p.low) lines.push(`Low cards: ${fmt(p.low)}`);
  if (p.quality) lines.push(`Seals, editions, enhancements: ${fmt(p.quality)}`);
  return lines.join("\n");
}

/**
 * The Idol Sorting Weight Calculator. Pick a suit, enhancement, seal and edition in the top bar,
 * then click or drag cards into the deck; click a card in the deck to take it out. The deck is
 * sorted the way The Order sorts it before the Idol rolls.
 */
export function IdolCalculator({ art }: { art: IdolArt }) {
  const suit = useRotation(SUIT_PICKER);
  const enhancement = useRotation([undefined, ...art.enhancements]);
  const seal = useRotation([undefined, ...art.seals]);
  const edition = useRotation([undefined, ...art.editions]);
  const [deck, setDeck] = useState<DeckCard[]>([]);
  const [nextId, setNextId] = useState(1);
  const [dropping, setDropping] = useState(false);

  const make = (rank: IdolCard["rank"]): IdolCard => ({
    rank,
    suit: suit.value,
    ...(enhancement.value && { enhancement: enhancement.value.id }),
    ...(seal.value && { seal: seal.value.id }),
    ...(edition.value && { edition: edition.value.id }),
  });
  const add = (...cards: IdolCard[]) => {
    setDeck((d) => [...d, ...cards.map((c, i) => ({ ...c, id: nextId + i }))]);
    setNextId((n) => n + cards.length);
  };
  const remove = (id: number) => setDeck((d) => d.filter((c) => c.id !== id));

  const result = useMemo(() => idolWeights(deck), [deck]);
  // The deck's cards per group, so each copy can be removed on its own.
  const copiesOf = (e: IdolEntry) =>
    deck.filter(
      (c) =>
        c.rank === e.rank && c.suit === e.suit && c.enhancement !== "stone",
    );
  const stones = deck.filter((c) => c.enhancement === "stone");

  return (
    <div className="not-prose my-6 flex flex-col gap-4">
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
            value={enhancement.value?.name ?? "None"}
            onStep={enhancement.step}
          />
          <Rotator
            label="Seal"
            value={seal.value?.name ?? "None"}
            onStep={seal.step}
          />
          <Rotator
            label="Edition"
            value={edition.value?.name ?? "None"}
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
          Click or drag a card into your deck.{" "}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-fd-foreground"
            onClick={() =>
              add(
                ...IDOL_SUITS.flatMap((s) =>
                  IDOL_RANKS.map((rank) => ({ rank, suit: s })),
                ),
              )
            }
          >
            Add a standard 52-card deck
          </button>
        </p>
      </section>

      <section
        aria-label="Your deck"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("application/x-idol-card")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setDropping(true);
          }
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDropping(false);
          const raw = e.dataTransfer.getData("application/x-idol-card");
          if (raw) add(JSON.parse(raw) as IdolCard);
        }}
        className={`flex flex-col gap-3 rounded-xl border-2 bg-fd-card p-4 transition-colors ${
          dropping ? "border-fd-primary bg-fd-primary/5" : "border-dashed"
        }`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="font-semibold">
            Your deck{" "}
            <span className="text-sm font-normal text-fd-muted-foreground">
              {deck.length} {deck.length === 1 ? "card" : "cards"}
              {stones.length > 0 &&
                ` (${stones.length} Stone, which the Idol ignores)`}
            </span>
          </h4>
          {deck.length > 0 && (
            <button
              type="button"
              onClick={() => setDeck([])}
              className="rounded-md border px-2 py-1 text-xs hover:bg-fd-accent"
            >
              Clear deck
            </button>
          )}
        </div>

        {deck.length === 0 ? (
          <p className="py-6 text-center text-sm text-fd-muted-foreground">
            Drop cards here, or click them above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-fd-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Card</th>
                  <th className="py-2 pr-3 font-medium">Tier</th>
                  <th className="py-2 pr-3 font-medium">Weight</th>
                  <th className="py-2 font-medium">Copies (click to remove)</th>
                </tr>
              </thead>
              <tbody>
                {result.entries.map((e) => (
                  <tr
                    key={`${e.rank}_${e.suit}`}
                    className="border-b last:border-0"
                  >
                    <td className="py-1.5 pr-3 font-medium whitespace-nowrap">
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
                    <td
                      className="cursor-help py-1.5 pr-3 tabular-nums"
                      title={breakdown(e)}
                    >
                      {fmt(e.score)}
                    </td>
                    <td className="py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {copiesOf(e).map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            title={`Remove ${describe(c, art)}`}
                            onClick={() => remove(c.id)}
                            className="rounded hover:opacity-60"
                          >
                            <MiniCard card={c} art={art} width={36} />
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
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
                        {stones.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            title={`Remove ${describe(c, art)}`}
                            onClick={() => remove(c.id)}
                            className="rounded hover:opacity-60"
                          >
                            <MiniCard card={c} art={art} width={36} />
                          </button>
                        ))}
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
