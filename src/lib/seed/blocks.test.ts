import { describe, expect, it } from "vitest";
import {
  evaluateHand,
  findBlocks,
  findBlocksAuto,
  type LogEvent,
  matchSettings,
} from "./blocks";
import bgmjz5ac from "./fixtures/bgmjz5ac-log.json";
import dkh5gtrx from "./fixtures/dkh5gtrx-log.json";
import fd54z7xn from "./fixtures/fd54z7xn-log.json";
import log from "./fixtures/fzzuajbr-log.json";
import qgisur8i from "./fixtures/qgisur8i-log.json";
import viwlatit from "./fixtures/viwlatit-log.json";
import x3uf2auh from "./fixtures/x3uf2auh-log.json";
import { jokerQueue, type ReaderSettings, shopQueue } from "./reader";
import { isReadable } from "./replay-file";
import { PATCHES } from "./rulesets";

const events = log.events as LogEvent[];

describe("what did I block (FZZUAJBR)", () => {
  const read = matchSettings(events);
  if (!read.ok) throw new Error(read.error);
  const report = findBlocks(events, read.settings);
  const at = (key: string, place: string) =>
    report.hits.find((h) => h.key === key && h.place === place);

  it("reads the match's settings from the log", () => {
    expect(read.settings.seed).toBe("FZZUAJBR");
    expect(read.settings.ruleset.id).toBe("expanded");
    expect(read.settings.deck).toBe("violet");
    expect(read.settings.stake).toBe(1);
  });

  it("refuses a match without The Order", () => {
    const off = events.map(
      (e): LogEvent =>
        e[1] === "lobby_info"
          ? [
              e[0],
              e[1],
              {
                ...(e[2] as object),
                options: { the_order_enabled: false },
              },
            ]
          : e,
    );
    expect(matchSettings(off).ok).toBe(false);
  });

  it("follows the log: shop, pack and made cards are where the replay puts them", () => {
    const { shop, packs, made, jokers } = report.agreement;
    // Vagabond's and the Purple Seals' Tarots are made as they happen, so the shop holds
    // through Ante 4.
    expect(report.firstMiss).toMatch(/^Ante [5-9]/);
    expect(shop.matched / shop.checked).toBeGreaterThan(0.6);
    expect(packs.matched / packs.checked).toBeGreaterThan(0.9);
    expect(made.matched / made.checked).toBeGreaterThan(0.8);
    // The jokers Riff-raff made are the ones the player had next.
    expect(jokers.matched).toBe(jokers.checked);
  });

  it("finds cards skipped because the player had them", () => {
    // Mail-In Rebate, bought in that shop, came up again on a reroll.
    expect(at("j_mail", "Ante 2 · Shop after PvP Blind")).toMatchObject({
      reason: "held",
      sure: true,
    });
  });

  it("finds cards skipped because they weren't unlocked yet", () => {
    expect(at("j_glass", "Ante 2 · Shop after Small Blind")).toMatchObject({
      reason: "locked",
      why: "No Glass Card in the deck yet",
    });
    expect(at("c_planet_x", "Ante 1 · Shop after Big Blind")).toMatchObject({
      reason: "locked",
      why: "No Five of a Kind played yet",
    });
    // Riff-raff draws from the stickerless Common queue, where Cavendish waits for Gros Michel.
    expect(at("j_cavendish", "Ante 2 · PvP Blind")).toMatchObject({
      reason: "locked",
      source: "Riff-raff",
    });
  });
});

describe("pool flags and stickers", () => {
  const [expanded] = PATCHES[0].rulesets;
  const base: ReaderSettings = {
    seed: "FZZUAJBR",
    ruleset: expanded,
    gameMode: PATCHES[0].gameMode,
    stake: 1,
  };

  it("keeps Cavendish out until Gros Michel is extinct, and Gros Michel out after", () => {
    const before = jokerQueue(base, 1, 400).map((j) => j.key);
    expect(before).not.toContain("j_cavendish");
    expect(before).toContain("j_gros_michel");
    const after = jokerQueue({ ...base, grosMichelExtinct: true }, 1, 400).map(
      (j) => j.key,
    );
    expect(after).toContain("j_cavendish");
    expect(after).not.toContain("j_gros_michel");
  });

  it("takes a joker that can't be Eternal from the sticker queue when the roll says Eternal", () => {
    // The Order rolls the stickers before the joker; set_eternal then does nothing on a joker
    // with eternal_compat off, so it looks stickerless but came from the sticker queue.
    const shop = shopQueue({ ...base, stake: 4 }, 600).filter(
      (i) => i.kind === "joker",
    );
    const bare = shop.filter(
      (j) => j.kind === "joker" && j.stickerQueue && j.stickers.length === 0,
    );
    expect(bare.length).toBeGreaterThan(0);
  });
});

