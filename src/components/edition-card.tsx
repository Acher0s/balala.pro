"use client";

import { useEffect, useRef, useState } from "react";
import { EditionShaders } from "@/components/edition-shaders";
import type { EditionId } from "@/data/game-types";

/**
 * Cards with an edition, drawn with the game's own shaders like the falling cards: Foil,
 * Holographic and Polychrome shine over the card, Negative inverts it and adds its own shine.
 * Every edition card on the page shares one WebGL context and one animation loop, which only
 * draws cards that are on screen, at 30 frames per second. The shine follows the mouse over a
 * card like hovering it in the game, and otherwise wobbles on its own (the game's ambient tilt).
 * With reduced motion a card gets one still frame.
 */

interface Entry {
  canvas: HTMLCanvasElement;
  layers: string[];
  overlays: string[];
  edition: EditionId;
  /** The layers stacked once they've loaded: what the shader works on. */
  base?: HTMLCanvasElement;
  visible: boolean;
  /** Where the mouse is on the card, 0–1 each way, while it's over it. */
  hover: { x: number; y: number } | null;
  phase: number;
  tiltRate: number;
  onDrawn: () => void;
}

const entries = new Set<Entry>();
const images = new Map<string, HTMLImageElement>();
let shaders: EditionShaders | null | undefined;
let frame = 0;
let lastDraw = 0;

function image(src: string) {
  let img = images.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    images.set(src, img);
  }
  return img;
}
const loaded = (img: HTMLImageElement) => img.complete && img.naturalWidth > 0;

const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The card's layers stacked into one canvas the size of the first; undefined until loaded. */
function base(e: Entry) {
  if (e.base) return e.base;
  const layers = e.layers.map(image);
  if (!layers.every(loaded)) return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = layers[0].naturalWidth;
  canvas.height = layers[0].naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.imageSmoothingEnabled = false;
  for (const img of layers)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  e.base = canvas;
  return canvas;
}

/** The game's tilt_var.amt (card.lua): by where the mouse is on a hovered card, else ambient. */
function tilt(e: Entry, time: number) {
  if (e.hover) return Math.abs(e.hover.x + e.hover.y - 1) * 0.3;
  return 0.2 * (0.5 + Math.cos(time * e.tiltRate + e.phase)) * 0.3;
}

/** Draws one frame of a card; false if its images or shader aren't ready yet. */
function draw(e: Entry, now: number) {
  shaders ??= EditionShaders.create();
  const gl = shaders;
  const card = base(e);
  const overlays = e.overlays.map(image);
  if (!gl || !card || !overlays.every(loaded)) return false;
  const time = now / 1000;
  // Like the game's send_to_shader: real time / 28, plus the tilt.
  const shine = time / 28 + e.phase + tilt(e, time);
  const pass = (name: Parameters<EditionShaders["render"]>[0]) =>
    gl.render(name, card, shine, time);
  const ctx = e.canvas.getContext("2d");
  if (!ctx) return false;
  const first = e.edition === "negative" ? pass("negative") : pass(e.edition);
  if (!first) return false;
  const { width: w, height: h } = card;
  if (e.canvas.width !== w || e.canvas.height !== h) {
    e.canvas.width = w;
    e.canvas.height = h;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  if (e.edition === "negative") {
    ctx.drawImage(first, 0, 0);
    const glow = pass("negative_shine");
    if (glow) ctx.drawImage(glow, 0, 0);
  } else {
    ctx.drawImage(card, 0, 0);
    ctx.drawImage(first, 0, 0);
  }
  // Seals and stickers go on top of the edition, as in the game.
  for (const img of overlays) ctx.drawImage(img, 0, 0, w, h);
  e.onDrawn();
  return true;
}

function tick(now: number) {
  frame = 0;
  const visible = [...entries].filter((e) => e.visible);
  if (visible.length === 0) return;
  if (now - lastDraw >= 1000 / 30) {
    lastDraw = now;
    // On screen but hidden (a hover card that isn't open) is skipped until it shows.
    for (const e of visible)
      if (e.canvas.checkVisibility?.({ visibilityProperty: true }) ?? true)
        draw(e, now);
  }
  frame = requestAnimationFrame(tick);
}

function wake() {
  if (!frame && !reducedMotion()) frame = requestAnimationFrame(tick);
}

/** One card with an edition. Until its first frame is drawn it shows the plain card. */
export function EditionCard({
  layers,
  overlays = [],
  edition,
  alt,
  width,
  height,
  className = "",
  pixelated = true,
}: {
  /** Image layers stacked bottom to top: the card itself. */
  layers: string[];
  /** Drawn over the edition: a seal or stickers. */
  overlays?: string[];
  edition: EditionId;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  /** Hard pixel edges (whole-number sizes); smooth when shown small. */
  pixelated?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  const key = JSON.stringify([layers, overlays, edition]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const [layerList, overlayList] = JSON.parse(key) as [string[], string[]];
    const entry: Entry = {
      canvas,
      layers: layerList,
      overlays: overlayList,
      edition,
      visible: false,
      hover: null,
      phase: Math.random() * 10,
      tiltRate: 1.56 + Math.random(),
      onDrawn: () => setDrawn(true),
    };
    entries.add(entry);
    const observer = new IntersectionObserver(([seen]) => {
      entry.visible = seen.isIntersecting;
      if (!entry.visible) return;
      if (reducedMotion()) {
        // One still frame, once the images are in.
        const still = () => {
          if (!draw(entry, 0) && entries.has(entry)) setTimeout(still, 200);
        };
        still();
      } else wake();
    });
    observer.observe(canvas);
    const onMove = (ev: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      entry.hover = {
        x: (ev.clientX - r.left) / r.width,
        y: (ev.clientY - r.top) / r.height,
      };
      if (reducedMotion()) draw(entry, performance.now());
    };
    const onLeave = () => {
      entry.hover = null;
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    return () => {
      entries.delete(entry);
      observer.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [key, edition]);

  const look = {
    imageRendering: pixelated ? ("pixelated" as const) : ("auto" as const),
    margin: 0,
    maxWidth: "none",
  };
  const [bottom, ...rest] = [...layers, ...overlays];
  return (
    <span className="relative inline-block self-center align-top">
      {/* The bottom layer sizes the card (by width/height or className); with the other layers
          it's the plain card until the edition's first frame is ready (or without WebGL). */}
      {/* biome-ignore lint/performance/noImgElement: tiny pixel-art layers */}
      <img
        src={bottom}
        alt=""
        width={width}
        height={height}
        className={className}
        style={{ ...look, opacity: drawn ? 0 : 1 }}
      />
      {!drawn &&
        rest.map((src) => (
          // biome-ignore lint/performance/noImgElement: tiny pixel-art layers
          <img
            key={src}
            src={src}
            alt=""
            className="absolute inset-0 h-full w-full"
            style={look}
          />
        ))}
      <canvas
        ref={ref}
        role="img"
        aria-label={alt}
        className="absolute inset-0 h-full w-full"
        style={{ ...look, opacity: drawn ? 1 : 0 }}
      />
    </span>
  );
}
