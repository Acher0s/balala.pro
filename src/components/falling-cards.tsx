"use client";

import { useEffect, useRef, useState } from "react";
import { EditionShaders } from "@/components/edition-shaders";
import {
  type Edition,
  FALLING_KINDS,
  type FallingChances,
  type FallingEntry,
  type FallingKind,
  type FallingPool,
  type FallingSettings,
  rollEdition,
  rollStandardCard,
} from "@/lib/falling";

/**
 * A card as it falls: its layers (with any enhancement), seal and edition. `canvas` is all of it
 * drawn once (editions as a still sheen); `base` is the card without seal or edition, for the
 * animated edition shaders. Both are made when the images have loaded and reused by every card.
 */
interface Picture {
  layers: string[];
  seal: string | null;
  edition: Edition | null;
  canvas?: HTMLCanvasElement;
  base?: HTMLCanvasElement;
}

/** One falling card: its picture plus random factors; the settings turn these into motion. */
interface Falling {
  picture: Picture;
  x: number;
  y: number;
  rotation: number;
  /** Multipliers around 1 (speed, size) and a signed spin factor. */
  speed: number;
  size: number;
  spin: number;
  /** 0.45 (far) to 1 (near) with depth on; always 1 without. */
  z: number;
  /** size × z: how big the card is drawn, and so how close it is. Bigger cards are in front. */
  scale: number;
  swayPhase: number;
  swayRate: number;
  /** Offsets this card's edition shine and ambient tilt from others with the same picture. */
  shinePhase: number;
  tiltRate: number;
}

const BASE_WIDTH = 1280;
/** At most this many different pictures per visit: few downloads, reused over and over. */
const MAX_PICTURES = 24;
/** Canvas resolution cap: high-DPI screens don't need more for background cards. */
const MAX_DPR = 1.5;
/** With depth fade, the furthest cards are drawn at this opacity. */
const FARTHEST = 0.3;
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

const loaded = (img: HTMLImageElement) => img.complete && img.naturalWidth > 0;

/** Static stand-ins for the game's animated edition shaders, painted over the card's pixels. */
const SHEENS: Record<Exclude<Edition, "negative">, [number, string[]]> = {
  foil: [0.35, ["#6f8fff", "#e6f0ff", "#5a7cff", "#e6f0ff", "#6f8fff"]],
  holo: [0.3, ["#ff3d6e", "#ffb3d1", "#d946ef", "#ffb3d1", "#ff3d6e"]],
  polychrome: [
    0.4,
    ["#ff4d4d", "#ffd84d", "#4dff88", "#4dd2ff", "#a64dff", "#ff4dd2"],
  ],
};

/** Stacks images into a new canvas the size of the first; undefined until all have loaded. */
function stack(sources: string[]) {
  const layers = sources.map(image);
  if (!layers.every(loaded)) return undefined;
  const w = layers[0].naturalWidth;
  const h = layers[0].naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.imageSmoothingEnabled = false;
  for (const img of layers) ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

/** The card without seal or edition, for the edition shaders. */
function renderBase(picture: Picture) {
  picture.base ??= stack(picture.layers);
  return picture.base;
}

/** Draws a picture's layers, seal and a still edition into one image, once all have loaded. */
function render(picture: Picture) {
  if (picture.canvas) return picture.canvas;
  const canvas = stack([
    ...picture.layers,
    ...(picture.seal ? [picture.seal] : []),
  ]);
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return undefined;
  const { width: w, height: h } = canvas;
  if (picture.edition === "negative") {
    const data = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < data.data.length; i += 4) {
      data.data[i] = 255 - data.data[i];
      data.data[i + 1] = 255 - data.data[i + 1];
      data.data[i + 2] = 255 - data.data[i + 2];
    }
    ctx.putImageData(data, 0, 0);
  } else if (picture.edition) {
    const [alpha, colours] = SHEENS[picture.edition];
    const sheen = ctx.createLinearGradient(0, 0, w, h);
    colours.forEach((c, i) => {
      sheen.addColorStop(i / (colours.length - 1), c);
    });
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = alpha;
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);
  }
  picture.canvas = canvas;
  return canvas;
}

const vary = (variation: number) => 1 + (Math.random() * 2 - 1) * variation;
const pickFrom = <T,>(list: T[], roll = Math.random()) =>
  list[Math.floor(roll * list.length)];

