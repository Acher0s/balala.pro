"use client";

import { useEffect, useRef, useState } from "react";
import {
  FALLING_KINDS,
  type FallingKind,
  type FallingPool,
  type FallingSettings,
} from "@/lib/falling";

/** One falling card: its picture plus random factors; the settings turn these into motion. */
interface Falling {
  layers: string[];
  x: number;
  y: number;
  rotation: number;
  /** Multipliers around 1 (speed, size) and a signed spin factor. */
  speed: number;
  size: number;
  spin: number;
  /** 0.45 (far) to 1 (near) with depth on; always 1 without. */
  z: number;
  swayPhase: number;
  swayRate: number;
}

const BASE_WIDTH = 1280;
/** At most this many different pictures per visit: few downloads, reused over and over. */
const MAX_PICTURES = 24;
/** Canvas resolution cap: high-DPI screens don't need more for faded background cards. */
const MAX_DPR = 1.5;
const images = new Map<string, HTMLImageElement>();

/** Images load on first use and are shared by every card with the same picture. */
function image(src: string) {
  let img = images.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    images.set(src, img);
  }
  return img;
}

const vary = (variation: number) => 1 + (Math.random() * 2 - 1) * variation;

function pickCard(pool: FallingPool, settings: FallingSettings) {
  const choices = FALLING_KINDS.map((kind) => ({
    kind,
    cards: pool[kind].filter((c) => settings.modCards || !c.mod),
    weight: settings.weights[kind],
  })).filter((c) => c.weight > 0 && c.cards.length > 0);
  const total = choices.reduce((sum, c) => sum + c.weight, 0);
  if (!total) return null;
  let roll = Math.random() * total;
  let pick = choices[0];
  for (const c of choices) {
    roll -= c.weight;
    if (roll <= 0) {
      pick = c;
      break;
    }
  }
  return pick.cards[Math.floor(Math.random() * pick.cards.length)];
}

/** Weak devices start with fewer cards; data saver turns the effect off. */
function deviceBudget() {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return 0;
  return (nav.hardwareConcurrency ?? 4) <= 2 ? 0.5 : 1;
}

/**
 * Cards from the game falling and spinning behind the page, drawn on a canvas that fills its
 * parent. Settings apply live, so the Studio preview reacts while sliders move.
 *
 * Kept light for weak devices: it starts only once the browser is idle, uses at most
 * MAX_PICTURES different images, caps the canvas resolution, and shows fewer cards when frames
 * get slow. Nothing is shown with reduced motion or data saver.
 */
export function FallingCards({
  settings,
  pool,
  className = "",
}: {
  settings: FallingSettings;
  pool: FallingPool;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || reducedMotion) return;

    let budget = deviceBudget();
    if (budget === 0) return;
    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const cards: Falling[] = [];
    // The pictures in use this visit, picked by the weights; rebuilt when the mix changes.
    let pictures: ReturnType<typeof pickCard>[] = [];
    let mix = "";
    const nextPicture = (s: FallingSettings) => {
      const key = JSON.stringify([s.weights, s.modCards]);
      if (key !== mix) {
        mix = key;
        pictures = [];
      }
      if (pictures.length < MAX_PICTURES) {
        const card = pickCard(pool, s);
        if (card) pictures.push(card);
        return card;
      }
      return pictures[Math.floor(Math.random() * pictures.length)];
    };
    const spawn = (anywhere: boolean) => {
      const s = settingsRef.current;
      const card = nextPicture(s);
      if (!card) return;
      const z = s.depth ? 0.45 + Math.random() * 0.55 : 1;
      const falling: Falling = {
        layers: card.layers,
        x: Math.random() * width,
        // At the start the screen is filled; later cards come in from above.
        y: anywhere ? Math.random() * height : -s.size * 1.5,
        rotation: Math.random() * 360,
        speed: Math.max(0.1, vary(s.speedVariation)),
        size: Math.max(0.2, vary(s.sizeVariation)),
        spin:
          (Math.random() < 0.5 ? -1 : 1) * Math.max(0, vary(s.spinVariation)),
        z,
        swayPhase: Math.random() * Math.PI * 2,
        swayRate: 0.4 + Math.random() * 0.8,
      };
      // Far cards are drawn first, so near ones overlap them.
      const at = cards.findIndex((c) => c.z > z);
      cards.splice(at === -1 ? cards.length : at, 0, falling);
      for (const src of card.layers) image(src);
    };

    const wanted = () =>
      Math.max(
        1,
        Math.round((settingsRef.current.count * width * budget) / BASE_WIDTH),
      );

    let started = false;
    let last = performance.now();
    let frame = 0;
    // Slow frames (under ~30 per second, averaged) mean fewer cards, down to a quarter.
    let slowTime = 0;
    let measured = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const elapsed = (now - last) / 1000;
      const dt = Math.min(0.1, elapsed);
      last = now;
      const s = settingsRef.current;
      if (!width || !height) return;
      if (elapsed < 0.5) {
        measured++;
        if (elapsed > 1 / 30) slowTime++;
        if (measured >= 90) {
          if (slowTime > 45 && budget > 0.25)
            budget = Math.max(0.25, budget * 0.7);
          measured = 0;
          slowTime = 0;
        }
      }
      if (!started) {
        for (let i = 0; i < wanted(); i++) spawn(true);
        started = true;
      }

      ctx.clearRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = false;
      for (let i = cards.length - 1; i >= 0; i--) {
        const c = cards[i];
        const w = s.size * c.size * c.z;
        c.y += s.speed * c.speed * c.z * dt;
        c.rotation += s.spin * c.spin * dt;
        c.swayPhase += c.swayRate * dt;
        if (c.y - w * 2 > height) cards.splice(i, 1);
      }
      for (let i = cards.length; i < wanted(); i++) spawn(false);

      for (const c of cards) {
        const first = image(c.layers[0]);
        if (!first.complete || !first.naturalWidth) continue;
        const w = s.size * c.size * c.z;
        const h = (w * first.naturalHeight) / first.naturalWidth;
        ctx.save();
        ctx.globalAlpha = s.opacity * (s.depth ? 0.35 + 0.65 * c.z : 1);
        ctx.translate(c.x + Math.sin(c.swayPhase) * s.sway, c.y);
        ctx.rotate((c.rotation * Math.PI) / 180);
        for (const src of c.layers) {
          const img = image(src);
          if (img.complete && img.naturalWidth)
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
        }
        ctx.restore();
      }
    };
    // Start once the browser is idle, so loading and navigating come first.
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(
          () => {
            last = performance.now();
            frame = requestAnimationFrame(tick);
          },
          { timeout: 2000 },
        )
      : window.setTimeout(() => {
          last = performance.now();
          frame = requestAnimationFrame(tick);
        }, 300);
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [pool, reducedMotion]);

  if (reducedMotion) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none h-full w-full ${className}`}
    />
  );
}

export type { FallingKind };
