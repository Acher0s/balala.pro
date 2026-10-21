/**
 * A small spreadsheet-style formula language for guide calculators.
 *
 *   P * 2^(P-1) * (1 - (1 - 0.5^P)^R)
 *   if(dice = 1, P * R, 0.5 * P * R)
 *   1 - combin(total - wanted, pack) / combin(total, pack)
 *
 * Operators: + - * / ^ (right-associative), comparisons = == <> != < <= > >=.
 * Comparisons yield 1 or 0. Never uses eval, so guide authors can't run arbitrary code.
 */

export class FormulaError extends Error {
  readonly source: string;

  constructor(message: string, source: string) {
    super(`${message} in formula "${source}"`);
    this.name = "FormulaError";
    this.source = source;
  }
}

type Node =
  | { type: "num"; value: number }
  | { type: "var"; name: string }
  | { type: "neg"; arg: Node }
  | { type: "bin"; op: string; left: Node; right: Node }
  | { type: "call"; name: string; args: Node[] };

type Token =
  | { kind: "num"; value: number }
  | { kind: "id"; value: string }
  | { kind: "op"; value: string };

const OPERATORS = [
  "<=",
  ">=",
  "<>",
  "!=",
  "==",
  "+",
  "-",
  "*",
  "/",
  "^",
  "(",
  ")",
  ",",
  "<",
  ">",
  "=",
];

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
    if (num) {
      tokens.push({ kind: "num", value: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (id) {
      tokens.push({ kind: "id", value: id[0] });
      i += id[0].length;
      continue;
    }
    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (op) {
      tokens.push({ kind: "op", value: op });
      i += op.length;
      continue;
    }
    throw new FormulaError(`Unexpected character "${ch}"`, src);
  }
  return tokens;
}

function parse(src: string): Node {
  const tokens = tokenize(src);
  let pos = 0;

  const peek = () => tokens[pos];
  const isOp = (...ops: string[]) => {
    const t = peek();
    return t?.kind === "op" && ops.includes(t.value);
  };
  const expect = (op: string) => {
    if (!isOp(op)) throw new FormulaError(`Expected "${op}"`, src);
    pos++;
  };

  function comparison(): Node {
    const left = additive();
    if (isOp("=", "==", "<>", "!=", "<", "<=", ">", ">=")) {
      const op = (tokens[pos++] as { value: string }).value;
      return { type: "bin", op, left, right: additive() };
    }
    return left;
  }

  function additive(): Node {
    let node = multiplicative();
    while (isOp("+", "-")) {
      const op = (tokens[pos++] as { value: string }).value;
      node = { type: "bin", op, left: node, right: multiplicative() };
    }
    return node;
  }

  function multiplicative(): Node {
    let node = unary();
    while (isOp("*", "/")) {
      const op = (tokens[pos++] as { value: string }).value;
      node = { type: "bin", op, left: node, right: unary() };
    }
    return node;
  }

  function unary(): Node {
    if (isOp("-")) {
      pos++;
      return { type: "neg", arg: unary() };
    }
    if (isOp("+")) {
      pos++;
      return unary();
    }
    return power();
  }

  function power(): Node {
    const base = primary();
    if (isOp("^")) {
      pos++;
      return { type: "bin", op: "^", left: base, right: unary() };
    }
    return base;
  }

  function primary(): Node {
    const t = peek();
    if (!t) throw new FormulaError("Unexpected end of formula", src);
    pos++;
    if (t.kind === "num") return { type: "num", value: t.value };
    if (t.kind === "id") {
      if (isOp("(")) {
        pos++;
        const args: Node[] = [];
        if (!isOp(")")) {
          args.push(comparison());
          while (isOp(",")) {
            pos++;
            args.push(comparison());
          }
        }
        expect(")");
        const name = t.value.toLowerCase();
        if (!(name in FUNCTIONS) && name !== "if")
          throw new FormulaError(`Unknown function "${t.value}"`, src);
        return { type: "call", name, args };
      }
      return { type: "var", name: t.value };
    }
    if (t.value === "(") {
      const inner = comparison();
      expect(")");
      return inner;
    }
    throw new FormulaError(`Unexpected "${t.value}"`, src);
  }

  const root = comparison();
  if (pos < tokens.length)
    throw new FormulaError(
      `Unexpected "${(tokens[pos] as { value: unknown }).value}"`,
      src,
    );
  return root;
}

function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  abs: Math.abs,
  ceil: Math.ceil,
  floor: Math.floor,
  sqrt: Math.sqrt,
  exp: Math.exp,
  ln: Math.log,
  log10: Math.log10,
  min: Math.min,
  max: Math.max,
  sum: (...xs) => xs.reduce((a, b) => a + b, 0),
  round: (x, digits = 0) => Math.round(x * 10 ** digits) / 10 ** digits,
  /** Binomial coefficient, same as the spreadsheet COMBIN(n, k). */
  combin: (n, k) => {
    if (k < 0 || k > n) return 0;
    return factorial(n) / (factorial(k) * factorial(n - k));
  },
  /** Remainder with the sign of the divisor, same as the spreadsheet MOD(a, b). */
  mod: (a, b) => a - b * Math.floor(a / b),
  /** The n-th of the values (1-based), same as the spreadsheet CHOOSE(n, …). */
  choose: (n, ...values) => values[Math.trunc(n) - 1] ?? Number.NaN,
  and: (...xs) => (xs.every(Boolean) ? 1 : 0),
  or: (...xs) => (xs.some(Boolean) ? 1 : 0),
  not: (x) => (x ? 0 : 1),
};