/** A random item by weight; null if nothing has any. */
function weighted<T>(list: { item: T; weight: number }[]) {
  const total = list.reduce((sum, c) => sum + c.weight, 0);
  if (!total) return null;
  let left = Math.random() * total;
  for (const c of list) {
    left -= c.weight;
    if (left < 0 && c.weight > 0) return c.item;
  }
  return list.findLast((c) => c.weight > 0)?.item ?? null;
}

/**
 * How likely each card of a kind is, by the chance tables: jokers by rarity (a rarity's chance
 * shared by its jokers, as the game picks a rarity first), playing cards by rank and suit.
 */
function cardWeights(
  kind: FallingKind,
  cards: FallingEntry[],
  chances: FallingChances,
) {
  if (kind === "joker") {
    const perRarity = new Map<string, number>();
    for (const c of cards)
      perRarity.set(
        c.rarity ?? "common",
        (perRarity.get(c.rarity ?? "common") ?? 0) + 1,
      );
    return cards.map((c) => {
      const rarity = c.rarity ?? "common";
      return {
        item: c,
        weight: chances.jokerRarity[rarity] / (perRarity.get(rarity) ?? 1),
      };
    });
  }
  if (kind === "card")
    return cards.map((c) => ({
      item: c,
      weight:
        (c.rank ? chances.ranks[c.rank] : 1) *
        (c.suit ? chances.suits[c.suit] : 1),
    }));
  return cards.map((c) => ({ item: c, weight: 1 }));
}

/** A copy of a weight table with blacklisted ids left out (weight 0). */
const without = <K extends string>(
  weights: Record<K, number>,
  prefix: string,
  blocked: Set<string>,
) =>
  Object.fromEntries(
    Object.entries<number>(weights).map(([id, w]) => [
      id,
      blocked.has(`${prefix}:${id}`) ? 0 : w,
    ]),
  ) as Record<K, number>;

/**
 * Turns a card into a picture the way the game makes it: playing cards as from a Standard pack
 * (enhancement, seal, edition), jokers with a shop edition if that's on.
 */
