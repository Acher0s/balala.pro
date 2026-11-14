"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  certificateQueue,
  illusionQueue,
  jokerQueue,
  judgementRarities,
  luckyQueue,
  magicTrickQueue,
  PACK_SIZES,
  packConsumableQueue,
  packQueue,
  type Rarity,
  type ReaderSettings,
  SHOP_VOUCHERS,
  type ShopVoucher,
  shopConsumableQueue,
  shopQueue,
  standardPackQueue,
  tagQueue,
  voucherQueue,
} from "@/lib/seed/reader";
import { findPatch, findRuleset, PATCHES, STAKES } from "@/lib/seed/rulesets";
import type { SeedArt } from "./art";
import { ArtContext, ItemCard, PlayingCardCard, useArt } from "./seed-card";

const TABS = [
  ["shop", "Shop"],
  ["jokers", "Jokers"],
  ["cards", "Playing cards"],
  ["tarots", "Tarots"],
  ["planets", "Planets"],
  ["spectrals", "Spectrals"],
  ["vouchers", "Vouchers"],
  ["tags", "Skip tags"],
  ["judgement", "Judgement"],
  ["lucky", "Lucky Cards"],
] as const;
type Tab = (typeof TABS)[number][0];

const RARITIES: [Rarity, string][] = [
  [4, "Legendary"],
  [3, "Rare"],
  [2, "Uncommon"],
  [1, "Common"],
];

const STEP = 30;

