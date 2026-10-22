/**
 * Checks a guide's MDX before it is compiled. Guides are written by people in the browser
 * and then run on the server, so this is a security boundary:
 *
 * - no JavaScript: `{expressions}`, `import`/`export` and spread props are rejected
 * - only known components and plain HTML tags
 * - component props must be plain values (text, numbers, lists, objects)
 * - links and images can't use javascript:/data: URLs
 *
 * It also catches authoring mistakes (unknown card ids, broken formulas) with line numbers.
 */
import type { Node as EsNode, Expression, Program } from "estree";
import { isSkillLevel, LEVELS } from "@/components/level/levels";
import { findItem, getPlayingCard } from "@/data/game";
import type { ItemKind } from "@/data/game-types";
import { assertKnownVariables, compile as compileFormula } from "@/lib/formula";

const CARD_TAGS: Record<string, ItemKind> = {
  Joker: "joker",
  Tarot: "tarot",
  Planet: "planet",
  Spectral: "spectral",
  Voucher: "voucher",
  Enhancement: "enhancement",
  Seal: "seal",
  Deck: "deck",
  Stake: "stake",
  Tag: "tag",
  Booster: "booster",
};

export const ALLOWED_COMPONENTS = new Set([
  ...Object.keys(CARD_TAGS),
  "PlayingCard",
  "CardRow",
  "Level",
  "Center",
  "Columns",
  "Column",
  "Tool",
  "TierList",
  "Calc",
  "Input",
  "Output",
  "Section",
  "Value",
  "CalcTable",
  "Callout",
  "Cards",
  "Card",
  "Tabs",
  "Tab",
  "Steps",
  "Step",
  "Accordions",
  "Accordion",
]);

const ALLOWED_HTML = new Set(
  "a abbr b blockquote br code del details div em figcaption figure h1 h2 h3 h4 h5 h6 hr i img ins kbd li mark ol p pre s small span strong sub summary sup table tbody td th thead tr u ul".split(
    " ",
  ),
);

const BLOCKED_ATTRS = /^(on|dangerously|ref$|style$)/i;
const URL_ATTRS = new Set(["href", "src"]);

export class GuideValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join("\n"));
    this.name = "GuideValidationError";
  }
}

interface Position {
  start?: { line: number };
}
interface MdNode {
  type: string;
  name?: string | null;
  url?: string;
  value?: string;
  attributes?: MdAttr[];
  children?: MdNode[];
  position?: Position;
}
interface MdAttr {
  type: string;
  name?: string;
  value?:
    | string
    | null
    | { type: string; value: string; data?: { estree?: Program } };
}

function safeUrl(url: string) {
  // Browsers ignore whitespace and control characters inside a scheme ("java\tscript:").
  const u = [...url.toLowerCase()]
    .filter((ch) => ch.charCodeAt(0) > 0x20)
    .join("");
  return !/^(javascript|data|vbscript):/.test(u);
}

/** Turns a plain-value expression (literal, array, object) into its value, or throws. */
function literalValue(node: EsNode): unknown {
  switch (node.type) {
    case "Literal":
      if ("regex" in node && node.regex)
        throw new Error("regular expressions aren't allowed");
      return node.value;
    case "UnaryExpression":
      if (
        (node.operator === "-" || node.operator === "+") &&
        node.argument.type === "Literal"
      ) {
        const v = node.argument.value;
        if (typeof v === "number") return node.operator === "-" ? -v : v;
      }
      throw new Error("only numbers can have a sign");
    case "TemplateLiteral":
      if (node.expressions.length)
        throw new Error("placeholders inside `backtick text` aren't allowed");
      return node.quasis.map((q) => q.value.cooked).join("");
    case "ArrayExpression":
      return node.elements.map((e) => {
        if (!e || e.type === "SpreadElement")
          throw new Error("spreads aren't allowed");
        return literalValue(e);
      });
    case "ObjectExpression": {
      const out: Record<string, unknown> = {};
      for (const p of node.properties) {
        if (
          p.type !== "Property" ||
          p.computed ||
          p.method ||
          p.kind !== "init" ||
          p.shorthand
        ) {
          throw new Error("objects may only contain plain `key: value` pairs");
        }
        const key =
          p.key.type === "Identifier"
            ? p.key.name
            : p.key.type === "Literal"
              ? String(p.key.value)
              : null;
        if (key === null || key === "__proto__")
          throw new Error("invalid object key");
        out[key] = literalValue(p.value as Expression);
      }
      return out;
    }
    default:
      throw new Error(
        "only plain values (text, numbers, lists, objects) are allowed here",
      );
  }
}

