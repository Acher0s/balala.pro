import { describe, expect, it } from "vitest";
import { creatorInputSchema } from "./creators-shared";
import { balatroOnly } from "./twitch";

const stream = (game: string, type = "live") => ({
  user_login: "SomeOne",
  user_name: "SomeOne",
  game_name: game,
  title: "Ranked grind",
  viewer_count: 42,
  started_at: "2026-11-09T12:00:00Z",
  type,
});

describe("live streams on the Creators page", () => {
  it("keeps only live streams in the Balatro category", () => {
    expect(
      balatroOnly([
        stream("Balatro"),
        stream("Just Chatting"),
        stream("balatro"),
        stream("Balatro", ""),
      ]).map((s) => s.login),
    ).toEqual(["someone", "someone"]);
  });
});

describe("creator form", () => {
  const base = {
    name: "Someone",
    twitch: "",
    bio: "",
    avatarUrl: "",
    links: [],
  };

  it("takes a Twitch name or a twitch.tv link", () => {
    expect(
      creatorInputSchema.parse({
        ...base,
        twitch: "https://www.twitch.tv/Some_One/videos",
      }).twitch,
    ).toBe("Some_One");
    expect(
      creatorInputSchema.safeParse({ ...base, twitch: "no spaces" }).success,
    ).toBe(false);
  });

  it("only accepts web links", () => {
    expect(
      creatorInputSchema.safeParse({
        ...base,
        links: [{ label: "YouTube", url: "javascript:alert(1)" }],
      }).success,
    ).toBe(false);
    expect(
      creatorInputSchema.safeParse({
        ...base,
        links: [{ label: "YouTube", url: "https://youtube.com/@someone" }],
      }).success,
    ).toBe(true);
  });
});
