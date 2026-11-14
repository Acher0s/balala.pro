"use client";

import { createContext, type ReactNode, useContext } from "react";
import { EditionCard } from "@/components/edition-card";
import { colourOf, EffectText } from "@/components/effect-text";
import type { EditionId } from "@/data/game-types";
import type { ArtItem, SeedArt } from "./art";

export const ArtContext = createContext<SeedArt | null>(null);

export function useArt(): SeedArt {
  const art = useContext(ArtContext);
  if (!art) throw new Error("useArt outside <ArtContext>");
  return art;
}

/** Card width on the page: the game's 2× sprites at half size, so a queue fits on screen. */
const CARD_W = 71;
const CARD_H = 95;

const RARITY_NAME = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  legendary: "Legendary",
};

function Tooltip({
  colour,
  title,
  badges,
  children,
}: {
  colour: string;
  title: string;
  badges: { label: string; colour: string }[];
  children?: ReactNode;
}) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none invisible absolute bottom-full left-1/2 z-30 mb-2 flex w-56 -translate-x-1/2 flex-col items-center gap-1.5 rounded-xl border-2 bg-[#3a5055] p-2.5 text-center opacity-0 shadow-xl transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      style={{ borderColor: colour }}
    >
      <span className="text-sm font-bold text-white">{title}</span>
      {children}
      <span className="flex flex-wrap justify-center gap-1">
        {badges.map((b) => (
          <span
            key={b.label}
            className="rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
            style={{ background: b.colour }}
          >
            {b.label}
          </span>
        ))}
      </span>
    </span>
  );
}

const EDITION_COLOUR = "#4f6367";

/** A sprite, or a stack of full-card layers, at card size. */
function Layers({ layers, alt }: { layers: string[]; alt: string }) {
  return (
    <span
      className="relative block"
      style={{ width: CARD_W, height: CARD_H }}
      role="img"
      aria-label={alt}
    >
      {layers.map((src, i) => (
        // biome-ignore lint/performance/noImgElement: tiny static pixel art
        <img
          // biome-ignore lint/suspicious/noArrayIndexKey: layers are positional
          key={i}
          src={src}
          alt=""
          width={CARD_W}
          height={CARD_H}
          className="absolute inset-0"
          style={{ margin: 0, maxWidth: "none" }}
          loading="lazy"
        />
      ))}
    </span>
  );
}

function Picture({
  layers,
  overlays,
  edition,
  alt,
}: {
  layers: string[];
  overlays: string[];
  edition?: string;
  alt: string;
}) {
  if (edition)
    return (
      <EditionCard
        layers={layers}
        overlays={overlays}
        edition={edition as EditionId}
        alt={alt}
        width={CARD_W}
        height={CARD_H}
        pixelated={false}
      />
    );
  return <Layers layers={[...layers, ...overlays]} alt={alt} />;
}

