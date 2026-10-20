import type { EffectLine, TextSegment } from "../data/game-types.ts";

/**
 * Parses one line of effect text written with the game's localization codes:
 *   "{C:mult}+#1#{} Mult"          coloured text, #1# filled from `vars`
 *   "{X:mult,C:white} X1.5 {} Mult" coloured badge
 * `{}` resets the style. Unknown codes are ignored.
 */
export function parseEffectLine(line: string, vars: string[] = []): EffectLine {
  const filled = line.replace(
    /#(\d+)#/g,
    (_m, n: string) => vars[Number(n) - 1] ?? "?",
  );
  const segments: TextSegment[] = [];
  let style: Omit<TextSegment, "t"> = {};
  for (const part of filled.split(/(\{[^}]*\})/)) {
    if (part.startsWith("{")) {
      style = {};
      for (const code of part.slice(1, -1).split(",")) {
        const [k, v] = code.split(":");
        if (k === "C") style.c = v;
        if (k === "X") style.x = v;
      }
    } else if (part) segments.push({ t: part, ...style });
  }
  return segments;
}
