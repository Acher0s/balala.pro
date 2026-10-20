"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

/** Messages between the editor and its preview iframe (same origin only). */
export const SCROLL_MESSAGE = "bmpu-scroll";
export const READY_MESSAGE = "bmpu-preview-ready";
export const REFRESH_MESSAGE = "bmpu-refresh";

/** Space left above the target so it isn't hidden under the sticky header. */
const TOP_GAP = 80;

/** Asks the editor (the parent window) where it is scrolled to. */
function askForPosition() {
  window.parent?.postMessage({ type: READY_MESSAGE }, window.location.origin);
}

/**
 * Runs inside the preview:
 * - scrolls to the block the editor is showing. Blocks carry data-line (their line in the
 *   source); between two blocks the position is interpolated, so long paragraphs scroll smoothly.
 * - re-renders the draft in place when the editor saves, instead of reloading the whole page,
 *   so images, scripts and calculator inputs stay loaded.
 */
export function PreviewScrollSync() {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const wasRefreshing = useRef(false);

  // After a refresh lands, the content may have moved: line up with the editor again.
  useEffect(() => {
    if (wasRefreshing.current && !refreshing) askForPosition();
    wasRefreshing.current = refreshing;
  }, [refreshing]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: set up once; router is stable
  useEffect(() => {
    const scrollToLine = (line: number) => {
      const blocks = [...document.querySelectorAll<HTMLElement>("[data-line]")]
        .filter((el) => el.offsetParent !== null)
        .map((el) => ({
          line: Number(el.dataset.line),
          top: el.getBoundingClientRect().top + window.scrollY,
        }))
        .sort((a, b) => a.line - b.line || a.top - b.top);
      if (blocks.length === 0) return;

      let y: number;
      const after = blocks.findIndex((b) => b.line > line);
      if (after === 0) {
        // Above the first block (frontmatter, title): top of the page.
        y = 0;
      } else {
        const a = blocks[(after === -1 ? blocks.length : after) - 1];
        const b = after === -1 ? null : blocks[after];
        const fraction =
          b && b.line > a.line ? (line - a.line) / (b.line - a.line) : 0;
        y = a.top + (b ? Math.max(0, b.top - a.top) * fraction : 0) - TOP_GAP;
      }
      window.scrollTo({ top: Math.max(0, y), behavior: "instant" });
    };

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; line?: number };
      if (data?.type === SCROLL_MESSAGE && typeof data.line === "number")
        scrollToLine(data.line);
      if (data?.type === REFRESH_MESSAGE) startRefresh(() => router.refresh());
    };
    window.addEventListener("message", onMessage);
    askForPosition();
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return null;
}
