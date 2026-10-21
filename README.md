# BMP University

Guides for Balatro Multiplayer, with calculators that run right on the page.

```bash
npm install
npm run import-game   # card data + sprites from your Balatro install and the Multiplayer mod
npm run dev           # http://localhost:3000 — the studio is at /studio
npm test              # formula engine, guide validation and guide numbers
```

Locally, guides are stored in an embedded database in `.data/` (delete it to start over). On first start
the guides in `content/guides/` are imported into it.

## The studio (`/studio`)

The studio isn't linked from the site; go to `/studio` directly. Everyone signs in with Discord.

| Role | Can |
| --- | --- |
| Member (signed in, no role) | Request author access, make tier lists |
| Author | Create guides, and edit, publish or delete **their own** guides |
| Admin | Everything: all guides, approve/deny requests, change roles, card data, site settings |

- **Editing**: source on the left, live preview of the draft in the middle, card picker and blocks on the right.
  Drafts autosave and are never public; **Publish** makes the current draft live. Every published version is
  kept under **History** and can be restored.
- **Insert card** searches every card, including Multiplayer mod cards. Select text first to keep your own
  wording: selecting "hiero" and picking The Hierophant gives `<Tarot id="hierophant">hiero</Tarot>`.
- **Problems** (unknown card ids, broken formulas, disallowed markup) are listed with line numbers and block
  publishing until fixed.
- **Admin → Cards** changes how a card is shown (name, rarity, cost, effect text), e.g. for BMP balance changes.

In local development the login page also has "Sign in as test admin/author/member" buttons, so you can try
everything without a Discord app. They don't exist in production.

### Safety

Guides are written in the browser and rendered on the server, so every save is checked
([src/lib/mdx/validate.ts](src/lib/mdx/validate.ts)): no `{expressions}`, no `import`/`export`, only known
components and plain HTML tags, component props must be plain values, and links can't use `javascript:`.
The attack cases are in [compile.test.ts](src/lib/mdx/compile.test.ts).

## Deploying

See [DEPLOY.md](DEPLOY.md) for running it on an LXC container (or any Linux host) with Docker,
including Discord login, HTTPS, updates and backups.

## Game data and images

`npm run import-game` reads your own copy of the game (default Steam path, or pass the path to
`Balatro.exe`) and the installed Multiplayer mod (`%APPDATA%\Balatro\Mods\BalatroMultiplayer`, or set
`BMP_MOD_DIR`), and writes:

- `src/data/game.generated.json`: names, rarity, cost and the in-game effect text with its values filled in
- `public/game/<kind>/<id>.webp`: card sprites, plus playing card fronts in `public/game/card/`

Multiplayer mod cards use ids starting with `mp_` (`mp_pizza`, `mp_ticket` for the ruleset's Golden Ticket).
Values that depend on the run show as `?`; admins can fix them under **Admin → Cards**.

## Guide syntax

The full, live reference is at **/docs** on the site (authors and admins; it's also in the header when signed in). Its source is [content/docs/markup-reference.mdx](content/docs/markup-reference.mdx), and a test checks every example in it is valid.


```mdx
---
title: Reserved Parking
description: One sentence shown on the home page.
author: Your name
patch: 0.5.5          # BMP version the guide was checked against
tags: [econ, jokers]
---

## Normal Markdown headings, lists, **bold**, links…

<Joker id="mime" />                       inline name with sprite and hover card
<Joker id="oops_all_6s">Oops all 6’s</Joker>  keep your own wording
<Joker id="blueprint" card />             large card image
<Tarot id="hierophant" /> <Planet id="mercury" /> <Spectral id="cryptid" /> <Voucher id="overstock" />
<Enhancement id="steel" /> <Seal id="red" /> <Deck id="red_deck" />
<PlayingCard card="KH" enhancement="steel" seal="red" />

<CardRow title="S">
  <Joker id="blueprint" card />
  <Joker id="brainstorm" card />
</CardRow>
```

Ids are the card's name in lowercase with underscores (`mail_in_rebate`, `oops_all_6s`) or the game's own id
(`mail`, `oops`). **A wrong id blocks publishing**, so typos never go live.

### Tools

Tools are written and published exactly like guides (pick **Tool** as the type when creating one), but
live under `/tools/<name>` and get their own "Tools" section on the home page and in the sidebar. A guide can
show a published tool inline:

```mdx
<Tool id="interest-calculator" />
```

or pick it under **Blocks → Embed a tool** in the editor. The embed always shows the tool's latest published
version. Tools can't embed other tools, and embedding a tool that doesn't exist (or isn't published) blocks
publishing.

### Skill levels

Mark parts of a guide as `beginner`, `intermediate` or `advanced` (the editor's Blocks tab wraps the
selected text). Keep the blank lines so the Markdown inside still works:

```mdx
<Level of="beginner">

## How to play

…

</Level>
```

Each part gets a coloured badge and stripe, so readers can see at a glance what's aimed at their level.
It's purely informative: nothing is hidden.

New guides start with a tutorial that demonstrates every feature with its source
([src/lib/guide-template.ts](src/lib/guide-template.ts)).

### Calculators

```mdx
<Calc id="ev" title="Money calculator">
  <Input name="P" label="Copies of Parking" default={1} min={1} max={10} />
  <Input name="mode" label="Setup" default={0} options={[{ label: 'Raw', value: 0 }, { label: 'Dice', value: 1 }]} />
  <Output label="EV per card" value="if(mode = 1, P, P / 2)" format="money" />
</Calc>
```

- `id` enables the **Copy link** button, which shares the current inputs.
- `format`: `number` (default), `money` or `percent`; `decimals` sets the precision.
- Readers can click **ƒx** to see the formula behind any result.

Other blocks:

```mdx
<Value of="P * R / 2" vars={{ P: 3, R: 2 }} format="money" />   inline number in a sentence

<CalcTable value="P * R" rows={{ name: 'R', label: 'Triggers', from: 1, to: 7 }}
           cols={{ name: 'P', label: 'Copies', from: 1, to: 7 }} />
```

You can also use Fumadocs' built-in `<Callout>`, `<Cards>`, `<Tabs>` and `<Steps>`.

### Formula language

Spreadsheet-style: `+ - * / ^`, parentheses, comparisons `= <> < <= > >=` (they give 1 or 0), and
`if(cond, a, b)`, `min`, `max`, `sum`, `round(x, digits)`, `floor`, `ceil`, `abs`, `sqrt`, `exp`, `ln`, `log10`,
`combin(n, k)`, `and`, `or`, `not`. A formula that reads an input that doesn't exist blocks publishing.
