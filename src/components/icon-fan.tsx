import type { CSSProperties } from "react";
import type { GameItem } from "@/data/game-types";

/**
 * Per number of cards, from the main card (front) to the last (back): rotation at rest and on
 * hover, and how far right each card sits. The extra cards fan out to the right, behind the main
 * card and off the tile's edge, so they never cover the text.
 */
const FANS: { rest: number; hover: number; x: number }[][] = [
  [],
  [{ rest: -12, hover: -8, x: 0 }],
  [
    { rest: -10, hover: -12, x: 0 },
    { rest: 8, hover: 14, x: 26 },
  ],
  [
    { rest: -12, hover: -14, x: 0 },
    { rest: 2, hover: 6, x: 22 },
    { rest: 16, hover: 26, x: 42 },
  ],
];

/** Where the main card sits: further in when more cards fan out to its right. */
const ANCHOR = ["", "-right-6", "right-2", "right-8"];

/** Room to keep free for the cards beside the description, per number of cards. */
export const ICON_PADDING = ["", "pr-16", "pr-28", "pr-36"];

/**
 * A page's icon cards in the corner of its tile: large and faded, brightening on hover. With 2 or 3
 * cards they fan out, the first (main) card in front. The tile needs the `group` class.
 */
export function IconFan({ items }: { items: GameItem[] }) {
  const fan = FANS[items.length];
  if (!fan?.length) return null;
  return (
    // Faded as a whole, so overlapping cards don't show through each other.
    <span
      className={`absolute -bottom-10 h-40 w-[120px] opacity-25 transition-opacity group-hover:opacity-50 ${ANCHOR[items.length]}`}
    >
      {/* Back to front, so the main card is drawn last, on top. */}
      {items
        .map((item, i) => ({ item, pose: fan[i] }))
        .reverse()
        .map(({ item, pose }) => (
          // biome-ignore lint/performance/noImgElement: pixel art sprite, shown as is
          <img
            key={item.key}
            src={item.image}
            alt=""
            width={120}
            height={160}
            style={
              {
                imageRendering: "pixelated",
                "--x": `${pose.x}px`,
                "--rest": `${pose.rest}deg`,
                "--hover": `${pose.hover}deg`,
              } as CSSProperties
            }
            className="absolute inset-0 h-full w-full origin-bottom object-contain transition-transform duration-300 [transform:translateX(var(--x))_rotate(var(--rest))] group-hover:[transform:translateX(var(--x))_rotate(var(--hover))]"
          />
        ))}
    </span>
  );
}
