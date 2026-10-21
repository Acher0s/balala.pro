import type { ItemKind } from "@/data/game-types";

export interface CatalogEntry {
  kind: ItemKind;
  /** Id written into the guide; the card's name in slug form so the source stays readable. */
  id: string;
  name: string;
  image: string;
  /** "Multiplayer", "MP Standard", … for mod cards; null for vanilla. */
  source: string | null;
}

/** MDX component for each kind of game item. */
export const TAG_BY_KIND: Record<ItemKind, string> = {
  joker: "Joker",
  tarot: "Tarot",
  planet: "Planet",
  spectral: "Spectral",
  voucher: "Voucher",
  enhancement: "Enhancement",
  seal: "Seal",
  deck: "Deck",
};

export const KIND_LABELS: Record<ItemKind, string> = {
  joker: "Jokers",
  tarot: "Tarots",
  planet: "Planets",
  spectral: "Spectrals",
  voucher: "Vouchers",
  enhancement: "Enhancements",
  seal: "Seals",
  deck: "Decks",
};

/**
 * Markup for a card reference. With `selected` text, the reference keeps that text
 * as written: <Joker id="mime">mime setup</Joker>.
 */
export function cardMarkup(
  entry: CatalogEntry,
  { selected, asCard }: { selected?: string; asCard?: boolean },
) {
  const tag = TAG_BY_KIND[entry.kind];
  const attrs = `id="${entry.id}"${asCard ? " card" : ""}`;
  return selected
    ? `<${tag} ${attrs}>${selected}</${tag}>`
    : `<${tag} ${attrs} />`;
}

export interface Snippet {
  label: string;
  /** $SELECTION is replaced by the selected text, so a snippet can wrap it. */
  text: string;
}

export const SNIPPETS: Snippet[] = [
  {
    label: "Beginner section",
    text: `<Level of="beginner">

$SELECTION

</Level>
`,
  },
  {
    label: "Intermediate section",
    text: `<Level of="intermediate">

$SELECTION

</Level>
`,
  },
  {
    label: "Advanced section",
    text: `<Level of="advanced">

$SELECTION

</Level>
`,
  },
  {
    label: "Centered",
    text: `<Center>

$SELECTION

</Center>
`,
  },
  {
    label: "Two columns",
    text: `<Columns>
<Column>

$SELECTION

</Column>
<Column>

Second column

</Column>
</Columns>
`,
  },
  {
    label: "Calculator",
    text: `<Calc id="my-calc" title="Calculator">
  <Input name="a" label="First value" default={1} min={0} />
  <Input name="b" label="Second value" default={2} min={0} />
  <Output label="Result" value="a * b" />
</Calc>
`,
  },
  {
    label: "Dropdown input",
    text: `<Input
  name="mode"
  label="Setup"
  default={0}
  options={[
    { label: 'Option A', value: 0 },
    { label: 'Option B', value: 1 },
  ]}
/>
`,
  },
  {
    label: "Formula table",
    text: `<CalcTable
  caption="Table title"
  value="x * y"
  rows={{ name: 'x', label: 'Rows', from: 1, to: 5 }}
  cols={{ name: 'y', label: 'Columns', from: 1, to: 5 }}
/>
`,
  },
  {
    label: "Computed number",
    text: `<Value of="x * 2" vars={{ x: 3 }} format="money" />`,
  },
  {
    label: "Card row",
    text: `<CardRow title="S">
  <Joker id="blueprint" card />
  <Joker id="brainstorm" card />
</CardRow>
`,
  },
  {
    label: "Playing card",
    text: `<PlayingCard card="KH" enhancement="steel" seal="red" />`,
  },
  {
    label: "Callout",
    text: `<Callout type="warn" title="Title">
  Text
</Callout>
`,
  },
];
