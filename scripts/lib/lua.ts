/**
 * A tolerant parser for the Lua table literals in Balatro's source (game.lua, en-us.lua).
 * Values it can't represent (function calls, globals) come back as { expr: "<source>" }.
 */

export type LuaValue =
  | string
  | number
  | boolean
  | null
  | LuaValue[]
  | { [key: string]: LuaValue }
  | { expr: string };

export function parseLuaTable(src: string, start = src.indexOf("{")): LuaValue {
  let i = start;

  function skip() {
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src.startsWith("--[[", i)) {
        const end = src.indexOf("]]", i);
        i = end === -1 ? src.length : end + 2;
      } else if (src.startsWith("--", i)) {
        const end = src.indexOf("\n", i);
        i = end === -1 ? src.length : end + 1;
      } else return;
    }
  }

  function string(): string {
    if (src.startsWith("[[", i)) {
      const end = src.indexOf("]]", i);
      const s = src.slice(i + 2, end);
      i = end + 2;
      return s;
    }
    const quote = src[i++];
    let out = "";
    while (src[i] !== quote) {
      if (src[i] === "\\") {
        const c = src[i + 1];
        out += c === "n" ? "\n" : c === "t" ? "\t" : c;
        i += 2;
      } else out += src[i++];
    }
    i++;
    return out;
  }

  /** Raw source up to the next top-level "," / ";" / "}". */
  function rawExpr(): { expr: string } {
    const from = i;
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '"' || c === "'") {
        string();
        continue;
      }
      if (c === "(" || c === "{" || c === "[") depth++;
      else if (c === ")" || c === "}" || c === "]") {
        if (depth === 0) break;
        depth--;
      } else if ((c === "," || c === ";") && depth === 0) break;
      i++;
    }
    return { expr: src.slice(from, i).trim() };
  }

  /** Skips a `function ... end` block, returning its source. */
  function func(): { expr: string } {
    const from = i;
    let depth = 0;
    while (i < src.length) {
      skip();
      const c = src[i];
      if (c === '"' || c === "'" || src.startsWith("[[", i)) {
        string();
        continue;
      }
      const word = /^[A-Za-z_]\w*/.exec(src.slice(i, i + 20))?.[0];
      if (word) {
        if (
          word === "function" ||
          word === "if" ||
          word === "do" ||
          word === "repeat"
        )
          depth++;
        else if (word === "end" || word === "until") {
          depth--;
          if (depth === 0) {
            i += word.length;
            break;
          }
        }
        i += word.length;
        continue;
      }
      i++;
    }
    return { expr: src.slice(from, i) };
  }

  function value(): LuaValue {
    skip();
    const c = src[i];
    if (c === "{") return table();
    if (/^function\b/.test(src.slice(i, i + 9))) return func();
    if (c === '"' || c === "'" || src.startsWith("[[", i)) {
      const s = string();
      skip();
      // String concatenation and the like aren't literals.
      if (src.startsWith("..", i))
        return { expr: `${JSON.stringify(s)}${rawExpr().expr}` };
      return s;
    }
    const num = /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i, i + 40));
    if (num) {
      const after = src.slice(i + num[0].length).trimStart()[0];
      if (after === "," || after === "}" || after === ";") {
        i += num[0].length;
        return Number(num[0]);
      }
    }
    for (const [word, v] of [
      ["true", true],
      ["false", false],
      ["nil", null],
    ] as const) {
      if (src.startsWith(word, i) && !/\w/.test(src[i + word.length] ?? "")) {
        const after = src.slice(i + word.length).trimStart()[0];
        if (after === "," || after === "}" || after === ";") {
          i += word.length;
          return v;
        }
      }
    }
    return rawExpr();
  }

  function table(): LuaValue {
    i++; // {
    const keyed: Record<string, LuaValue> = {};
    const list: LuaValue[] = [];
    for (;;) {
      skip();
      if (src[i] === "}") {
        i++;
        break;
      }
      let key: string | null = null;
      if (src[i] === "[" && src[i + 1] !== "[") {
        i++;
        skip();
        const k = value();
        skip();
        i++; // ]
        skip();
        i++; // =
        key = String(k);
      } else {
        const m = /^([A-Za-z_]\w*)\s*=(?!=)/.exec(src.slice(i, i + 200));
        if (m) {
          key = m[1];
          i += m[0].length;
        }
      }
      const v = value();
      if (key === null) list.push(v);
      else keyed[key] = v;
      skip();
      if (src[i] === "," || src[i] === ";") i++;
    }
    if (Object.keys(keyed).length === 0) return list;
    list.forEach((v, idx) => {
      keyed[String(idx + 1)] = v;
    });
    return keyed;
  }

  skip();
  return value();
}

/** Parses the table literal assigned at `marker`, e.g. "self.P_CENTERS = {". */
export function parseAssignedTable(
  src: string,
  marker: string,
): Record<string, LuaValue> {
  const at = src.indexOf(marker);
  if (at === -1)
    throw new Error(`Could not find "${marker}" in the game files`);
  return parseLuaTable(src, src.indexOf("{", at)) as Record<string, LuaValue>;
}

/** Returns the balanced-brace text starting at `open` (which must point at "{"). */
export function balanced(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'") {
      const end = src.indexOf(c, i + 1);
      i = end;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error("Unbalanced braces");
}
