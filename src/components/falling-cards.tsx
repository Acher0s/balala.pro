"use client";

import { useEffect, useRef, useState } from "react";
import { EditionShaders } from "@/components/edition-shaders";
import {
  type Edition,
  FALLING_KINDS,
  type FallingKind,
  type FallingPool,
  type FallingSettings,
  rollJokerEdition,
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
  swayPhase: number;
  swayRate: number;
  /** Offsets this card's edition shine from others with the same picture. */
  shinePhase: number;
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
  const layers = [
    ...picture.layers,
    ...(picture.seal ? [picture.seal] : []),
  ].map(image);
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

/** A random card by the mix's weights, leaving out blacklisted (and, if off, mod) cards. */
function pickCard(pool: FallingPool, s: FallingSettings, blocked: Set<string>) {
  const choices = FALLING_KINDS.map((kind) => ({
    kind,
    cards: pool.kinds[kind].filter(
      (c) => (s.modCards || !c.mod) && !blocked.has(c.ref),
    ),
    weight: s.weights[kind],
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
  return { kind: pick.kind, card: pickFrom(pick.cards) };
}

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
  if (kind === "card") {
    const roll = rollStandardCard(Math.random);
    const enhancements = pool.enhancements.filter((e) => !blocked.has(e.ref));
    const seals = pool.seals.filter((e) => !blocked.has(e.ref));
    const enhancement =
      roll.enhancement !== null && enhancements.length
        ? pickFrom(enhancements, roll.enhancement)
        : null;
    const seal =
      roll.seal !== null && seals.length ? pickFrom(seals, roll.seal) : null;
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
    return { layers, seal: null, edition: rollJokerEdition(Math.random()) };
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
 * Kept light for weak devices: it starts only once the browser is idle, uses at most
 * MAX_PICTURES different pictures (each drawn once, editions included), caps the canvas
 * resolution, and shows fewer cards when frames get slow. Nothing is shown with reduced motion or
 * data saver.
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

    let cards: Falling[] = [];
    // The pictures in use this visit; rebuilt when the mix, blacklist or editions change.
    let pictures: Picture[] = [];
    let mix = "";
    let blocked = new Set<string>();
    const nextPicture = (s: FallingSettings) => {
      const key = JSON.stringify([
        s.weights,
        s.modCards,
        s.jokerEditions,
        s.blacklist,
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
      }
      if (pictures.length < MAX_PICTURES) {
        const pick = pickCard(pool, s, blocked);
        if (!pick) return null;
        const picture = makePicture(
          pick.kind,
          pick.card.layers,
          pool,
          s,
          blocked,
        );
        pictures.push(picture);
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

    const spawn = (anywhere: boolean) => {
      const s = settingsRef.current;
      const picture = nextPicture(s);
      if (!picture) return;
      const z = s.depth ? 0.45 + Math.random() * 0.55 : 1;
      const falling: Falling = {
        picture,
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
        shinePhase: Math.random() * 10,
      };
      // Far cards are drawn first, so near ones overlap them.
      const at = cards.findIndex((c) => c.z > z);
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
     * Draws a card with its edition animated like in the game: Foil, Holographic and
     * Polychrome shine over the card; Negative replaces it and adds its own shine. The seal
     * goes on top. False if the shaders can't run (yet), so the still version is drawn.
     */
    const drawAnimated = (
      c: Falling,
      edition: Edition,
      w: number,
      h: number,
      now: number,
    ) => {
      const gl = editionShaders();
      const base = gl && renderBase(c.picture);
      if (!gl || !base) return false;
      const time = now / 1000;
      // Like the game's send_to_shader: real time / 28, plus a nudge from the card's tilt.
      const shine =
        time / 28 + c.shinePhase + 0.3 * Math.sin((c.rotation * Math.PI) / 180);
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
        const picture = render(c.picture);
        if (!picture) continue;
        const w = s.size * c.size * c.z;
        const h = (w * picture.height) / picture.width;
        ctx.save();
        ctx.globalAlpha = s.opacity;
        ctx.translate(c.x + Math.sin(c.swayPhase) * s.sway, c.y);
        ctx.rotate((c.rotation * Math.PI) / 180);
        const edition = c.picture.edition;
        if (!edition || !drawAnimated(c, edition, w, h, now))
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
