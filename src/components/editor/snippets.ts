import type { ItemKind } from "@/data/game-types";

export interface CatalogEntry {
  /** A game card kind, or "card" for a playing card (drawn with <PlayingCard>). */
  kind: ItemKind | "card";
  /** Id written into the guide; the card's name in slug form so the source stays readable. */
  id: string;
  name: string;
  image: string;
  /** Playing cards: the images stacked to draw the card (base, then rank and suit). */
  layers?: string[];
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
  stake: "Stake",
  tag: "Tag",
  booster: "Booster",
  sticker: "Sticker",
};

export const KIND_LABELS: Record<ItemKind | "card", string> = {
  card: "Playing cards",
  joker: "Jokers",
  tarot: "Tarots",
  planet: "Planets",
  spectral: "Spectrals",
  voucher: "Vouchers",
  enhancement: "Enhancements",
  seal: "Seals",
  deck: "Decks",
  stake: "Stakes",
  tag: "Tags",
  booster: "Booster packs",
  sticker: "Stickers",
};

/** Kinds that can have an edition in the game: jokers, consumables and playing cards. */
export const EDITION_KINDS: CatalogEntry["kind"][] = [
  "joker",
  "tarot",
  "planet",
  "spectral",
  "card",
];

/**
 * Markup for a card reference. With `selected` text, the reference keeps that text
 * as written: <Joker id="mime">mime setup</Joker>. Jokers can get stickers and cards that can
 * have one an edition: <Joker id="mime" edition="foil" stickers="eternal rental" />.
 */
export function cardMarkup(
  entry: CatalogEntry,
  {
    selected,
    asCard,
    stickers = [],
    edition,
  }: {
    selected?: string;
    asCard?: boolean;
    stickers?: string[];
    edition?: string;
  },
) {
  const editionAttr =
    edition && EDITION_KINDS.includes(entry.kind)
      ? ` edition="${edition}"`
      : "";
  if (entry.kind === "card") {
    // Playing cards are a picture only; keep any selected text next to it.
    const markup = `<PlayingCard card="${entry.id}"${editionAttr} />`;
    return selected ? `${selected} ${markup}` : markup;
  }
  const tag = TAG_BY_KIND[entry.kind];
  const withStickers = entry.kind === "joker" && stickers.length > 0;
  const attrs = `id="${entry.id}"${asCard ? " card" : ""}${editionAttr}${withStickers ? ` stickers="${stickers.join(" ")}"` : ""}`;
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
    label: "Calculator with sections",
    text: `<Calc id="my-calc" title="Calculator">
  <Section title="Inputs">
    <Input name="a" label="First value" default={1} min={0} />
    <Input name="b" label="Second value" default={2} min={0} />
  </Section>
  <Section title="Results">
    <Output label="Result" value="a * b" />
  </Section>
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
    label: "Card toggles",
    text: `<Toggles summary="Bought">
  <Toggle name="tm" card="voucher:tarot_merchant" />
  <Toggle name="tt" card="voucher:tarot_tycoon" requires="tm" />
</Toggles>
`,
  },
  {
    label: "Bands chart",
    text: `<Bands compare="At the start">
  <Band label="Joker" value="20" colour="attention" />
  <Band label="Tarot" value="if(tt, 32, if(tm, 9.6, 4))" colour="tarot" />
</Bands>
`,
  },
  {
    label: "Show when",
    text: `<Show when="tm">
Only shown while tm is on.
</Show>
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
    label: "Card row (always one line)",
    text: `<CardRow singleRow>
  <Joker id="blueprint" card />
  <Joker id="brainstorm" card />
  <Joker id="mime" card />
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
