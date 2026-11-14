import { describe, expect, it } from "vitest";
import game from "@/data/game.generated.json";
import match from "./fixtures/fzzuajbr-expanded.json";
import {
  packQueue,
  type ReaderSettings,
  type ShopItem,
  ShopSim,
  voucherQueue,
} from "./reader";
import { PATCHES } from "./rulesets";

/**
 * A real match (see the fixture's `source`), replayed through the reader: the shop is rolled
 * slot by slot as the player rerolled, Buffoon Packs and Riff-raff take their jokers from the
 * same queues in between, and every joker the player bought or picked has to be there.
 */
const [expanded] = PATCHES[0].rulesets;
const settings: ReaderSettings = {
  seed: match.seed,
  ruleset: expanded,
  gameMode: PATCHES[0].gameMode,
  stake: match.stake,
  deck: "violet",
};
type Event = { t: string; name?: string; kind?: string };
const events = match.events as Event[];

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^(the|mp) /, "")
    .replace(/[^a-z0-9]/g, "");
/** Card name in the log → game key, preferring the cards this ruleset uses. */
const keyOf = new Map<string, string>();
for (const kind of ["joker", "booster", "voucher"] as const)
  for (const item of Object.values(game.items[kind])) {
    const n = norm(item.name);
    const inRuleset = Object.values(expanded.added.jokers ?? {})
      .flat()
      .includes(item.key);
    if (
      !keyOf.has(n) ||
      inRuleset ||
      /_normal_1$|_jumbo_1$|_mega_1$/.test(item.key)
    )
      keyOf.set(n, item.key);
  }
const key = (name?: string) => keyOf.get(norm(name ?? "")) ?? "";
const PACK_SIZE: Record<string, number> = {
  "Buffoon Pack": 2,
  "Jumbo Buffoon Pack": 4,
  "Mega Buffoon Pack": 4,
};

describe("a real Expanded match (FZZUAJBR)", () => {
  it("has every joker the player bought or picked where the reader puts it", () => {
    const sim = new ShopSim(settings);
    const held = new Set<string>();
    let visible: ShopItem[] = [];
    let pack: ShopItem[] = [];
    const sync = () => {
      sim.owned.clear();
      for (const k of held) sim.owned.add(k);
      for (const i of [...visible, ...pack])
        if (i.kind !== "card") sim.owned.add(i.key);
    };
    const roll = () => {
      visible = [];
      for (let i = 0; i < 2; i++) {
        sync();
        visible.push(sim.next());
      }
    };
    const found: string[] = [];
    for (const e of events) {
      if (e.t === "shop" || e.t === "reroll") roll();
      else if (e.t === "blind") {
        visible = [];
        // Riff-raff: two Common jokers when a blind starts, if there's room.
        if (held.has("j_riff_raff"))
          for (let i = 0; i < 2 && held.size < 5; i++) {
            sync();
            held.add(sim.otherJoker(1).key);
          }
      } else if (e.t === "pack") {
        pack = [];
        for (let i = 0; i < (PACK_SIZE[e.name ?? ""] ?? 0); i++) {
          sync();
          pack.push(sim.buffoonCard());
        }
      } else if (e.t === "pick" && e.kind === "Joker") {
        expect(pack.map((i) => (i.kind === "card" ? "" : i.key))).toContain(
          key(e.name),
        );
        held.add(key(e.name));
        found.push(e.name ?? "");
        pack = [];
      } else if (e.t === "pick" || e.t === "skip") pack = [];
      else if (e.t === "sell" && e.kind === "Joker") held.delete(key(e.name));
      else if (e.t === "buy" && e.kind === "Joker") {
        const at = visible.findIndex(
          (i) => i.kind !== "card" && i.key === key(e.name),
        );
        expect(at, `${e.name} in the shop`).toBeGreaterThanOrEqual(0);
        visible.splice(at, 1);
        held.add(key(e.name));
        found.push(e.name ?? "");
      }
    }
    // Vagabond, Riff-raff, Cartomancer, The Idol, Mail-In Rebate, Séance, Gift Card,
    // Bloodstone, Dusk and the three Buffoon Pack picks.
    expect(found.length).toBeGreaterThanOrEqual(12);
    // The two jokers Riff-raff made are the ones the player later sold.
    const sold = events.filter((e) => e.t === "sell").map((e) => e.name);
    expect(sold).toContain("Zany Joker");
  });

  it("offers the packs the player opened", () => {
    const packs = packQueue(settings, 20);
    let shop = -1;
    let opened = 0;
    for (const e of events) {
      if (e.t === "shop") shop++;
      if (e.t === "pack") {
        expect(
          packs[shop].map(
            (p) =>
              (game.items.booster as Record<string, { name: string }>)[
                p.slice(2)
              ]?.name,
          ),
        ).toContain(e.name);
        opened++;
      }
    }
    expect(opened).toBeGreaterThan(10);
  });

  it("offers the vouchers the player bought, two per ante on Violet Deck", () => {
    // The shop after a boss already has the next ante's vouchers.
    const bought: { ante: number; key: string }[] = [];
    let ante = 1;
    for (const e of events) {
      if (e.t === "shop") {
        const m = /^Ante (\d+) Shop after (.*)$/.exec(e.name ?? "");
        if (m) ante = Number(m[1]) + (/^(Small|Big) Blind$/.test(m[2]) ? 0 : 1);
      }
      if (e.t === "voucher") bought.push({ ante, key: key(e.name) });
    }
    expect(bought.length).toBeGreaterThan(5);
    const offers = voucherQueue(settings, 6, (a, k) =>
      bought.some((b) => b.ante === a && b.key === k),
    );
    for (const b of bought) expect(offers[b.ante - 1]).toContain(b.key);
    for (const o of offers) expect(o).toHaveLength(2);
  });
});
