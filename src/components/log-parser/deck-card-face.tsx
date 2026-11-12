"use client";

import { EditionCard } from "@/components/edition-card";
import type { EditionId } from "@/data/game-types";
import { playingCards } from "./bmp/card-art";
import type { DeckCardSnapshot } from "./bmp/legacy/deck-utils";

const EDITIONS: readonly string[] = ["foil", "holo", "polychrome", "negative"];
const style = {
  imageRendering: "pixelated" as const,
  margin: 0,
  maxWidth: "none",
};

/**
 * A card in the Log Parser's deck view, drawn like the rest of this site: the front on its
 * enhancement (Stone has none), the seal on top, and an edition animated with the game's own
 * shaders. Replaces the BMP site's sprite-sheet drawing (see NOTICE.md).
 */
export function DeckCardFace({ card }: { card: DeckCardSnapshot }) {
  const enhancement =
    (card.enhancement && playingCards.enhancements[card.enhancement]) ||
    playingCards.base;
  const front = playingCards.fronts[`${card.suit}_${card.rank}`];
  const seal = card.seal ? playingCards.seals[card.seal] : undefined;
  const layers = [
    enhancement,
    ...(card.enhancement === "m_stone" || !front ? [] : [front]),
  ];
  const overlays = seal ? [seal] : [];

  if (card.edition && EDITIONS.includes(card.edition))
    return (
      <span
        title={card.name}
        className="block overflow-hidden rounded-[0.45rem]"
      >
        <EditionCard
          layers={layers}
          overlays={overlays}
          edition={card.edition as EditionId}
          alt={card.name}
          width={71}
          height={95}
        />
      </span>
    );
  return (
    <span
      title={card.name}
      role="img"
      aria-label={card.name}
      className="relative block h-[95px] w-[71px] overflow-hidden rounded-[0.45rem]"
    >
      {[...layers, ...overlays].map((src) => (
        // biome-ignore lint/performance/noImgElement: small local card layers
        <img
          key={src}
          src={src}
          alt=""
          width={71}
          height={95}
          className="absolute inset-0"
          style={style}
        />
      ))}
    </span>
  );
}