function makePicture(
  kind: FallingKind,
  layers: string[],
  pool: FallingPool,
  s: FallingSettings,
  blocked: Set<string>,
): Picture {
  const { chances } = s;
  if (kind === "card") {
    const roll = rollStandardCard(Math.random, {
      ...chances,
      enhancements: {
        ...chances.enhancements,
        weights: without(chances.enhancements.weights, "enhancement", blocked),
      },
      seals: {
        ...chances.seals,
        weights: without(chances.seals.weights, "seal", blocked),
      },
    });
    const enhancement = pool.enhancements.find(
      (e) => e.id === roll.enhancement,
    );
    const seal = pool.seals.find((e) => e.id === roll.seal);
    return {
      layers: [
        enhancement?.image ?? pool.baseCard,
        // Stone cards have no rank or suit.
        ...(enhancement?.stone ? [] : layers),
      ],
      seal: seal?.image ?? null,
      edition: roll.edition,
    };
  }
  if (kind === "joker" && s.jokerEditions)
    return {
      layers,
      seal: null,
      edition: rollEdition(Math.random(), chances.jokerEdition),
    };
  return { layers, seal: null, edition: null };
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
 * Cards are drawn solid, smaller (further) ones first, so they block each other like real cards
 * (see-through parts like Glass excepted); the opacity setting fades the whole background.
 * Edition shine follows the mouse over a card like in the game, and otherwise wobbles on its own
 * like the game's cards that aren't hovered, which is all a stream overlay (`interactive` off) has.
 *
 * Kept light for weak devices: it starts only once the browser is idle, uses at most
 * MAX_PICTURES different pictures (each drawn once, editions included), caps the canvas
 * resolution, and shows fewer cards when frames get slow. Nothing is shown with reduced motion or
 * data saver. Overlays (`freshPictures`) swap pictures now and then, as they run for hours.
 */
export function FallingCards({
  settings,
  pool,
  className = "",
  interactive = true,
  freshPictures = false,
  ignoreReducedMotion = false,
}: {
  settings: FallingSettings;
  pool: FallingPool;
  className?: string;
  /** Edition shine reacts to the mouse. */
  interactive?: boolean;
  /** Replace pictures over time instead of keeping the first MAX_PICTURES. */
  freshPictures?: boolean;
  /** For overlays: the stream should show the effect whatever the streamer's OS prefers. */
  ignoreReducedMotion?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (ignoreReducedMotion) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [ignoreReducedMotion]);

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
      // Resizing clears the canvas, so only do it when the size really changed.
      if (
        canvas.clientWidth === width &&
        canvas.clientHeight === height &&
        canvas.width === Math.round(width * dpr)
      )
        return;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    // The mouse, in canvas pixels; null when it's off the page or there's none (touch, overlays).
    let pointer: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const rect = canvas.getBoundingClientRect();
      pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onLeave = () => {
      pointer = null;
    };
    if (interactive) {
      window.addEventListener("pointermove", onMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);
    }

    let cards: Falling[] = [];
    // The pictures in use; rebuilt when the mix, chances, blacklist or editions change.
    let pictures: Picture[] = [];
    let mix = "";
    let blocked = new Set<string>();
    let choices: {
      item: {
        kind: FallingKind;
        cards: { item: FallingEntry; weight: number }[];
      };
      weight: number;
    }[] = [];
    const pickCard = () => {
      const kind = weighted(choices);
      const card = kind && weighted(kind.cards);
      return kind && card ? { kind: kind.kind, card } : null;
    };
    const nextPicture = (s: FallingSettings) => {
      const key = JSON.stringify([
        s.weights,
        s.modCards,
        s.jokerEditions,
        s.blacklist,
        s.chances,
      ]);
      if (key !== mix) {
        mix = key;
        pictures = [];
        blocked = new Set(s.blacklist);
        // Blacklisted cards disappear at once instead of finishing their fall.
        cards = cards.filter(
          (c) =>
            c.picture.layers.every((l) => !blockedLayer(l)) &&
            !(c.picture.seal && blockedLayer(c.picture.seal)),
        );
        choices = FALLING_KINDS.map((kind) => {
          const list = pool.kinds[kind].filter(
            (c) => (s.modCards || !c.mod) && !blocked.has(c.ref),
          );
          const weights = cardWeights(kind, list, s.chances);
          const any = weights.some((w) => w.weight > 0);
          return {
            item: { kind, cards: weights },
            weight: any ? s.weights[kind] : 0,
          };
        });
      }
      // Overlays swap one picture in eight spawns, so a long stream keeps seeing new cards.
      const swap =
        freshPictures &&
        pictures.length >= MAX_PICTURES &&
        Math.random() < 1 / 8;
      if (pictures.length < MAX_PICTURES || swap) {
        const pick = pickCard();
        if (!pick) return null;
        const picture = makePicture(
          pick.kind,
          pick.card.layers,
          pool,
          s,
          blocked,
        );
        if (swap)
          pictures[Math.floor(Math.random() * pictures.length)] = picture;
        else pictures.push(picture);
        return picture;
      }
      return pickFrom(pictures);
    };
    // Which image belongs to a blacklisted card, enhancement or seal.
    const refByImage = new Map<string, string>();
    for (const kind of FALLING_KINDS)
      for (const c of pool.kinds[kind])
        refByImage.set(c.layers[c.layers.length - 1], c.ref);
    for (const e of pool.enhancements) refByImage.set(e.image, e.ref);
    for (const e of pool.seals) refByImage.set(e.image, e.ref);
    const blockedLayer = (src: string) => {
      const ref = refByImage.get(src);
      return ref !== undefined && blocked.has(ref);
    };

    const spawn = (spreadOut: boolean) => {
      const s = settingsRef.current;
      const picture = nextPicture(s);
      if (!picture) return;
      const z = s.depth ? 0.45 + Math.random() * 0.55 : 1;
      const size = Math.max(0.2, vary(s.sizeVariation));
      const falling: Falling = {
        picture,
        x: Math.random() * width,
        // Every card comes in from above. The first ones are spread out just above the screen,
        // the nearest already peeking in, so they arrive one after another right away.
        y: spreadOut
          ? -s.size * 0.6 - Math.random() * height * 0.6
          : -s.size * 1.5,
        rotation: Math.random() * 360,
        speed: Math.max(0.1, vary(s.speedVariation)),
        size,
        spin:
          (Math.random() < 0.5 ? -1 : 1) * Math.max(0, vary(s.spinVariation)),
        z,
        scale: size * z,
        swayPhase: Math.random() * Math.PI * 2,
        swayRate: 0.4 + Math.random() * 0.8,
        shinePhase: Math.random() * 10,
        tiltRate: 1.56 + Math.random(),
      };
      // Smaller cards are further away: drawn first, so bigger ones cover them.
      const at = cards.findIndex((c) => c.scale > falling.scale);
      cards.splice(at === -1 ? cards.length : at, 0, falling);
      for (const src of picture.layers) image(src);
      if (picture.seal) image(picture.seal);
    };

    // The game's animated edition shaders, set up the first time an edition card shows. Weak
    // devices (a reduced budget) and browsers without WebGL keep the still sheen.
    let shaders: EditionShaders | null | undefined;
    const editionShaders = () => {
      if (shaders === undefined)
        shaders = budget >= 1 ? EditionShaders.create() : null;
      return shaders;
    };

    /**
     * How far the edition shine is shifted, like the game's tilt_var.amt (card.lua): with the
     * mouse over the card, by where it is on the card; otherwise a slow wobble of its own, as
     * the game does for cards that aren't hovered (ambient_tilt).
     */
    const tilt = (
      c: Falling,
      cx: number,
      cy: number,
      w: number,
      h: number,
      time: number,
    ) => {
      if (pointer) {
        const angle = (-c.rotation * Math.PI) / 180;
        const dx = pointer.x - cx;
        const dy = pointer.y - cy;
        const lx = dx * Math.cos(angle) - dy * Math.sin(angle);
        const ly = dx * Math.sin(angle) + dy * Math.cos(angle);
        if (Math.abs(lx) < w / 2 && Math.abs(ly) < h / 2)
          return Math.abs(lx / w + 0.5 + ly / h + 0.5 - 1) * 0.3;
      }
      const angle = time * c.tiltRate + c.shinePhase;
      return 0.2 * (0.5 + Math.cos(angle)) * 0.3;
    };

    /**
     * Draws a card with its edition animated like in the game: Foil, Holographic and
     * Polychrome shine over the card; Negative replaces it and adds its own shine. The seal
     * goes on top. False if the shaders can't run (yet), so the still version is drawn.
     */
    const drawAnimated = (
      c: Falling,
      edition: Edition,
      w: number,
      h: number,
      shine: number,
      time: number,
    ) => {
      const gl = editionShaders();
      const base = gl && renderBase(c.picture);
      if (!gl || !base) return false;
      const draw = (source: CanvasImageSource) =>
        ctx.drawImage(source, -w / 2, -h / 2, w, h);
      if (edition === "negative") {
        const inverted = gl.render("negative", base, shine, time);
        if (!inverted) return false;
        draw(inverted);
        const glow = gl.render("negative_shine", base, shine, time);
        if (glow) draw(glow);
      } else {
        const sheen = gl.render(edition, base, shine, time);
        if (!sheen) return false;
        draw(base);
        draw(sheen);
      }
      if (c.picture.seal) draw(image(c.picture.seal));
      return true;
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
      // The whole background fades as one, so overlapping cards never show through each other.
      const opacity = String(s.opacity);
      if (canvas.style.opacity !== opacity) canvas.style.opacity = opacity;

      ctx.clearRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = false;
      for (let i = cards.length - 1; i >= 0; i--) {
        const c = cards[i];
        const w = s.size * c.scale;
        // With depth, closer (bigger) cards fall faster.
        c.y += s.speed * c.speed * (s.depth ? c.scale : 1) * dt;
        c.rotation += s.spin * c.spin * dt;
        c.swayPhase += c.swayRate * dt;
        if (c.y - w * 2 > height) cards.splice(i, 1);
      }
      for (let i = cards.length; i < wanted(); i++) spawn(false);

      const time = now / 1000;
      const nearest = 1 + s.sizeVariation;
      for (const c of cards) {
        const picture = render(c.picture);
        if (!picture) continue;
        const w = s.size * c.scale;
        const h = (w * picture.height) / picture.width;
        const x = c.x + Math.sin(c.swayPhase) * s.sway;
        ctx.save();
        ctx.translate(x, c.y);
        ctx.rotate((c.rotation * Math.PI) / 180);
        const fade =
          s.depth && s.depthFade
            ? FARTHEST + (1 - FARTHEST) * Math.min(1, c.scale / nearest)
            : 1;
        if (fade < 1) {
          // A faded card still hides what's behind it: clear its shape, then draw it fainter.
          ctx.globalCompositeOperation = "destination-out";
          ctx.drawImage(picture, -w / 2, -h / 2, w, h);
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = fade;
        }
        const edition = c.picture.edition;
        // Like the game's send_to_shader: real time / 28, plus the tilt.
        const shine =
          edition && time / 28 + c.shinePhase + tilt(c, x, c.y, w, h, time);
        if (!edition || !drawAnimated(c, edition, w, h, shine || 0, time))
          ctx.drawImage(picture, -w / 2, -h / 2, w, h);
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
          { timeout: 400 },
        )
      : window.setTimeout(() => {
          last = performance.now();
          frame = requestAnimationFrame(tick);
        }, 100);
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [pool, reducedMotion, interactive, freshPictures]);

  if (reducedMotion) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none h-full w-full ${className}`}
    />
  );
}