function evaluate(
  node: Node,
  scope: Record<string, number>,
  src: string,
): number {
  switch (node.type) {
    case "num":
      return node.value;
    case "var": {
      const v = scope[node.name];
      if (v === undefined)
        throw new FormulaError(`Unknown variable "${node.name}"`, src);
      return v;
    }
    case "neg":
      return -evaluate(node.arg, scope, src);
    case "call": {
      if (node.name === "if") {
        if (node.args.length !== 3)
          throw new FormulaError("if() takes 3 arguments", src);
        const [cond, then, otherwise] = node.args;
        return evaluate(cond, scope, src)
          ? evaluate(then, scope, src)
          : evaluate(otherwise, scope, src);
      }
      return FUNCTIONS[node.name](
        ...node.args.map((a) => evaluate(a, scope, src)),
      );
    }
    case "bin": {
      const l = evaluate(node.left, scope, src);
      const r = evaluate(node.right, scope, src);
      switch (node.op) {
        case "+":
          return l + r;
        case "-":
          return l - r;
        case "*":
          return l * r;
        case "/":
          return l / r;
        case "^":
          return l ** r;
        case "=":
        case "==":
          return l === r ? 1 : 0;
        case "<>":
        case "!=":
          return l !== r ? 1 : 0;
        case "<":
          return l < r ? 1 : 0;
        case "<=":
          return l <= r ? 1 : 0;
        case ">":
          return l > r ? 1 : 0;
        case ">=":
          return l >= r ? 1 : 0;
      }
    }
  }
  throw new FormulaError("Invalid expression", src);
}

function collectVariables(node: Node, out: Set<string>): Set<string> {
  if (node.type === "var") out.add(node.name);
  else if (node.type === "neg") collectVariables(node.arg, out);
  else if (node.type === "bin") {
    collectVariables(node.left, out);
    collectVariables(node.right, out);
  } else if (node.type === "call")
    for (const a of node.args) collectVariables(a, out);
  return out;
}

export interface Formula {
  source: string;
  /** Names of the variables the formula reads. */
  variables: Set<string>;
  evaluate(scope?: Record<string, number>): number;
}

export function compile(source: string): Formula {
  const ast = parse(source);
  return {
    source,
    variables: collectVariables(ast, new Set()),
    evaluate: (scope = {}) => evaluate(ast, scope, source),
  };
}

/** Throws if the formula reads a variable that isn't in `known`. */
export function assertKnownVariables(
  formula: Formula,
  known: Iterable<string>,
  context: string,
) {
  const knownSet = new Set(known);
  const missing = [...formula.variables].filter((v) => !knownSet.has(v));
  if (missing.length > 0) {
    throw new FormulaError(
      `${context}: unknown variable(s) ${missing.map((m) => `"${m}"`).join(", ")}`,
      formula.source,
    );
  }
}
