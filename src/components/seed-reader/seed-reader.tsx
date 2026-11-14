"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Children,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  type ShopItem,
  type ShopVoucher,
  shopConsumableQueue,
  shopQueue,
  standardPackQueue,
  tagQueue,
  voucherQueue,
} from "@/lib/seed/reader";
import {
  DECKS,
  type DeckId,
  findPatch,
  findRuleset,
  PATCHES,
  STAKES,
} from "@/lib/seed/rulesets";
import type { SeedArt } from "./art";
import {
  ArtContext,
  ItemCard,
  PlayingCardCard,
  useArt,
  VoucherTile,
} from "./seed-card";

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

/** Every enhancement that gates a joker (Glass Joker, Steel Joker, …): all read as present. */
const ALL_GATES = ["m_glass", "m_steel", "m_stone", "m_lucky", "m_gold"];

const RARITIES: [Rarity, string][] = [
  [4, "Legendary"],
  [3, "Rare"],
  [2, "Uncommon"],
  [1, "Common"],
];

const STEP = 30;
/** How far the seek box looks for a joker. */
const SEEK_SLOTS = 1000;

type Layout = "band" | "grid";
/** Band or grid, shared by every tab that lists cards. */
const LayoutContext = createContext<[Layout, (l: Layout) => void]>([
  "band",
  () => {},
]);

function LayoutToggle() {
  const [layout, setLayout] = useContext(LayoutContext);
  return (
    <Toggle
      value={layout}
      options={[
        ["band", "Band"],
        ["grid", "Grid"],
      ]}
      onChange={setLayout}
    />
  );
}

/** A queue of cards as a scrolling band or a wrapping grid, by the shared layout. */
function CardList({
  children,
  onMore,
  slots,
  jump,
  onJumped,
}: {
  children: ReactNode;
  onMore: () => void;
  slots?: number[];
  jump?: number;
  onJumped?: () => void;
}) {
  const [layout] = useContext(LayoutContext);
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (layout !== "grid" || jump === undefined) return;
    const el = gridRef.current?.querySelector(`[data-slot="${jump}"] > *`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    onJumped?.();
  });
  if (layout === "band")
    return (
      <Band
        onMore={onMore}
        slots={slots}
        jump={jump}
        onJumped={onJumped ?? (() => {})}
      >
        {children}
      </Band>
    );
  return (
    <div ref={gridRef} className="flex flex-col gap-4">
      <Grid>
        {Children.map(children, (child, i) => (
          <div className="contents" data-slot={slots?.[i]}>
            {child}
          </div>
        ))}
      </Grid>
      <More onClick={onMore} />
    </div>
  );
}

/** What the seek box looks for. */
const SEEK_KINDS = new Set(["joker", "tarot", "planet", "spectral"]);

/** A name for loose matching: lower case, no accents, letters and digits only. */
function normName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Cards in one row that scrolls sideways, with back and forward buttons; more load as you near
 * the end. The row reserves room above the cards for their hover cards, which a
 * scrolling box would otherwise cut off; that room lets clicks through to what's under it.
 */
function Band({
  children,
  onMore,
  jump,
  onJumped,
  slots,
}: {
  children: ReactNode;
  onMore: () => void;
  /** A slot number to scroll into view (its card has data-slot). */
  jump?: number;
  onJumped: () => void;
  /** Each card's slot number, for jump. */
  slots?: number[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Infinite scroll: ask for more once the end is near, once per length of the row.
  const askedAt = useRef(-1);
  const fill = () => {
    const el = ref.current;
    if (!el || el.scrollWidth === askedAt.current) return;
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 600) {
      askedAt.current = el.scrollWidth;
      onMore();
    }
  };
  // Also when the row is too short to scroll at all.
  useEffect(fill);
  useEffect(() => {
    if (jump === undefined) return;
    const el = ref.current?.querySelector(`[data-slot="${jump}"]`);
    if (!el) return;
    el.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
    onJumped();
  });
  const step = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };
  const arrow =
    "z-10 mb-[52px] flex size-9 shrink-0 items-center justify-center rounded-full border bg-fd-card shadow hover:bg-fd-accent";
  return (
    <div className="flex items-end gap-2">
      <button
        type="button"
        aria-label="Back"
        onClick={() => step(-1)}
        className={arrow}
      >
        <ChevronLeft className="size-5" />
      </button>
      <div
        ref={ref}
        onScroll={fill}
        className="pointer-events-none -mt-60 flex min-w-0 flex-1 items-end gap-2 overflow-x-auto pt-60 pb-3"
      >
        {Children.map(children, (child, i) => (
          <div className="pointer-events-auto shrink-0" data-slot={slots?.[i]}>
            {child}
          </div>
        ))}
      </div>
      <button
        type="button"
        aria-label="Forward"
        onClick={() => step(1)}
        className={arrow}
      >
        <ChevronRight className="size-5" />
      </button>
    </div>
  );
}

