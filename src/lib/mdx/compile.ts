import "server-only";
import { compile, run } from "@mdx-js/mdx";
import { remarkGfm, remarkHeading } from "fumadocs-core/mdx-plugins";
import type { TOCItemType } from "fumadocs-core/toc";
import type { MDXContent } from "mdx/types";
import * as runtime from "react/jsx-runtime";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { baseCardImage, findItem, getPlayingCard } from "@/data/game";
import type { ItemKind } from "@/data/game-types";
import {
  GuideValidationError,
  remarkValidateGuide,
  type ValidateOptions,
} from "./validate";

export interface CompileOptions extends ValidateOptions {
  /** Tag blocks with their source line (editor preview scroll sync). */
  sourceLines?: boolean;
}

export { GuideValidationError };

export const frontmatterSchema = z.object({
  title: z.string().min(1, "title is required"),
  description: z.string().optional(),
  author: z.string().optional(),
  /** BMP version the guide was last checked against, e.g. "0.5.5" */
  patch: z.union([z.string(), z.number()]).transform(String).optional(),
  tags: z.array(z.string()).default([]),
  /**
   * Up to 3 cards shown with the page in lists, written as kind:id: `icon: joker:baron`, or
   * fanned out with `icon: [joker:baron, joker:mime]`. The first is the main one, on top.
   * Always read as a list.
   */
  icon: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) =>
      value === undefined ? [] : Array.isArray(value) ? value : [value],
    )
    .superRefine((icons, ctx) => {
      if (icons.length > MAX_ICONS)
        ctx.addIssue({
          code: "custom",
          message: `can have up to ${MAX_ICONS} cards`,
        });
      for (const icon of icons)
        if (!resolveIcon(icon))
          ctx.addIssue({
            code: "custom",
            message: `"${icon}" isn't a card. Write it like joker:reserved_parking, tarot:hermit or card:KH`,
          });
    }),
});

export const MAX_ICONS = 3;

const ICON_RE =
  /^(joker|tarot|planet|spectral|voucher|enhancement|seal|deck|stake):(.+)$/;
/** card:KH, card:KH:steel (enhancement), card:KH:steel:red or card:KH::red (seal) */
const PLAYING_CARD_ICON_RE = /^card:([^:]+)(?::([^:]*))?(?::([^:]*))?$/;

/** An icon ready to draw: image layers stacked bottom to top. */
export interface IconCard {
  key: string;
  layers: string[];
}

/**
 * What an `icon` value points to: a game card ("joker:reserved_parking") or a playing card
 * drawn like <PlayingCard> ("card:KH", "card:KH:steel:red"). Undefined if it isn't a card.
 */
export function resolveIcon(icon: string): IconCard | undefined {
  const value = icon.trim();
  const game = ICON_RE.exec(value);
  if (game) {
    const item = findItem(game[1] as ItemKind, game[2]);
    return item && { key: value, layers: [item.image] };
  }
  const playing = PLAYING_CARD_ICON_RE.exec(value);
  if (!playing) return undefined;
  const [, code, enhancementId, sealId] = playing;
  let front: ReturnType<typeof getPlayingCard>;
  try {
    front = getPlayingCard(code);
  } catch {
    return undefined;
  }
  const enhancement = enhancementId
    ? findItem("enhancement", enhancementId)
    : undefined;
  const seal = sealId ? findItem("seal", sealId) : undefined;
  if ((enhancementId && !enhancement) || (sealId && !seal?.overlay))
    return undefined;
  return {
    key: value,
    // Same layering as <PlayingCard>: stone cards have no rank or suit.
    layers: [
      enhancement?.image ?? baseCardImage,
      ...(enhancement?.key === "m_stone" ? [] : [front.image]),
      ...(seal?.overlay ? [seal.overlay] : []),
    ],
  };
}

export type Frontmatter = z.infer<typeof frontmatterSchema>;

export interface CompiledGuide {
  frontmatter: Frontmatter;
  Body: MDXContent;
  toc: TOCItemType[];
}

/** Splits "---\nyaml\n---\nbody" into its parts. */
export function splitFrontmatter(source: string): {
  yaml: string;
  body: string;
  bodyLine: number;
} {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!m) return { yaml: "", body: source, bodyLine: 1 };
  return {
    yaml: m[1],
    body: source.slice(m[0].length),
    bodyLine: m[0].split("\n").length,
  };
}

