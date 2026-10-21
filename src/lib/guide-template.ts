import { stringify } from "yaml";

/**
 * What a new guide starts with: a tutorial that shows everything the editor can do,
 * each feature with a live example and the source that produces it. Authors delete it as they go.
 */
export function tutorialGuide({
  title,
  author,
}: {
  title: string;
  author: string;
}) {
  const frontmatter = stringify({
    title,
    description:
      "One sentence about this guide. It's shown under the title and on the home page.",
    author,
    patch: "0.5.6",
    tags: ["example"],
  });
  return `---\n${frontmatter}---\n\n${TUTORIAL_BODY}`;
}

/** What a new tool starts with: a working calculator to adapt, and how to use the tool in guides. */
export function toolTemplate({
  title,
  author,
}: {
  title: string;
  author: string;
}) {
  const frontmatter = stringify({
    title,
    description: "One sentence about what this tool calculates.",
    author,
    patch: "0.5.6",
    tags: ["tool"],
  });
  return `---\n${frontmatter}---\n\n${TOOL_BODY}`;
}

const TOOL_BODY = `<Callout title="This tool starts with an example">
  Tools are written exactly like guides, but they're meant for calculators people come back to.
  Change the calculator below into your own. Nothing is public until you press **Publish**.
  For a full tour of what the editor can do, create a new guide: it starts with a tutorial.
</Callout>

Explain in a sentence or two what the tool is for and how to use it.

<Calc id="tool" title="Interest calculator">
  <Input name="money" label="Money at the end of the round" default={25} min={0} />
  <Input name="cap" label="Interest cap" default={5} options={[{ label: 'Normal ($5)', value: 5 }, { label: 'Seed Money ($10)', value: 10 }, { label: 'Money Tree ($20)', value: 20 }]} />
  <Output label="Interest earned" value="min(floor(money / 5), cap)" format="money" decimals={0} />
</Calc>

## How it works

Readers can click **ƒx** on a result to see its formula. Explain any assumptions here.

## Using this tool in a guide

Once this tool is published, any guide can show it with \`<Tool id="the-url-name-of-this-tool" />\`, or by picking it under **Blocks → Embed a tool** in the guide's editor. The guide always shows the latest published version.
`;

