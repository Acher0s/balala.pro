import type { ReactNode } from "react";
import { colourOf, EffectText } from "@/components/effect-text";
import { FitRow } from "@/components/fit-row";
import {
  baseCardImage,
  type GameItem,
  getItem,
  getPlayingCard,
  type ItemKind,
  sourceLabel,
} from "@/data/game";

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

/** Small sprites (seals) are shown at 2× in the hover card so they're not tiny. */
const hoverScale = (item: GameItem) => (item.w < 100 ? 2 : 1);

export function HoverCard({ item }: { item: GameItem }) {
  const colour = colourOf(item);
  const source = sourceLabel(item.source);
  return (
    <span
      role="tooltip"
      className="pointer-events-none invisible absolute bottom-full left-1/2 z-30 mb-2 flex w-64 origin-bottom -translate-x-1/2 flex-col items-center gap-2 rounded-xl border-2 bg-[#3a5055] p-2.5 text-center opacity-0 shadow-xl transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      // In a shrunk <CardRow singleRow>, scale back up so the text stays readable.
      style={{ borderColor: colour, scale: "calc(1 / var(--card-scale, 1))" }}
    >
      <Sprite item={item} alt="" scale={hoverScale(item)} />
      {source && (
        <span className="rounded bg-[#ac3232] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          {source}
        </span>
      )}
      <span className="text-base font-bold text-white">{item.name}</span>
      <EffectText lines={item.text} />
      <span
        className="rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white"
        style={{ background: colour }}
      >
        {badge(item)}
      </span>
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
  /** Text to show instead of the item's name, e.g. <Tarot id="hierophant">hiero</Tarot>. */
  children?: ReactNode;
}

function GameRef({
  kind,
  id,
  plural,
  card,
  children,
}: RefProps & { kind: ItemKind }) {
  const item = getItem(kind, id);
  const colour = colourOf(item);

  if (card) {
    return (
      <span className="not-prose group relative inline-flex w-[142px] flex-col items-center gap-1 align-top">
        <button
          type="button"
          className="flex h-[190px] items-center justify-center rounded-lg transition-transform hover:-translate-y-1 focus:-translate-y-1"
        >
          <Sprite item={item} alt={item.name} scale={hoverScale(item)} />
        </button>
        <span className="text-center text-xs font-semibold leading-tight">
          {children ?? item.name}
        </span>
        <HoverCard item={item} />
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
        <Sprite
          item={item}
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
      <HoverCard item={item} />
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
 * A playing card drawn the way the game layers it:
 * <PlayingCard card="KH" enhancement="steel" seal="red" />
 */
export function PlayingCard({
  card,
  enhancement,
  seal,
}: {
  card: string;
  enhancement?: string;
  seal?: string;
}) {
  const front = getPlayingCard(card);
  const enh = enhancement ? getItem("enhancement", enhancement) : undefined;
  const sl = seal ? getItem("seal", seal) : undefined;
  const label = [`${front.value} of ${front.suit}`, enh?.name, sl?.name]
    .filter(Boolean)
    .join(", ");
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
