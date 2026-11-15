import { describe, expect, it } from "vitest";
import { findBlocks, type LogEvent, matchSettings } from "./blocks";
import log from "./fixtures/fzzuajbr-log.json";
import { jokerQueue, type ReaderSettings, shopQueue } from "./reader";
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

  it("follows the log: pack cards and made consumables are where the replay puts them", () => {
    const { packs, made, jokers } = report.agreement;
    expect(packs.matched / packs.checked).toBeGreaterThan(0.9);
    expect(made.matched / made.checked).toBeGreaterThan(0.75);
    // The two jokers Riff-raff made are the ones the player had next.
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