/** A seed as the game accepts one: up to 8 letters and digits, upper case. */
function cleanSeed(input: string) {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

function Toggle<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border bg-fd-card p-0.5">
      {options.map(([v, label]) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-md px-3 py-1 text-sm ${
            v === value
              ? "bg-fd-primary text-fd-primary-foreground"
              : "text-fd-muted-foreground hover:text-fd-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-x-2 gap-y-3">{children}</div>;
}

function More({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start rounded-lg border px-3 py-1.5 text-sm hover:bg-fd-accent"
    >
      Show {STEP} more
    </button>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="max-w-3xl text-sm text-fd-muted-foreground">{children}</p>
  );
}

// ---------------------------------------------------------------------------
// Tabs

function ShopTab({ settings }: { settings: ReaderSettings }) {
  const art = useArt();
  const [count, setCount] = useState(STEP);
  const [ghost, setGhost] = useState(false);
  const [pincherFrom, setPincherFrom] = useState<number | undefined>();
  const [vouchers, setVouchers] = useState<
    Partial<Record<ShopVoucher, number>>
  >({});
  const [shops, setShops] = useState(8);
  const items = useMemo(
    () =>
      shopQueue(settings, count, { ghostDeck: ghost, vouchers, pincherFrom }),
    [settings, count, ghost, vouchers, pincherFrom],
  );
  const packs = useMemo(() => packQueue(settings, shops), [settings, shops]);

  return (
    <div className="flex flex-col gap-4">
      <Note>
        Every card the shop rolls, in order, across shops and rerolls: two per
        shop, one more per reroll. Jokers come from the same queues as Buffoon
        Packs, so opening one moves the shop's jokers on, and a card you already
        have (or that's on screen) is skipped.
      </Note>
      <details className="rounded-xl border bg-fd-card p-3">
        <summary className="cursor-pointer text-sm font-semibold">
          Deck and vouchers that change the shop
        </summary>
        <div className="mt-3 flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={ghost}
              onChange={(e) => setGhost(e.target.checked)}
            />
            {art.items.b_ghost?.name ?? "Ghost Deck"}: Spectral cards in the
            shop
          </label>
          {settings.ruleset.pennyPincher && (
            <label className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                inputMode="numeric"
                placeholder="–"
                value={pincherFrom ?? ""}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  setPincherFrom(Number.isFinite(n) && n > 0 ? n : undefined);
                }}
                className="w-16 rounded border bg-fd-background px-2 py-1"
              />
              First shop slot after your first PvP blind (Penny Pincher can show
              up from there)
            </label>
          )}
          <p className="text-fd-muted-foreground">
            Bought from shop slot… (leave empty if you don't have it)
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {SHOP_VOUCHERS.map((v) => (
              <label key={v} className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  placeholder="–"
                  value={vouchers[v] ?? ""}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    setVouchers((prev) => {
                      const next = { ...prev };
                      if (Number.isFinite(n) && n > 0) next[v] = n;
                      else delete next[v];
                      return next;
                    });
                  }}
                  className="w-16 rounded border bg-fd-background px-2 py-1"
                />
                {art.items[v]?.name ?? v}
              </label>
            ))}
          </div>
        </div>
      </details>
      <Grid>
        {items.map((item, i) => {
          const index = i + 1;
          if (item.kind === "joker")
            return (
              <ItemCard
                // biome-ignore lint/suspicious/noArrayIndexKey: slots are positional
                key={i}
                itemKey={item.key}
                edition={item.edition}
                stickers={item.stickers}
                index={index}
              />
            );
          if (item.kind === "consumable")
            // biome-ignore lint/suspicious/noArrayIndexKey: slots are positional
            return <ItemCard key={i} itemKey={item.key} index={index} />;
          return (
            <PlayingCardCard
              // biome-ignore lint/suspicious/noArrayIndexKey: slots are positional
              key={i}
              card={item.card}
              enhancement={item.enhancement}
              edition={item.edition}
              index={index}
            />
          );
        })}
      </Grid>
      <More onClick={() => setCount((c) => c + STEP)} />

      <h2 className="mt-4 text-lg font-semibold">Booster packs</h2>
      <Note>
        Two packs per shop you visit. The first shop's first pack is always a
        Buffoon Pack.
      </Note>
      <div className="flex flex-wrap gap-4">
        {packs.map((pair, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: shops are positional
            key={i}
            className="flex flex-col items-center gap-1 rounded-xl border bg-fd-card p-2"
          >
            <span className="text-xs font-semibold">Shop {i + 1}</span>
            <div className="flex gap-2">
              {pair.map((p, j) => (
                <ItemCard
                  // biome-ignore lint/suspicious/noArrayIndexKey: packs are positional
                  key={j}
                  itemKey={p}
                  note={`${PACK_SIZES[p]?.size ?? "?"} cards`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <More onClick={() => setShops((c) => c + 8)} />
    </div>
  );
}

const EDITION_VOUCHERS: readonly (readonly [number, string])[] = [
  [1, "No edition voucher"],
  [2, "Hone"],
  [4, "Glow Up"],
];

function JokersTab({ settings }: { settings: ReaderSettings }) {
  const [rarity, setRarity] = useState<Rarity>(1);
  const [hideStickered, setHideStickered] = useState(false);
  const [editionRate, setEditionRate] = useState(1);
  const [pincher, setPincher] = useState(false);
  const [count, setCount] = useState(STEP);
  const list = useMemo(
    () =>
      jokerQueue(
        { ...settings, pincherUnlocked: pincher },
        rarity,
        count,
        editionRate,
      ),
    [settings, rarity, count, editionRate, pincher],
  );
  // Stickers only exist from Black Stake up, and never on legendaries.
  const canFilter = rarity !== 4 && settings.stake >= 4;
  const shown = list
    .map((j, i) => ({ j, index: i + 1 }))
    .filter(({ j }) => !(canFilter && hideStickered && j.stickerQueue));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Toggle value={rarity} options={RARITIES} onChange={setRarity} />
        <Toggle
          value={editionRate}
          options={EDITION_VOUCHERS}
          onChange={setEditionRate}
        />
        {canFilter && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hideStickered}
              onChange={(e) => setHideStickered(e.target.checked)}
            />
            Hide jokers that rolled a sticker
          </label>
        )}
        {settings.ruleset.pennyPincher && rarity === 1 && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={pincher}
              onChange={(e) => setPincher(e.target.checked)}
            />
            After the first PvP blind (Penny Pincher in the pool)
          </label>
        )}
      </div>
      <Note>
        {rarity === 4
          ? "The Soul's legendaries, in order."
          : "Every joker of this rarity the shop and Buffoon Packs give, in order, with the stickers it gets. Under The Order a joker that rolls a sticker comes from a separate queue, so hiding those shows the stickerless queue on its own: the one Judgement, Riff-raff and the Uncommon/Rare Tags take from."}{" "}
        Hone and Glow Up make Foil, Holographic and Polychrome more likely (not
        Negative), so some jokers gain an edition, but which joker comes next
        doesn't change.
      </Note>
      <Grid>
        {shown.map(({ j, index }) => (
          <ItemCard
            key={index}
            itemKey={j.key}
            edition={j.edition}
            stickers={j.stickers}
            index={index}
          />
        ))}
      </Grid>
      <More onClick={() => setCount((c) => c + STEP)} />
    </div>
  );
}

const CARD_SOURCES = [
  ["standard", "Standard Packs"],
  ["magic", "Shop (Magic Trick)"],
  ["illusion", "Shop (Illusion)"],
  ["certificate", "Certificate"],
] as const;
type CardSource = (typeof CARD_SOURCES)[number][0];

function CardsTab({ settings }: { settings: ReaderSettings }) {
  const [source, setSource] = useState<CardSource>("standard");
  const [editionRate, setEditionRate] = useState(1);
  const [count, setCount] = useState(STEP);
  const list = useMemo(() => {
    if (source === "standard")
      return standardPackQueue(settings, count, editionRate);
    if (source === "magic") return magicTrickQueue(settings, count);
    if (source === "illusion")
      // Read enough shop slots to find this many playing cards (about 1 in 8 slots).
      return illusionQueue(settings, count * 16).slice(0, count);
    return certificateQueue(settings, count);
  }, [settings, source, count, editionRate]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Toggle value={source} options={CARD_SOURCES} onChange={setSource} />
        {source === "standard" && (
          <Toggle
            value={editionRate}
            options={EDITION_VOUCHERS}
            onChange={setEditionRate}
          />
        )}
      </div>
      <Note>
        {source === "standard" &&
          "Cards shown in Standard Packs, one after another across packs. Hone and Glow Up make editions more likely here; the cards, seals and enhancements stay the same."}
        {source === "magic" &&
          "The playing cards the shop rolls with Magic Trick, in order: plain cards, with no enhancement or edition. Hone and Glow Up don't change them."}
        {source === "illusion" &&
          "The playing cards the shop rolls with Magic Trick and Illusion from the first slot, and the shop slot each one is in. Illusion rolls on every shop slot, so these depend on the whole shop (see the Shop tab for vouchers bought later). Its editions are guaranteed rolls, so Hone and Glow Up don't change them."}
        {source === "certificate" &&
          "The card each Certificate adds, in order, with its seal. Hone and Glow Up don't change them."}
      </Note>
      <Grid>
        {list.map((c, i) => (
          <PlayingCardCard
            // biome-ignore lint/suspicious/noArrayIndexKey: queue positions
            key={i}
            card={c.card}
            enhancement={c.enhancement}
            edition={c.edition}
            seal={c.seal}
            index={i + 1}
            note={c.slot ? `slot ${c.slot}` : undefined}
          />
        ))}
      </Grid>
      <More onClick={() => setCount((c) => c + STEP)} />
    </div>
  );
}

function ConsumableTab({
  settings,
  set,
}: {
  settings: ReaderSettings;
  set: "Tarot" | "Planet" | "Spectral";
}) {
  const [where, setWhere] = useState<"shop" | "pack">("shop");
  const [count, setCount] = useState(STEP);
  const list = useMemo(
    () =>
      where === "shop"
        ? shopConsumableQueue(settings, set, count)
        : packConsumableQueue(settings, set, count),
    [settings, set, where, count],
  );
  const pack = { Tarot: "Arcana", Planet: "Celestial", Spectral: "Spectral" }[
    set
  ];
  return (
    <div className="flex flex-col gap-4">
      <Toggle
        value={where}
        options={[
          ["shop", "In the shop"],
          ["pack", `In ${pack} Packs`],
        ]}
        onChange={setWhere}
      />
      <Note>
        {where === "shop"
          ? `${set} cards the shop rolls, in order. ${
              {
                Tarot:
                  "The Emperor, Purple Seals, Cartomancer and Hallucination take theirs from this queue too.",
                Planet:
                  "The High Priestess and Blue Seals take theirs from this queue too.",
                Spectral:
                  "Sixth Sense and Séance take theirs from this queue too.",
              }[set]
            }`
          : `Cards shown in ${pack} Packs, one after another across packs.${
              set === "Planet"
                ? " Each card can be Black Hole instead."
                : set === "Spectral"
                  ? " Each card can be The Soul or Black Hole instead."
                  : " Each card can be The Soul instead."
            }`}
        {set === "Planet" &&
          " Planet X, Ceres and Eris are left out: they only show up once you've played their hand."}
        {set === "Spectral" &&
          " On Ghost Deck, Hex is skipped while you hold the one it starts with."}
      </Note>
      <Grid>
        {list.map((key, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: queue positions
          <ItemCard key={i} itemKey={key} index={i + 1} />
        ))}
      </Grid>
      <More onClick={() => setCount((c) => c + STEP)} />
    </div>
  );
}

function VouchersTab({ settings }: { settings: ReaderSettings }) {
  const [buyAll, setBuyAll] = useState(false);
  const [antes, setAntes] = useState(16);
  const list = useMemo(
    () => voucherQueue(settings, antes, buyAll),
    [settings, antes, buyAll],
  );
  return (
    <div className="flex flex-col gap-4">
      <Toggle
        value={buyAll ? "all" : "none"}
        options={[
          ["none", "Buying none"],
          ["all", "Buying every one"],
        ]}
        onChange={(v) => setBuyAll(v === "all")}
      />
      <Note>
        The voucher in each ante's shop. Each pair (a voucher and its upgrade)
        is one slot: it holds the upgrade once you own the base, and a pair you
        own both of is skipped, so what you buy changes what comes later. A
        Voucher Tag takes the next one from this list.
      </Note>
      <Grid>
        {list.map((v, i) =>
          v ? (
            <ItemCard
              // biome-ignore lint/suspicious/noArrayIndexKey: antes are positional
              key={i}
              itemKey={v}
              note={`Ante ${i + 1}`}
            />
          ) : null,
        )}
      </Grid>
      <More onClick={() => setAntes((c) => c + 8)} />
    </div>
  );
}

function TagsTab({ settings }: { settings: ReaderSettings }) {
  const [antes, setAntes] = useState(8);
  const list = useMemo(() => tagQueue(settings, antes), [settings, antes]);
  return (
    <div className="flex flex-col gap-4">
      <Note>
        The tag for skipping each ante's Small and Big Blind. These are rolled
        per ante, so they don't depend on what you did before.
      </Note>
      <div className="flex flex-wrap gap-3">
        {list.map((t) => (
          <div
            key={t.ante}
            className="flex flex-col items-center gap-1 rounded-xl border bg-fd-card p-2"
          >
            <span className="text-xs font-semibold">Ante {t.ante}</span>
            <div className="flex gap-1">
              <ItemCard itemKey={t.small} note="Small" />
              <ItemCard itemKey={t.big} note="Big" />
            </div>
          </div>
        ))}
      </div>
      <More onClick={() => setAntes((c) => c + 8)} />
    </div>
  );
}

const RARITY_STYLE: Record<Rarity, [string, string]> = {
  1: ["Common", "#009dff"],
  2: ["Uncommon", "#4bc292"],
  3: ["Rare", "#fe5f55"],
  4: ["Legendary", "#b26cbb"],
};

function JudgementTab({ settings }: { settings: ReaderSettings }) {
  const [count, setCount] = useState(STEP);
  const list = useMemo(
    () => judgementRarities(settings, count),
    [settings, count],
  );
  return (
    <div className="flex flex-col gap-4">
      <Note>
        On Black Stake and up, The Order gives Judgement its own rarity roll:
        this is the rarity of each Judgement you use, in order. The joker itself
        is the next one in that rarity's stickerless queue.
        {settings.stake < 4 &&
          " Below Black Stake (as now), Judgement rolls its rarity like the shop does, so this list doesn't apply."}
      </Note>
      <ol
        className={`flex flex-wrap gap-2 ${settings.stake < 4 ? "opacity-40" : ""}`}
      >
        {list.map((r, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: queue positions
            key={i}
            className="flex flex-col items-center rounded-lg px-2 py-1 text-xs font-bold text-white"
            style={{ background: RARITY_STYLE[r][1] }}
          >
            <span className="font-mono opacity-80">#{i + 1}</span>
            {RARITY_STYLE[r][0]}
          </li>
        ))}
      </ol>
      <More onClick={() => setCount((c) => c + STEP)} />
    </div>
  );
}

function LuckyTab({ settings }: { settings: ReaderSettings }) {
  const [oops, setOops] = useState(0);
  const [count, setCount] = useState(60);
  const list = useMemo(
    () => luckyQueue(settings, count, oops),
    [settings, count, oops],
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm">Oops! All 6s:</span>
        <Toggle
          value={oops}
          options={[
            [0, "None"],
            [1, "1"],
            [2, "2"],
          ]}
          onChange={setOops}
        />
      </div>
      <Note>
        Each Lucky Card that scores rolls for +20 Mult (1 in 5) and for $20 (1
        in 15), each from its own queue. These are the rolls in order, for the
        whole game.
      </Note>
      <ol className="grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-1.5">
        {list.map((r, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: queue positions
            key={i}
            className="flex flex-col items-center rounded-lg border bg-fd-card py-1 text-xs"
          >
            <span className="font-mono text-fd-muted-foreground">#{i + 1}</span>
            <span
              className="font-bold"
              style={{
                color: r.mult ? "#fe5f55" : undefined,
                opacity: r.mult ? 1 : 0.25,
              }}
            >
              +Mult
            </span>
            <span
              className="font-bold"
              style={{
                color: r.money ? "#f3b958" : undefined,
                opacity: r.money ? 1 : 0.25,
              }}
            >
              $20
            </span>
          </li>
        ))}
      </ol>
      <More onClick={() => setCount((c) => c + 60)} />
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * The seed reader: type a seed and see what it rolls, queue by queue. Everything is worked out
 * here in the browser from src/lib/seed; the seed is kept in the address (?seed=) to share.
 */
export function SeedReader({ art }: { art: SeedArt }) {
  const [seed, setSeed] = useState("");
  const [patchId, setPatchId] = useState(PATCHES[0].id);
  const [rulesetId, setRulesetId] = useState(PATCHES[0].rulesets[0].id);
  const [stake, setStake] = useState(1);
  const [tab, setTab] = useState<Tab>("shop");

  // Read the seed from the address once, and keep it there as it changes.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = cleanSeed(params.get("seed") ?? "");
    if (s) setSeed(s);
    const st = Number(params.get("stake"));
    if (STAKES.some((x) => x.id === st)) setStake(st);
    const r = params.get("ruleset");
    if (r) setRulesetId(r);
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (seed) url.searchParams.set("seed", seed);
    else url.searchParams.delete("seed");
    if (stake > 1) url.searchParams.set("stake", String(stake));
    else url.searchParams.delete("stake");
    if (rulesetId !== PATCHES[0].rulesets[0].id)
      url.searchParams.set("ruleset", rulesetId);
    else url.searchParams.delete("ruleset");
    window.history.replaceState(null, "", url);
  }, [seed, stake, rulesetId]);

  const patch = findPatch(patchId);
  const ruleset = findRuleset(patch, rulesetId);
  // Only the stakes this ruleset's ranked queue plays on; an unlisted one falls back to the first.
  const stakes = STAKES.filter(
    (x) => !ruleset.stakes || ruleset.stakes.includes(x.id),
  );
  const activeStake = stakes.some((x) => x.id === stake) ? stake : stakes[0].id;
  const settings = useMemo<ReaderSettings>(
    () => ({ seed, ruleset, gameMode: patch.gameMode, stake: activeStake }),
    [seed, ruleset, patch.gameMode, activeStake],
  );

  return (
    <ArtContext value={art}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-fd-card p-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Seed</span>
            <input
              value={seed}
              onChange={(e) => setSeed(cleanSeed(e.target.value))}
              placeholder="e.g. 6EQHIH19"
              spellCheck={false}
              autoComplete="off"
              className="w-40 rounded-lg border bg-fd-background px-3 py-2 font-mono text-lg uppercase tracking-widest"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Version</span>
            <select
              value={patch.id}
              onChange={(e) => setPatchId(e.target.value)}
              className="rounded-lg border bg-fd-background px-3 py-2"
            >
              {PATCHES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Ruleset</span>
            <select
              value={ruleset.id}
              onChange={(e) => setRulesetId(e.target.value)}
              className="rounded-lg border bg-fd-background px-3 py-2"
            >
              {patch.rulesets.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} (ranked)
                </option>
              ))}
            </select>
          </label>
          <label
            className="flex items-center gap-2 py-2 text-sm"
            title="Only The Order is supported for now"
          >
            <input type="checkbox" checked disabled />
            The Order
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Stake</span>
            <select
              value={activeStake}
              onChange={(e) => setStake(Number(e.target.value))}
              className="rounded-lg border bg-fd-background px-3 py-2"
            >
              {stakes.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {seed ? (
          <>
            <nav className="flex flex-wrap gap-1 border-b pb-2">
              {TABS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    tab === id
                      ? "bg-fd-primary text-fd-primary-foreground"
                      : "text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
            <section key={`${tab}:${seed}:${activeStake}:${ruleset.id}`}>
              {tab === "shop" && <ShopTab settings={settings} />}
              {tab === "jokers" && <JokersTab settings={settings} />}
              {tab === "cards" && <CardsTab settings={settings} />}
              {tab === "tarots" && (
                <ConsumableTab settings={settings} set="Tarot" />
              )}
              {tab === "planets" && (
                <ConsumableTab settings={settings} set="Planet" />
              )}
              {tab === "spectrals" && (
                <ConsumableTab settings={settings} set="Spectral" />
              )}
              {tab === "vouchers" && <VouchersTab settings={settings} />}
              {tab === "tags" && <TagsTab settings={settings} />}
              {tab === "judgement" && <JudgementTab settings={settings} />}
              {tab === "lucky" && <LuckyTab settings={settings} />}
            </section>
          </>
        ) : (
          <Note>Type a seed to see what it rolls.</Note>
        )}
      </div>
    </ArtContext>
  );
}
