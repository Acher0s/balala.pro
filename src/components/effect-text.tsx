import type {
  EffectLine,
  GameItem,
  ItemKind,
  TextSegment,
} from "@/data/game-types";

/** Text colours from the game's palette, keyed by localization colour name. */
export const COLOURS: Record<string, string> = {
  mult: "#fe5f55",
  red: "#fe5f55",
  chips: "#009dff",
  blue: "#009dff",
  money: "#f3b958",
  gold: "#eac058",
  attention: "#ff9a00",
  important: "#ff9a00",
  orange: "#ff9a00",
  green: "#4bc292",
  purple: "#8867a5",
  tarot: "#a782d1",
  planet: "#13afce",
  spectral: "#4584fa",
  legendary: "#b26cbb",
  inactive: "#9a9a9a",
  hearts: "#f03464",
  diamonds: "#f06b3f",
  spades: "#403995",
  clubs: "#235955",
  white: "#ffffff",
  edition: "#8fa1d0",
  dark_edition: "#5d5dff",
};

const KIND_COLOUR: Record<ItemKind, string> = {
  joker: "#ff9a00",
  tarot: COLOURS.tarot,
  planet: COLOURS.planet,
  spectral: COLOURS.spectral,
  voucher: "#fd682b",
  enhancement: "#8a9ba8",
  seal: "#e0b44c",
  deck: "#8a9ba8",
  stake: "#8a9ba8",
  tag: "#8a9ba8",
  booster: "#8a9ba8",
};

const RARITY_COLOUR = {
  common: "#009dff",
  uncommon: "#4bc292",
  rare: "#fe5f55",
  legendary: "#b26cbb",
};

export function colourOf(item: Pick<GameItem, "rarity" | "kind">) {
  return item.rarity ? RARITY_COLOUR[item.rarity] : KIND_COLOUR[item.kind];
}

function Segment({ s }: { s: TextSegment }) {
  if (s.x) {
    return (
      <span
        className="rounded px-1 font-semibold"
        style={{
          background: COLOURS[s.x] ?? s.x,
          color: COLOURS[s.c ?? "white"] ?? "#fff",
        }}
      >
        {s.t.trim()}
      </span>
    );
  }
  return <span style={s.c ? { color: COLOURS[s.c] } : undefined}>{s.t}</span>;
}

/** A card's effect, styled like the in-game tooltip. */
export function EffectText({ lines }: { lines: EffectLine[] }) {
  return (
    <span className="block rounded-md bg-white px-2 py-1.5 text-center text-[13px] font-semibold leading-snug text-[#4f6367]">
      {lines.map((line, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lines are static
        <span key={i} className="block min-h-[0.5em]">
          {line.map((s, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: segments are static
            <Segment key={j} s={s} />
          ))}
        </span>
      ))}
    </span>
  );
}

/** Back to the game's code syntax, for editing: [{t:"+4",c:"mult"},{t:" Mult"}] → "{C:mult}+4{} Mult". */
export function lineToCode(line: EffectLine): string {
  let out = "";
  let open = false;
  for (const s of line) {
    const codes = [s.x && `X:${s.x}`, s.c && `C:${s.c}`].filter(Boolean);
    if (codes.length) {
      out += `{${codes.join(",")}}${s.t}`;
      open = true;
    } else {
      out += (open ? "{}" : "") + s.t;
      open = false;
    }
  }
  return out;
}