describe("whole matches that replay without a miss", () => {
  const cases = [
    // Magic Deck (Crystal Ball, two Fools), stake 6, a Rare Tag that fills the next shop.
    ["VIWLATIT", viwlatit],
    // Orange Deck: two Hanged Men to start with.
    ["DKH5GTRX", dkh5gtrx],
    // Showman, Judgement's joker sold before the next hand.
    ["X3UF2AUH", x3uf2auh],
    // The Emperor picked from an Arcana Pack: what it makes skips The Emperor itself.
    ["QGISUR8I", qgisur8i],
    // Magic Deck on Black Stake, 8 Ball.
    ["BGMJZ5AC", bgmjz5ac],
  ] as const;
  for (const [seed, fixture] of cases)
    it(seed, () => {
      const events = fixture.events as LogEvent[];
      const read = matchSettings(events);
      if (!read.ok) throw new Error(read.error);
      expect(read.settings.seed).toBe(seed);
      const { agreement, firstMiss } = findBlocks(events, read.settings);
      expect(firstMiss).toBeUndefined();
      for (const a of Object.values(agreement))
        expect(a.matched).toBe(a.checked);
      expect(agreement.shop.checked).toBeGreaterThan(10);
    });
});

describe("replay files", () => {
  it("treats a log without its run as not shared", () => {
    expect(
      isReadable({
        name: "",
        shared: false,
        events: [[0, "select_blind", [0, "bl_small"]]],
      }),
    ).toBe(false);
    expect(
      isReadable({ name: "", shared: true, events: log.events as LogEvent[] }),
    ).toBe(true);
  });
});

describe("evaluateHand", () => {
  const c = (rank: string, suit: string, enhancement?: string) => ({
    rank,
    suit,
    enhancement,
    alive: true,
  });
  it("names hands and the cards that score", () => {
    const fh = [
      c("King", "Hearts"),
      c("King", "Hearts"),
      c("Jack", "Hearts"),
      c("Jack", "Hearts", "m_lucky"),
      c("Jack", "Hearts"),
    ];
    expect(evaluateHand(fh, []).name).toBe("Flush House");
    const pair = [c("8", "Spades"), c("8", "Clubs"), c("2", "Hearts")];
    const r = evaluateHand(pair, []);
    expect(r.name).toBe("Pair");
    expect(r.scoring.map((x) => x.rank)).toEqual(["8", "8"]);
    expect(evaluateHand(pair, ["j_splash"]).scoring).toHaveLength(3);
    const high = [c("3", "Spades"), c("Ace", "Clubs"), c("9", "Hearts")];
    expect(evaluateHand(high, []).scoring.map((x) => x.rank)).toEqual(["Ace"]);
  });
  it("follows Four Fingers, Shortcut, Smeared, Wild and Stone Cards", () => {
    const four = [
      c("2", "Spades"),
      c("3", "Spades"),
      c("4", "Spades"),
      c("5", "Spades"),
    ];
    expect(evaluateHand(four, []).name).toBe("High Card");
    expect(evaluateHand(four, ["j_four_fingers"]).name).toBe("Straight Flush");
    const gappy = [
      c("2", "Hearts"),
      c("4", "Clubs"),
      c("6", "Spades"),
      c("8", "Diamonds"),
      c("10", "Hearts"),
    ];
    expect(evaluateHand(gappy, ["j_shortcut"]).name).toBe("Straight");
    const smeared = [
      c("2", "Hearts"),
      c("5", "Diamonds"),
      c("9", "Hearts"),
      c("Jack", "Diamonds"),
      c("King", "Hearts", "m_stone"),
    ];
    expect(evaluateHand(smeared, ["j_smeared"]).name).toBe("High Card");
    smeared[4] = c("King", "Spades", "m_wild");
    expect(evaluateHand(smeared, ["j_smeared"]).name).toBe("Flush");
  });
});

describe("lobby avatars (Multiplayer 1.0.5 bug)", () => {
  it("finds the avatars that kept jokers out of the shop", () => {
    const events = fd54z7xn.events as LogEvent[];
    const read = matchSettings(events);
    if (!read.ok) throw new Error(read.error);
    expect(findBlocks(events, read.settings).firstMiss).toBeDefined();
    const r = findBlocksAuto(events, read.settings);
    expect(r.avatars.map((a) => a.key).sort()).toEqual([
      "j_hiker",
      "j_mp_bloodstone",
    ]);
    expect(r.firstMiss).toBeUndefined();
  });
  it("leaves a match that needs no avatars alone", () => {
    const events = x3uf2auh.events as LogEvent[];
    const read = matchSettings(events);
    if (!read.ok) throw new Error(read.error);
    expect(findBlocksAuto(events, read.settings).avatars).toEqual([]);
  });
});
