import type { ReactNode } from "react";
import { EditionCard } from "@/components/edition-card";
import { COLOURS, colourOf, EffectText } from "@/components/effect-text";
import { FitRow } from "@/components/fit-row";
import {
  baseCardImage,
  type EditionId,
  type GameItem,
  getEdition,
  getItem,
  getPlayingCard,
  type ItemKind,
  sourceLabel,
} from "@/data/game";

/** An edition on a card: which one, and its name and text for the hover card. */
interface EditionInfo extends ReturnType<typeof getEdition> {
  id: EditionId;
}

/** An `edition` prop ("foil", "holo", "polychrome", "negative"); unknown ones throw. */
function resolveEdition(
  id: string | undefined,
  kind: ItemKind | "card",
): EditionInfo | undefined {
  if (!id) return undefined;
  return { id: id as EditionId, ...getEdition(id, kind) };
}

function badge(item: GameItem) {
  const parts: string[] = [item.rarity ?? item.kind];
  if (item.cost !== undefined) parts.push(`$${item.cost}`);
  return parts.join(" · ");
}

/**
 * Pixel-art sprite. At its native size or a whole multiple of it, pixels stay hard-edged;
 * when shrunk (inline icons) it's smoothed, because nearest-neighbour downscaling drops
 * pixels unevenly and looks jagged at any zoom level.
 */
function Sprite({
  item,
  alt,
  scale,
  className,
}: {
  item: Pick<GameItem, "image" | "w" | "h">;
  alt: string;
  /** Whole-number multiple of the native size; omit to size with `className` (smoothed). */
  scale?: number;
  className?: string;
}) {
  const sized = scale !== undefined;
  return (
    // biome-ignore lint/performance/noImgElement: tiny static pixel art, next/image adds nothing here
    <img
      src={item.image}
      alt={alt}
      width={sized ? item.w * scale : undefined}
      height={sized ? item.h * scale : undefined}
      className={className}
      // Inline so the article's image styles can't override it.
      style={{
        imageRendering: sized ? "pixelated" : "auto",
        margin: 0,
        maxWidth: "none",
      }}
      loading="lazy"
    />
  );
}

/** Small sprites (seals, stickers) are shown at 2× in the hover card so they're not tiny. */
const hoverScale = (item: GameItem) => (item.w < 100 ? 2 : 1);

/**
 * A card's sprite with stickers laid over it, the way the game draws them: each sticker is a
 * full-card layer on top. With an edition it's animated with the game's shaders, stickers on top.
 * Sized like the sprite underneath (by `scale` or `className`).
 */
function CardPicture({
  item,
  stickers,
  edition,
  alt,
  scale,
  className,
}: {
  item: GameItem;
  stickers: GameItem[];
  edition?: EditionInfo;
  alt: string;
  scale?: number;
  className?: string;
}) {
  if (edition)
    return (
      <EditionCard
        layers={[item.image]}
        overlays={stickers.flatMap((s) => (s.overlay ? [s.overlay] : []))}
        edition={edition.id}
        alt={alt}
        width={scale === undefined ? undefined : item.w * scale}
        height={scale === undefined ? undefined : item.h * scale}
        className={className}
        pixelated={scale !== undefined}
      />
    );
  if (stickers.length === 0)
    return <Sprite item={item} alt={alt} scale={scale} className={className} />;
  return (
    <span className="relative inline-block self-center">
      <Sprite item={item} alt={alt} scale={scale} className={className} />
      {stickers.map((s) =>
        s.overlay ? (
          <Sprite
            key={s.key}
            item={{ image: s.overlay, w: item.w, h: item.h }}
            alt=""
            scale={scale}
            className={`absolute inset-0 ${scale === undefined ? "h-full w-full" : ""}`}
          />
        ) : null,
      )}
    </span>
  );
}