function attrValue(attr: MdAttr): unknown {
  const v = attr.value;
  if (v === null || v === undefined) return true; // <Joker card />
  if (typeof v === "string") return v;
  const program = v.data?.estree;
  const stmt = program?.body[0];
  if (
    !program ||
    program.body.length !== 1 ||
    stmt?.type !== "ExpressionStatement"
  ) {
    throw new Error("only plain values are allowed");
  }
  return literalValue(stmt.expression);
}

function props(
  node: MdNode,
  problems: string[],
  at: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const attr of node.attributes ?? []) {
    if (attr.type !== "mdxJsxAttribute" || !attr.name) {
      problems.push(`${at}: spread props like {...x} aren't allowed`);
      continue;
    }
    if (BLOCKED_ATTRS.test(attr.name)) {
      problems.push(`${at}: the "${attr.name}" prop isn't allowed`);
      continue;
    }
    try {
      const value = attrValue(attr);
      if (
        URL_ATTRS.has(attr.name) &&
        typeof value === "string" &&
        !safeUrl(value)
      ) {
        problems.push(`${at}: unsafe link "${value}"`);
      }
      out[attr.name] = value;
    } catch (e) {
      problems.push(`${at}: ${attr.name}=… ${(e as Error).message}`);
    }
  }
  return out;
}

function descendants(node: MdNode, name: string, out: MdNode[] = []): MdNode[] {
  for (const child of node.children ?? []) {
    if (child.name === name) out.push(child);
    descendants(child, name, out);
  }
  return out;
}

function checkFormula(
  src: unknown,
  known: string[],
  at: string,
  problems: string[],
) {
  if (typeof src !== "string")
    return problems.push(`${at}: a formula (text) is required`);
  try {
    const f = compileFormula(src);
    assertKnownVariables(f, known, at);
  } catch (e) {
    problems.push(`${at}: ${(e as Error).message}`);
  }
}