/** A label under a card: its place in the queue, and a note such as "skipped". */
function Caption({ index, note }: { index?: number; note?: ReactNode }) {
  if (index === undefined && !note) return null;
  return (
    <span className="flex flex-col items-center text-[11px] leading-tight text-fd-muted-foreground">
      {index !== undefined && <span className="font-mono">#{index}</span>}
      {note}
    </span>
  );
}

/**
 * One rolled item, drawn like the game: the card, its edition's shine and its stickers, with
 * its name and effect on hover.
 */
export function ItemCard({
  itemKey,
  edition,
  stickers = [],
  index,
  note,
  dim,
}: {
  itemKey: string;
  edition?: string;
  stickers?: string[];
  index?: number;
  note?: ReactNode;
  dim?: boolean;
}) {
  const art = useArt();
  const item: ArtItem | undefined = art.items[itemKey];
  if (!item)
    return (
      <span className="flex w-[71px] flex-col items-center gap-1">
        <span className="flex h-[95px] w-[71px] items-center justify-center rounded border text-[10px]">
          {itemKey}
        </span>
        <Caption index={index} note={note} />
      </span>
    );
  const stickerItems = stickers.flatMap((s) => art.items[s] ?? []);
  const colour = colourOf(item);
  const ed = edition ? art.editions[edition] : undefined;
  const badges = [
    { label: item.rarity ? RARITY_NAME[item.rarity] : item.kind, colour },
    ...(ed ? [{ label: ed.name, colour: EDITION_COLOUR }] : []),
    ...stickerItems.map((s) => ({
      label: s.name,
      colour: s.colour ?? "#6b7f84",
    })),
    ...(item.source !== "vanilla"
      ? [{ label: "Multiplayer", colour: "#ac3232" }]
      : []),
  ];
  const small = item.w < 100;
  return (
    <span
      className={`group relative flex w-[71px] flex-col items-center gap-1 ${dim ? "opacity-40" : ""}`}
    >
      <button
        type="button"
        className="flex h-[95px] w-[71px] items-center justify-center rounded transition-transform hover:-translate-y-1 focus:-translate-y-1"
      >
        {small ? (
          // biome-ignore lint/performance/noImgElement: tiny static pixel art
          <img
            src={item.image}
            alt={item.name}
            width={item.w}
            height={item.h}
            style={{ imageRendering: "pixelated", margin: 0 }}
          />
        ) : (
          <Picture
            layers={[item.image]}
            overlays={stickerItems.flatMap((s) =>
              s.overlay ? [s.overlay] : [],
            )}
            edition={edition}
            alt={[item.name, ed?.name, ...stickerItems.map((s) => s.name)]
              .filter(Boolean)
              .join(", ")}
          />
        )}
      </button>
      <Caption index={index} note={note} />
      <Tooltip colour={colour} title={item.name} badges={badges}>
        <EffectText lines={item.text} />
        {ed && (
          <span className="mt-1 border-t border-white/20 pt-1">
            <EffectText lines={ed.text} />
          </span>
        )}
      </Tooltip>
    </span>
  );
}

/** A playing card from the shop (Magic Trick / Illusion). */
export function PlayingCardCard({
  card,
  enhancement,
  edition,
  seal,
  index,
  note,
}: {
  card: string;
  enhancement?: string;
  edition?: string;
  /** Seal key: "Gold", "Red", "Blue" or "Purple". */
  seal?: string;
  index?: number;
  note?: ReactNode;
}) {
  const art = useArt();
  const front = art.cards[card];
  const enh = enhancement ? art.items[enhancement] : undefined;
  const ed = edition ? art.editions[edition] : undefined;
  const sl = seal ? art.items[seal] : undefined;
  const layers = [
    enh?.image ?? art.base,
    ...(enhancement === "m_stone" || !front ? [] : [front.image]),
  ];
  const name = [front?.name ?? card, enh?.name, ed?.name, sl?.name]
    .filter(Boolean)
    .join(", ");
  return (
    <span className="group relative flex w-[71px] flex-col items-center gap-1">
      <button
        type="button"
        className="flex h-[95px] w-[71px] items-center justify-center rounded transition-transform hover:-translate-y-1 focus:-translate-y-1"
      >
        <Picture
          layers={layers}
          overlays={sl?.overlay ? [sl.overlay] : []}
          edition={edition}
          alt={name}
        />
      </button>
      <Caption index={index} note={note} />
      <Tooltip
        colour="#6b7f84"
        title={front?.name ?? card}
        badges={[
          { label: "Playing card", colour: "#6b7f84" },
          ...(enh ? [{ label: enh.name, colour: "#6b7f84" }] : []),
          ...(ed ? [{ label: ed.name, colour: EDITION_COLOUR }] : []),
          ...(sl ? [{ label: sl.name, colour: colourOf(sl) }] : []),
        ]}
      >
        {enh && <EffectText lines={enh.text} />}
        {sl && <EffectText lines={sl.text} />}
      </Tooltip>
    </span>
  );
}