/** Stickers by name, e.g. "eternal rental" or "eternal, rental"; unknown names throw. */
function resolveStickers(names: string | undefined): GameItem[] {
  return (names ?? "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((name) => getItem("sticker", name));
}

/** The edition badge colour: the game's dark_edition blue. */
const EDITION_COLOUR = COLOURS.dark_edition;

export function HoverCard({
  item,
  stickers = [],
  edition,
}: {
  item: GameItem;
  stickers?: GameItem[];
  edition?: EditionInfo;
}) {
  const colour = colourOf(item);
  const source = sourceLabel(item.source);
  // Extra boxes beside the card, as in the game: the edition first, then each sticker.
  const extras = [
    ...(edition
      ? [
          {
            key: `edition:${edition.id}`,
            name: edition.name,
            text: edition.text,
            colour: EDITION_COLOUR,
          },
        ]
      : []),
    ...stickers.map((s) => ({
      key: s.key,
      name: s.name,
      text: s.text,
      colour: s.colour ?? "#6b7f84",
    })),
  ];
  return (
    <span
      role="tooltip"
      className="pointer-events-none invisible absolute bottom-full left-1/2 z-30 mb-2 flex w-max origin-bottom -translate-x-1/2 flex-col items-center gap-2 text-center opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 sm:flex-row sm:items-end"
      // In a shrunk <CardRow singleRow>, scale back up so the text stays readable.
      style={{ scale: "calc(1 / var(--card-scale, 1))" }}
    >
      <span
        className="flex w-64 flex-col items-center gap-2 rounded-xl border-2 bg-[#3a5055] p-2.5 shadow-xl"
        style={{ borderColor: colour }}
      >
        <CardPicture
          item={item}
          stickers={stickers}
          edition={edition}
          alt=""
          scale={hoverScale(item)}
        />
        {source && (
          <span className="rounded bg-[#ac3232] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {source}
          </span>
        )}
        <span className="text-base font-bold text-white">{item.name}</span>
        <EffectText lines={item.text} />
        {/* Like the game: the card's badge, its edition's, then one per sticker that has one. */}
        <span className="flex flex-wrap justify-center gap-1">
          <span
            className="rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white"
            style={{ background: colour }}
          >
            {badge(item)}
          </span>
          {edition && (
            <span
              className="rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white"
              style={{ background: EDITION_COLOUR }}
            >
              {edition.name}
            </span>
          )}
          {stickers
            .filter((s) => s.colour)
            .map((s) => (
              <span
                key={s.key}
                className="rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white"
                style={{ background: s.colour }}
              >
                {s.name}
              </span>
            ))}
        </span>
      </span>
      {/* What the edition and stickers do, in boxes beside the card's (stacked on phones). */}
      {extras.length > 0 && (
        <span className="flex w-64 flex-col gap-2 sm:w-48">
          {extras.map((x) => (
            <span
              key={x.key}
              className="flex flex-col items-center gap-1 rounded-xl border-2 bg-[#3a5055] p-2 shadow-xl"
              style={{ borderColor: x.colour }}
            >
              <span className="text-sm font-bold text-white">{x.name}</span>
              <EffectText lines={x.text} />
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

interface RefProps {
  /** The card's name ("oops_all_6s", "Oops! All 6s") or game id ("oops"). */
  id: string;
  /** Appends an "s" to the visible name, e.g. "Mimes". */
  plural?: boolean;
  /** Show the full card image instead of an inline name. */
  card?: boolean;
  /** Stickers on the card, as in the game: stickers="eternal rental". */
  stickers?: string;
  /** An edition, animated like in the game: foil, holo, polychrome or negative. */
  edition?: string;
  /** Text to show instead of the item's name, e.g. <Tarot id="hierophant">hiero</Tarot>. */
  children?: ReactNode;
}

function GameRef({
  kind,
  id,
  plural,
  card,
  stickers: stickerNames,
  edition: editionId,
  children,
}: RefProps & { kind: ItemKind }) {
  const item = getItem(kind, id);
  const colour = colourOf(item);
  const stickers = resolveStickers(stickerNames);
  const edition = resolveEdition(editionId, kind);
  const label = [
    item.name,
    ...(edition ? [edition.name] : []),
    ...stickers.map((s) => s.name),
  ].join(", ");

  if (card) {
    return (
      <span className="not-prose group relative inline-flex w-[142px] flex-col items-center gap-1 align-top">
        <button
          type="button"
          className="flex h-[190px] items-center justify-center rounded-lg transition-transform hover:-translate-y-1 focus:-translate-y-1"
        >
          <CardPicture
            item={item}
            stickers={stickers}
            edition={edition}
            alt={label}
            scale={hoverScale(item)}
          />
        </button>
        <span className="text-center text-xs font-semibold leading-tight">
          {children ?? item.name}
        </span>
        <HoverCard item={item} stickers={stickers} edition={edition} />
      </span>
    );
  }

  return (
    <span className="not-prose group relative inline-block align-baseline">
      <button
        type="button"
        className="inline-flex items-baseline gap-1 rounded font-semibold underline decoration-dotted underline-offset-2"
        style={{ color: colour }}
      >
        <CardPicture
          item={item}
          stickers={stickers}
          edition={edition}
          alt=""
          className="inline-block h-[1.4em] w-auto self-center"
        />
        {children ?? (
          <>
            {item.name}
            {plural ? "s" : ""}
          </>
        )}
      </button>
      <HoverCard item={item} stickers={stickers} edition={edition} />
    </span>
  );
}

export const Joker = (props: RefProps) => <GameRef kind="joker" {...props} />;
export const Tarot = (props: RefProps) => <GameRef kind="tarot" {...props} />;
export const Planet = (props: RefProps) => <GameRef kind="planet" {...props} />;
export const Spectral = (props: RefProps) => (
  <GameRef kind="spectral" {...props} />
);
export const Voucher = (props: RefProps) => (
  <GameRef kind="voucher" {...props} />
);
export const Enhancement = (props: RefProps) => (
  <GameRef kind="enhancement" {...props} />
);
export const Seal = (props: RefProps) => <GameRef kind="seal" {...props} />;
export const Deck = (props: RefProps) => <GameRef kind="deck" {...props} />;
export const Stake = (props: RefProps) => <GameRef kind="stake" {...props} />;
export const Tag = (props: RefProps) => <GameRef kind="tag" {...props} />;
export const Booster = (props: RefProps) => (
  <GameRef kind="booster" {...props} />
);
export const Sticker = (props: RefProps) => (
  <GameRef kind="sticker" {...props} />
);

/**
 * A row of cards, e.g. a tier or a joker lineup. Cards wrap onto more lines when there isn't
 * room; with `singleRow` they stay on one line and shrink to fit instead.
 */
export function CardRow({
  title,
  singleRow,
  children,
}: {
  title?: string;
  singleRow?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="not-prose my-4 flex items-start gap-3 rounded-xl border bg-fd-card p-3">
      {title && (
        <span className="flex min-w-10 items-center justify-center self-stretch rounded-lg bg-fd-secondary px-2 text-xl font-bold">
          {title}
        </span>
      )}
      {singleRow ? (
        <FitRow>{children}</FitRow>
      ) : (
        <div className="flex flex-wrap gap-3">{children}</div>
      )}
    </div>
  );
}

/**
 * A playing card drawn the way the game layers it, optionally with an animated edition:
 * <PlayingCard card="KH" enhancement="steel" seal="red" edition="foil" />
 */
export function PlayingCard({
  card,
  enhancement,
  seal,
  edition: editionId,
}: {
  card: string;
  enhancement?: string;
  seal?: string;
  edition?: string;
}) {
  const front = getPlayingCard(card);
  const enh = enhancement ? getItem("enhancement", enhancement) : undefined;
  const sl = seal ? getItem("seal", seal) : undefined;
  const edition = resolveEdition(editionId, "card");
  const label = [
    `${front.value} of ${front.suit}`,
    enh?.name,
    edition?.name,
    sl?.name,
  ]
    .filter(Boolean)
    .join(", ");
  if (edition)
    return (
      <span className="not-prose inline-block align-top">
        <EditionCard
          layers={[
            enh?.image ?? baseCardImage,
            ...(enh?.key === "m_stone" ? [] : [front.image]),
          ]}
          overlays={sl?.overlay ? [sl.overlay] : []}
          edition={edition.id}
          alt={label}
          width={142}
          height={190}
        />
      </span>
    );
  // Every layer is a full 142×190 card cell, stacked at native size so pixels stay crisp.
  const layer = (image: string) => (
    <span className="absolute inset-0">
      <Sprite item={{ image, w: 142, h: 190 }} alt="" scale={1} />
    </span>
  );

  return (
    <span
      className="not-prose relative inline-block h-[190px] w-[142px] align-top"
      role="img"
      aria-label={label}
    >
      {layer(enh?.image ?? baseCardImage)}
      {enh?.key !== "m_stone" && layer(front.image)}
      {sl?.overlay && layer(sl.overlay)}
    </span>
  );
}