/** Shop items with their slot number (1-based). */
function numberSlots(items: ShopItem[]): { item: ShopItem; slot: number }[] {
  return items.map((item, i) => ({ item, slot: i + 1 }));
}

/** The shop-changing vouchers as base → upgrade, like the Shop slot odds tool shows them. */
const VOUCHER_PAIRS: [ShopVoucher, ShopVoucher][] = [
  ["v_tarot_merchant", "v_tarot_tycoon"],
  ["v_planet_merchant", "v_planet_tycoon"],
  ["v_magic_trick", "v_illusion"],
  ["v_hone", "v_glow_up"],
];

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
  const [vouchers, setVouchers] = useState<
    Partial<Record<ShopVoucher, number>>
  >({});
  // An upgrade needs its base: buying it buys the base too, and dropping the base drops both.
  const toggleVoucher = (v: ShopVoucher) =>
    setVouchers((prev) => {
      const next = { ...prev };
      const pair = VOUCHER_PAIRS.find((p) => p.includes(v));
      if (!pair) return next;
      const [base, upgrade] = pair;
      if (next[v] !== undefined) {
        delete next[v];
        if (v === base) delete next[upgrade];
      } else {
        next[v] = next[base] ?? 1;
        if (v === upgrade && next[base] === undefined) next[base] = 1;
      }
      return next;
    });
  const [shops, setShops] = useState(8);
  const [jokersOnly, setJokersOnly] = useState(false);
  /** A slot to bring into view (the seek box's "Go there"). */
  const [jump, setJump] = useState<number | undefined>();
  /** Which of the sought card's slots the seek buttons last went to. */
  const [seekAt, setSeekAt] = useState({ key: "", i: -1 });
  const [seek, setSeek] = useState("");
  const mods = useMemo(() => ({ vouchers }), [vouchers]);
  const items = useMemo(
    () => numberSlots(shopQueue(settings, count, mods)),
    [settings, count, mods],
  );
  // Everything the shop can roll by name, for the seek box.
  const seekable = useMemo(
    () =>
      Object.entries(art.items)
        .filter(([, it]) => SEEK_KINDS.has(it.kind))
        .map(([key, it]) => ({ key, name: it.name, norm: normName(it.name) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [art],
  );
  // Loose matching: "family" finds The Family. An exact name, or the only match, is picked.
  const query = normName(seek);
  const matches = query ? seekable.filter((x) => x.norm.includes(query)) : [];
  const picked =
    matches.find((x) => x.norm === query || x.norm === `the${query}`) ??
    (matches.length === 1 ? matches[0] : undefined);
  const seekKey = picked?.key;
  // Where it shows up in the shop, looking well past what's on screen.
  const seekSlots = useMemo(() => {
    if (!seekKey) return [];
    return numberSlots(shopQueue(settings, SEEK_SLOTS, mods))
      .filter(({ item }) => item.kind !== "card" && item.key === seekKey)
      .map(({ slot }) => slot);
  }, [settings, mods, seekKey]);
  // Bring the i-th slot with the sought card into view (wrapping round after the last).
  const goTo = (i: number) => {
    if (!seekKey || seekSlots.length === 0) return;
    const at = i % seekSlots.length;
    const slot = seekSlots[at];
    setSeekAt({ key: seekKey, i: at });
    setCount((c) => Math.max(c, Math.ceil(slot / STEP) * STEP));
    setJump(slot);
  };
  const shown = items.filter(
    ({ item }) => !jokersOnly || item.kind === "joker",
  );
  const packs = useMemo(() => packQueue(settings, shops), [settings, shops]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-xl border bg-fd-card p-3 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-fd-muted-foreground">
          Unlocked Vouchers
        </span>
        <div className="flex flex-wrap gap-x-4 gap-y-3">
          {VOUCHER_PAIRS.map(([base, upgrade]) => (
            <div key={base} className="flex items-start gap-1">
              {[base, upgrade].map((v, i) => (
                <div key={v} className="flex items-start gap-1">
                  {i === 1 && (
                    <ChevronRight className="mt-12 size-4 text-fd-muted-foreground" />
                  )}
                  <VoucherTile
                    itemKey={v}
                    on={vouchers[v] !== undefined}
                    onClick={() => toggleVoucher(v)}
                  >
                    {vouchers[v] !== undefined && (
                      <label className="flex items-center gap-1 text-[10px] font-normal">
                        from slot
                        <input
                          type="number"
                          min={1}
                          inputMode="numeric"
                          value={vouchers[v]}
                          onChange={(e) => {
                            const n = Math.max(
                              1,
                              Number.parseInt(e.target.value, 10) || 1,
                            );
                            setVouchers((prev) => ({ ...prev, [v]: n }));
                          }}
                          className="w-12 rounded border bg-fd-background px-1 py-0.5"
                        />
                      </label>
                    )}
                  </VoucherTile>
                </div>
              ))}
            </div>
          ))}
        </div>
        <span className="text-fd-muted-foreground">
          Click the vouchers you've unlocked.
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={jokersOnly}
            onChange={(e) => setJokersOnly(e.target.checked)}
          />
          Jokers only
        </label>
        <LayoutToggle />
        <label className="flex items-center gap-2">
          Seek
          <input
            value={seek}
            onChange={(e) => setSeek(e.target.value)}
            placeholder="a joker or consumable, e.g. family"
            className="w-64 rounded-lg border bg-fd-background px-3 py-1.5"
          />
        </label>
        {query && !picked && (
          <span className="flex flex-wrap items-center gap-1">
            {matches.length === 0
              ? "No card by that name."
              : matches.slice(0, 8).map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setSeek(m.name)}
                    className="rounded-full border px-2 py-0.5 text-xs hover:bg-fd-accent"
                  >
                    {m.name}
                  </button>
                ))}
            {matches.length > 8 && `and ${matches.length - 8} more`}
          </span>
        )}
        {picked && (
          <span>
            <b>{picked.name}</b>
            {seekSlots.length === 0 ? (
              `: not in the first ${SEEK_SLOTS} shop slots.`
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => goTo(0)}
                  className="ml-2 rounded border px-2 py-0.5 hover:bg-fd-accent"
                >
                  Go first
                </button>
                <button
                  type="button"
                  onClick={() =>
                    goTo(seekAt.key === seekKey ? seekAt.i + 1 : 0)
                  }
                  className="ml-2 rounded border px-2 py-0.5 hover:bg-fd-accent"
                >
                  Go next
                </button>
              </>
            )}
          </span>
        )}
      </div>
      {(() => {
        const cards = shown.map(({ item, slot }, i) => {
          const found =
            seekKey !== undefined &&
            item.kind !== "card" &&
            item.key === seekKey;
          if (item.kind === "joker")
            return (
              <ItemCard
                // biome-ignore lint/suspicious/noArrayIndexKey: slots are positional
                key={i}
                itemKey={item.key}
                edition={item.edition}
                stickers={item.stickers}
                index={slot}
                highlight={found}
              />
            );
          if (item.kind === "consumable")
            return (
              <ItemCard
                // biome-ignore lint/suspicious/noArrayIndexKey: slots are positional
                key={i}
                itemKey={item.key}
                index={slot}
                highlight={found}
              />
            );
          return (
            <PlayingCardCard
              // biome-ignore lint/suspicious/noArrayIndexKey: slots are positional
              key={i}
              card={item.card}
              enhancement={item.enhancement}
              edition={item.edition}
              index={slot}
            />
          );
        });
        return (
          <CardList
            onMore={() => setCount((c) => c + STEP)}
            slots={shown.map((x) => x.slot)}
            jump={jump}
            onJumped={() => setJump(undefined)}
          >
            {cards}
          </CardList>
        );
      })()}

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
  const [count, setCount] = useState(STEP);
  const list = useMemo(
    () => jokerQueue(settings, rarity, count, editionRate),
    [settings, rarity, count, editionRate],
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
        <LayoutToggle />
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
      </div>
      <CardList onMore={() => setCount((c) => c + STEP)}>
        {shown.map(({ j, index }) => (
          <ItemCard
            key={index}
            itemKey={j.key}
            edition={j.edition}
            stickers={j.stickers}
            index={index}
          />
        ))}
      </CardList>
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
        <LayoutToggle />
        {source === "standard" && (
          <Toggle
            value={editionRate}
            options={EDITION_VOUCHERS}
            onChange={setEditionRate}
          />
        )}
      </div>
      <CardList onMore={() => setCount((c) => c + STEP)}>
        {list.map((c, i) => (
          <PlayingCardCard
            // biome-ignore lint/suspicious/noArrayIndexKey: queue positions
            key={i}
            card={c.card}
            enhancement={c.enhancement}
            edition={c.edition}
            seal={c.seal}
            index={i + 1}
            note={c.slot ? `slot ${c.slot}` : c.giga ? "Giga Pack" : undefined}
          />
        ))}
      </CardList>
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
      <div className="flex flex-wrap items-center gap-3">
        <Toggle
          value={where}
          options={[
            ["shop", "In the shop"],
            ["pack", `In ${pack} Packs`],
          ]}
          onChange={setWhere}
        />
        <LayoutToggle />
      </div>
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
      <CardList onMore={() => setCount((c) => c + STEP)}>
        {list.map((key, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: queue positions
          <ItemCard key={i} itemKey={key} index={i + 1} />
        ))}
      </CardList>
    </div>
  );
}