function checkComponent(
  node: MdNode,
  p: Record<string, unknown>,
  at: string,
  problems: string[],
  options: ValidateOptions,
) {
  const name = node.name as string;
  const kind = CARD_TAGS[name];
  if (kind) {
    if (typeof p.id !== "string")
      problems.push(`${at}: <${name}> needs an id, e.g. id="mime"`);
    else if (!findItem(kind, p.id))
      problems.push(`${at}: unknown ${kind} "${p.id}"`);
    return;
  }
  switch (name) {
    case "Tool":
      if (options.kind === "tool") {
        problems.push(`${at}: a tool can't embed another tool`);
      } else if (typeof p.id !== "string") {
        problems.push(
          `${at}: <Tool> needs the tool's id, e.g. id="interest-calculator"`,
        );
      } else if (options.knownTools && !options.knownTools.has(p.id)) {
        problems.push(`${at}: there's no published tool "${p.id}"`);
      }
      return;
    case "TierList":
      if (typeof p.id !== "string") {
        problems.push(
          `${at}: <TierList> needs the tier list's id, e.g. id="AbC123xy"`,
        );
      } else if (options.knownTierLists && !options.knownTierLists.has(p.id)) {
        problems.push(`${at}: there's no published tier list "${p.id}"`);
      }
      return;
    case "Level":
      if (!isSkillLevel(p.of))
        problems.push(
          `${at}: <Level of="…"> must be one of: ${LEVELS.join(", ")}`,
        );
      return;
    case "PlayingCard":
      try {
        getPlayingCard(String(p.card));
      } catch (e) {
        problems.push(`${at}: ${(e as Error).message}`);
      }
      if (p.enhancement && !findItem("enhancement", String(p.enhancement)))
        problems.push(`${at}: unknown enhancement "${p.enhancement}"`);
      if (p.seal && !findItem("seal", String(p.seal)))
        problems.push(`${at}: unknown seal "${p.seal}"`);
      return;
    case "Calc": {
      const names: string[] = [];
      for (const input of descendants(node, "Input")) {
        const ip = props(input, [], at);
        if (typeof ip.name !== "string")
          problems.push(`${line(input)}: <Input> needs a name`);
        else if (names.includes(ip.name))
          problems.push(`${line(input)}: duplicate input "${ip.name}"`);
        else names.push(ip.name);
        if (typeof ip.default !== "number")
          problems.push(`${line(input)}: <Input> needs a numeric default={…}`);
      }
      for (const output of descendants(node, "Output")) {
        checkFormula(
          props(output, [], at).value,
          names,
          `${line(output)}: <Output>`,
          problems,
        );
      }
      return;
    }
    case "CalcTable": {
      const rows = p.rows as { name?: string } | undefined;
      const cols = p.cols as { name?: string } | undefined;
      if (!rows?.name || !cols?.name)
        return problems.push(
          `${at}: <CalcTable> needs rows and cols with a name`,
        );
      checkFormula(
        p.value,
        [rows.name, cols.name],
        `${at}: <CalcTable>`,
        problems,
      );
      return;
    }
    case "Value":
      checkFormula(
        p.of,
        Object.keys((p.vars as object) ?? {}),
        `${at}: <Value>`,
        problems,
      );
      return;
  }
}

const line = (node: MdNode) => `line ${node.position?.start?.line ?? "?"}`;

function walk(
  node: MdNode,
  problems: string[],
  inCalc: boolean,
  options: ValidateOptions,
) {
  const at = line(node);
  switch (node.type) {
    case "mdxjsEsm":
      problems.push(`${at}: import/export isn't allowed`);
      return;
    case "mdxFlowExpression":
    case "mdxTextExpression":
      problems.push(
        `${at}: curly braces {…} aren't allowed in text. Write \\{ to show a brace.`,
      );
      return;
    case "link":
    case "image":
    case "definition":
      if (node.url && !safeUrl(node.url))
        problems.push(`${at}: unsafe link "${node.url}"`);
      break;
    case "mdxJsxFlowElement":
    case "mdxJsxTextElement": {
      const name = node.name;
      if (!name) {
        problems.push(`${at}: fragments <>…</> aren't allowed`);
        return;
      }
      if (!ALLOWED_COMPONENTS.has(name) && !ALLOWED_HTML.has(name)) {
        problems.push(`${at}: <${name}> isn't an allowed component or tag`);
        return;
      }
      if ((name === "Input" || name === "Output") && !inCalc) {
        problems.push(`${at}: <${name}> must be inside a <Calc> block`);
      }
      const p = props(node, problems, at);
      checkComponent(node, p, at, problems, options);
      for (const child of node.children ?? [])
        walk(child, problems, inCalc || name === "Calc", options);
      return;
    }
  }
  for (const child of node.children ?? [])
    walk(child, problems, inCalc, options);
}

export interface ValidateOptions {
  /** Tools can't embed other tools. */
  kind?: "guide" | "tool";
  /** Slugs of published tools; when given, <Tool id> must be one of them. */
  knownTools?: Set<string>;
  /** Ids of published tier lists; when given, <TierList id> must be one of them. */
  knownTierLists?: Set<string>;
}

/** Remark plugin: throws GuideValidationError listing every problem found. */
export function remarkValidateGuide(options: ValidateOptions = {}) {
  return (tree: MdNode) => {
    const problems: string[] = [];
    walk(tree, problems, false, options);
    if (problems.length) throw new GuideValidationError(problems);
  };
}