const TUTORIAL_BODY = `<Callout title="This guide starts as a tutorial">
  Everything below shows what the editor can do. The preview on the right updates as you type.
  Replace this text with your own guide, and keep the parts you find useful as a reference.
  Nothing is public until you press **Publish**.
</Callout>

## The top of the guide

The block between the two \`---\` lines at the very top sets the guide's details:

- **title**: the name of the guide
- **description**: one sentence shown under the title and on the home page
- **author**: your name, shown under the title
- **patch**: the Multiplayer mod version the guide was checked against
- **tags**: a few keywords, written like \`[econ, jokers]\`

## Writing text

Write normal text, and leave an empty line between paragraphs.

Use **bold** for important words and *italic* for emphasis. Links look like [this](https://balatromp.com).

\`\`\`md
Use **bold** for important words and *italic* for emphasis.
Links look like [this](https://balatromp.com).
\`\`\`

### Headings

Lines starting with \`##\` are section headings and show up in the "On this page" list. Use \`###\` for smaller headings inside a section.

### Lists

1. Numbered lists start with \`1.\`
2. Then \`2.\`, and so on
   - Indent with spaces for a nested list

- Bullet lists start with \`-\`

### Tables

| Joker | Rarity | Cost |
| --- | --- | --- |
| Mime | Uncommon | $5 |
| Baron | Rare | $8 |

\`\`\`md
| Joker | Rarity | Cost |
| --- | --- | --- |
| Mime | Uncommon | $5 |
\`\`\`

## Cards

Mention any card and readers can hover it to see its picture and effect: <Joker id="mime" />, <Tarot id="hierophant" />, <Planet id="jupiter" />, <Spectral id="cryptid" />, <Voucher id="overstock" />, <Enhancement id="steel" />, <Seal id="red" /> and <Deck id="red_deck" />.

\`\`\`mdx
<Joker id="mime" />, <Tarot id="hierophant" />, <Planet id="jupiter" />
\`\`\`

The easiest way is the **Cards** tab on the right: search for a card and click it.

**Keep your own wording.** Select some text first, then pick a card. The text stays exactly as you wrote it: <Joker id="oops_all_6s">Oops all 6's</Joker>, <Tarot id="hierophant">hiero</Tarot>.

\`\`\`mdx
<Joker id="oops_all_6s">Oops all 6's</Joker>, <Tarot id="hierophant">hiero</Tarot>
\`\`\`

**Multiplayer cards** have ids starting with \`mp_\`, like <Joker id="mp_pizza" /> and <Joker id="mp_defensive_joker" />.

### Card images

Add \`card\` to show the full card. Put several in a row with \`CardRow\`, for example as a tier:

<CardRow title="S">
  <Joker id="blueprint" card />
  <Joker id="brainstorm" card />
  <Joker id="mime" card />
</CardRow>

\`\`\`mdx
<CardRow title="S">
  <Joker id="blueprint" card />
  <Joker id="brainstorm" card />
</CardRow>
\`\`\`

### Playing cards

A playing card is written as rank and suit, with an optional enhancement and seal:

<PlayingCard card="KH" enhancement="steel" seal="red" /> <PlayingCard card="QS" /> <PlayingCard card="10D" enhancement="gold" />

\`\`\`mdx
<PlayingCard card="KH" enhancement="steel" seal="red" />
<PlayingCard card="QS" />
\`\`\`

## Skill levels

Mark a part of the guide as **beginner**, **intermediate** or **advanced** so readers can see at a glance what's aimed at their level. Select the text and use the **Blocks** tab.

<Level of="beginner">

### An example beginner section

This section is marked as beginner. Keep the empty lines inside the block so the formatting still works.

</Level>

\`\`\`mdx
<Level of="beginner">

### An example beginner section

Text for beginners.

</Level>
\`\`\`

## Notes and warnings

<Callout type="warn" title="A warning">
  Use callouts for things readers shouldn't miss. Types: \`info\`, \`warn\`, \`error\`.
</Callout>

\`\`\`mdx
<Callout type="warn" title="A warning">
  Text of the warning.
</Callout>
\`\`\`

## Calculators

Calculators let readers try their own numbers, like the yellow cells in a spreadsheet. Each \`Input\` has a short **name** that formulas use, and each \`Output\` shows the result of a formula.

<Calc id="example" title="Interest calculator">
  <Input name="money" label="Money at the end of the round" default={25} min={0} />
  <Input name="cap" label="Interest cap" default={5} min={0} options={[{ label: 'Normal ($5)', value: 5 }, { label: 'Seed Money ($10)', value: 10 }, { label: 'Money Tree ($20)', value: 20 }]} />
  <Output label="Interest earned" value="min(floor(money / 5), cap)" format="money" decimals={0} />
</Calc>

\`\`\`mdx
<Calc id="example" title="Interest calculator">
  <Input name="money" label="Money at the end of the round" default={25} min={0} />
  <Input name="cap" label="Interest cap" default={5} options={[{ label: 'Normal ($5)', value: 5 }, { label: 'Seed Money ($10)', value: 10 }]} />
  <Output label="Interest earned" value="min(floor(money / 5), cap)" format="money" decimals={0} />
</Calc>
\`\`\`

- **default** is the starting value; **min** and **max** are optional limits
- **options** turns an input into a dropdown; each option is a number
- **format** can be \`money\`, \`percent\` or left out for a plain number; **decimals** sets the precision
- With an **id**, readers get a "Copy link" button that shares their numbers

Readers can click **ƒx** on a result to see its formula.

### Formulas

Formulas work like spreadsheet formulas: \`+ - * /\`, \`^\` for powers, brackets, and comparisons like \`=\` and \`>\` that give 1 (true) or 0 (false).

| Function | Example | Means |
| --- | --- | --- |
| if | \`if(dice = 1, 2, 1)\` | 2 if dice is 1, otherwise 1 |
| min, max | \`min(money, 20)\` | the smaller / larger value |
| round, floor, ceil | \`round(x, 2)\` | round to 2 decimals / down / up |
| combin | \`combin(21, 5)\` | number of ways to pick 5 of 21 |
| sum, abs, sqrt | \`sum(a, b, c)\` | |

### Tables from a formula

A table where every cell comes from the same formula, so nobody types the numbers by hand:

<CalcTable caption="Interest by money and cap" value="min(floor(money / 5), cap)" rows={{ name: 'money', label: 'Money', from: 0, to: 30, step: 10 }} cols={{ name: 'cap', label: 'Cap', from: 5, to: 20, step: 5 }} format="money" decimals={0} />

\`\`\`mdx
<CalcTable
  caption="Interest by money and cap"
  value="min(floor(money / 5), cap)"
  rows={{ name: 'money', label: 'Money', from: 0, to: 30, step: 10 }}
  cols={{ name: 'cap', label: 'Cap', from: 5, to: 20, step: 5 }}
  format="money"
  decimals={0}
/>
\`\`\`

### A calculated number in a sentence

With $37 you earn <Value of="min(floor(money / 5), 5)" vars={{ money: 37 }} format="money" decimals={0} /> interest. The number is calculated, so it can't go out of date.

\`\`\`mdx
<Value of="min(floor(money / 5), 5)" vars={{ money: 37 }} format="money" decimals={0} />
\`\`\`

## Saving and publishing

- **Your draft saves automatically.** Readers never see the draft.
- **Problems** such as a misspelled card name appear in a red bar above the editor, with the line number. A guide with problems can't be published.
- **Publish** makes the current draft live. You can keep editing afterwards; changes go live the next time you publish.
- **History** lists every published version. Restore one to bring it back into your draft.
- **Settings** sets the guide's web address, its section in the sidebar and its order.
`;