export function parseFrontmatter(source: string): Frontmatter {
  const { yaml } = splitFrontmatter(source);
  let data: unknown;
  try {
    data = parseYaml(yaml) ?? {};
  } catch (e) {
    throw new GuideValidationError([`frontmatter: ${(e as Error).message}`]);
  }
  const parsed = frontmatterSchema.safeParse(data);
  if (!parsed.success) {
    throw new GuideValidationError(
      parsed.error.issues.map(
        (i) => `frontmatter: ${i.path.join(".") || "value"} ${i.message}`,
      ),
    );
  }
  return parsed.data;
}

/** Adds the frontmatter's length to line numbers so they match the editor. */
function shiftLines(e: unknown, offset: number): never {
  if (e instanceof GuideValidationError) {
    throw new GuideValidationError(
      e.problems.map((p) =>
        p.replace(
          /^line (\d+)/,
          (_m, n: string) => `line ${Number(n) + offset}`,
        ),
      ),
    );
  }
  const err = e as {
    message?: string;
    line?: number;
    place?: { line?: number };
  };
  const ln = err.place?.line ?? err.line;
  throw new GuideValidationError([
    `${ln ? `line ${ln + offset}: ` : ""}${err.message ?? String(e)}`,
  ]);
}

interface LinkNode {
  type: string;
  url?: string;
  name?: string | null;
  attributes?: { type: string; name?: string; value?: unknown }[];
  children?: LinkNode[];
}

/** A link to a heading on the editor's private preview page: /preview/<id>#heading */
const PREVIEW_ANCHOR =
  /^(?:https?:\/\/[^/]+)?\/preview\/[0-9a-f-]{36}(#[^\s]+)$/i;

/**
 * Turns links copied from the editor preview ("Copy link" on a heading) into plain
 * same-page jumps (#heading), so readers scroll to the heading instead of hitting the
 * private preview page.
 */
function remarkLocalAnchors() {
  return (tree: LinkNode) => {
    const visit = (node: LinkNode) => {
      if ((node.type === "link" || node.type === "definition") && node.url) {
        node.url = node.url.replace(PREVIEW_ANCHOR, "$1");
      }
      if (node.name === "a") {
        for (const attr of node.attributes ?? []) {
          if (attr.name === "href" && typeof attr.value === "string") {
            attr.value = attr.value.replace(PREVIEW_ANCHOR, "$1");
          }
        }
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
  };
}

interface HastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  position?: { start: { line: number } };
  children?: HastNode[];
}

const BLOCK_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "pre",
  "table",
  "blockquote",
  "hr",
]);

/**
 * Preview only: tags each rendered block with the editor line it came from (data-line),
 * so the preview can scroll along with the editor.
 */
function rehypeSourceLines(offset: number) {
  return () => (tree: HastNode) => {
    const visit = (node: HastNode) => {
      if (
        node.type === "element" &&
        node.tagName &&
        BLOCK_TAGS.has(node.tagName) &&
        node.position
      ) {
        node.properties = {
          ...node.properties,
          dataLine: node.position.start.line + offset,
        };
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
  };
}

/**
 * Validates and compiles a guide. Throws GuideValidationError with readable problems.
 * Only validated MDX (plain values, allowed components) ever reaches `run`.
 */
export async function compileGuide(
  source: string,
  { sourceLines = false, ...validate }: CompileOptions = {},
): Promise<CompiledGuide> {
  const frontmatter = parseFrontmatter(source);
  const { body, bodyLine } = splitFrontmatter(source);
  const offset = bodyLine - 1;

  let code: string;
  let toc: TOCItemType[];
  try {
    const file = await compile(body, {
      outputFormat: "function-body",
      development: false,
      remarkPlugins: [
        [remarkValidateGuide, validate],
        remarkLocalAnchors,
        remarkGfm,
        [remarkHeading, { generateToc: true }],
      ],
      rehypePlugins: sourceLines ? [rehypeSourceLines(offset)] : [],
    });
    code = String(file);
    toc = (file.data.toc as TOCItemType[] | undefined) ?? [];
  } catch (e) {
    shiftLines(e, offset);
  }

  const { default: Body } = await run(code, {
    ...runtime,
    baseUrl: import.meta.url,
  });
  return { frontmatter, Body, toc };
}

const cache = new Map<string, Promise<CompiledGuide>>();

/** Compiles once per distinct source (keyed by id + timestamp by the caller). */
export function compileGuideCached(
  key: string,
  source: string,
  options?: CompileOptions,
) {
  let hit = cache.get(key);
  if (!hit) {
    hit = compileGuide(source, options);
    hit.catch(() => cache.delete(key));
    if (cache.size > 200) cache.delete(cache.keys().next().value as string);
    cache.set(key, hit);
  }
  return hit;
}