function VouchersTab({ settings }: { settings: ReaderSettings }) {
  const [buyAll, setBuyAll] = useState(false);
  // "ante:key" of each voucher marked as bought.
  const [bought, setBought] = useState<Set<string>>(() => new Set());
  const [antes, setAntes] = useState(16);
  const list = useMemo(
    () =>
      voucherQueue(
        settings,
        antes,
        buyAll || ((ante, key) => bought.has(`${ante}:${key}`)),
      ),
    [settings, antes, buyAll, bought],
  );
  const toggle = (id: string) =>
    setBought((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <div className="flex flex-col gap-4">
      <Toggle
        value={buyAll ? "all" : "none"}
        options={[
          ["none", "Buying what you click"],
          ["all", "Buying every one"],
        ]}
        onChange={(v) => setBuyAll(v === "all")}
      />
      <Note>
        The vouchers each ante's shop offers
        {settings.deck === "violet" ? " (two, on Violet Deck)" : ""}. They're
        rolled when the ante starts, so the shop after a boss already shows the
        next ante's. Each pair (a voucher and its upgrade) is one slot: it holds
        the upgrade once you own the base, and a pair you own both of is
        skipped, so click what you bought to see what comes after. A Voucher Tag
        takes the next one from this list.
      </Note>
      <div className="flex flex-wrap gap-3">
        {list.map((offers, i) => {
          const ante = i + 1;
          return (
            <div
              key={ante}
              className="flex flex-col items-center gap-1 rounded-xl border bg-fd-card p-2"
            >
              <span className="text-xs font-semibold">Ante {ante}</span>
              <div className="flex gap-2">
                {offers.length === 0 && (
                  <span className="text-xs text-fd-muted-foreground">
                    none left
                  </span>
                )}
                {offers.map((v) => (
                  <VoucherTile
                    key={v}
                    itemKey={v}
                    on={buyAll || bought.has(`${ante}:${v}`)}
                    onClick={() => {
                      if (!buyAll) toggle(`${ante}:${v}`);
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
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
  const [deckId, setDeckId] = useState<DeckId | "">("");
  const [layout, setLayout] = useState<Layout>("band");
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
    const d = params.get("deck");
    if (DECKS.some((x) => x.id === d)) setDeckId(d as DeckId);
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
    if (deckId) url.searchParams.set("deck", deckId);
    else url.searchParams.delete("deck");
    window.history.replaceState(null, "", url);
  }, [seed, stake, rulesetId, deckId]);

  const patch = findPatch(patchId);
  const ruleset = findRuleset(patch, rulesetId);
  // Only the stakes this ruleset's ranked queue plays on; an unlisted one falls back to the first.
  const stakes = STAKES.filter(
    (x) => !ruleset.stakes || ruleset.stakes.includes(x.id),
  );
  const activeStake = stakes.some((x) => x.id === stake) ? stake : stakes[0].id;
  // Only decks this ruleset allows; one it doesn't falls back to "any other deck".
  const decks = DECKS.filter((d) => ruleset.decks.includes(d.id));
  const deck = decks.some((d) => d.id === deckId)
    ? (deckId as DeckId)
    : undefined;
  const settings = useMemo<ReaderSettings>(
    () => ({
      seed,
      ruleset,
      gameMode: patch.gameMode,
      stake: activeStake,
      deck,
      // Jokers that need something first (Glass Joker needs a Glass Card, Penny Pincher a
      // PvP blind) are always read as in the pool.
      enhancements: ALL_GATES,
      pincherUnlocked: true,
    }),
    [seed, ruleset, patch.gameMode, activeStake, deck],
  );

  return (
    <ArtContext value={art}>
      <LayoutContext value={[layout, setLayout]}>
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
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold">Deck</span>
              <select
                value={deck ?? ""}
                onChange={(e) => setDeckId(e.target.value as DeckId | "")}
                className="rounded-lg border bg-fd-background px-3 py-2"
              >
                <option value="">Any other deck</option>
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.effect})
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
              <section
                key={`${tab}:${seed}:${activeStake}:${ruleset.id}:${deck}`}
              >
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
      </LayoutContext>
    </ArtContext>
  );
}
