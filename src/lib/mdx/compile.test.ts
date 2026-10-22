import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toolTemplate, tutorialGuide } from "@/lib/guide-template";
import { compileGuide, GuideValidationError } from "./compile";

const guide = (body: string) => `---\ntitle: Test\n---\n\n${body}\n`;

async function problems(body: string): Promise<string[]> {
  try {
    await compileGuide(guide(body));
    return [];
  } catch (e) {
    if (e instanceof GuideValidationError) return e.problems;
    throw e;
  }
}

describe("guide validation: no code can run", () => {
  it.each([
    ["an expression in text", "Hello {process.exit(1)}"],
    ["an expression block", "{globalThis.fetch('https://evil.example')}"],
    ["import", "import fs from 'node:fs'\n\nHi"],
    ["export", "export const x = require('child_process')\n\nHi"],
    [
      "a call in a prop",
      '<Joker id={require("fs").readFileSync("/etc/passwd")} />',
    ],
    ["a function in a prop", "<Calc>{() => 1}</Calc>"],
    ["a spread prop", "<Joker {...props} />"],
    ["a script tag", "<script>alert(1)</script>"],
    ["an iframe", '<iframe src="https://evil.example" />'],
    ["an event handler", '<span onClick="alert(1)">x</span>'],
    [
      "dangerouslySetInnerHTML",
      "<div dangerouslySetInnerHTML={{ __html: '<img onerror=alert(1)>' }} />",
    ],
    ["a javascript: link", "[click](javascript:alert(1))"],
    ["an obfuscated javascript: link", '<a href="java\tscript:alert(1)">x</a>'],
    ["a data: image", "![x](data:text/html;base64,PHNjcmlwdD4=)"],
    ["a template placeholder", "<Value of={`${process.env.SECRET}`} />"],
    ["a member expression", "<Value of={process.env.SECRET} />"],
    ["an unknown component", "<Evil />"],
  ])("rejects %s", async (_label, body) => {
    expect((await problems(body)).length).toBeGreaterThan(0);
  });

  it("allows plain values in props", async () => {
    const body = `<Calc id="x" title="T">
  <Input name="a" label="A" default={-1} options={[{ label: 'One', value: 1 }]} />
  <Output label="Out" value="a * 2" format="money" />
</Calc>`;
    expect(await problems(body)).toEqual([]);
  });
});

describe("guide validation: authoring mistakes", () => {
  it("reports unknown card ids with the line number", async () => {
    const p = await problems('Line one\n\n<Joker id="mimee" />');
    expect(p).toEqual([expect.stringMatching(/line 7: unknown joker "mimee"/)]);
  });

  it("accepts names, game ids and multiplayer cards", async () => {
    expect(
      await problems(
        '<Joker id="oops_all_6s" /> <Joker id="oops" /> <Joker id="mp_pizza" /> <Tarot id="hierophant" />',
      ),
    ).toEqual([]);
  });

  it("checks calculator formulas against their inputs", async () => {
    const p = await problems(
      '<Calc>\n  <Input name="a" label="A" default={1} />\n  <Output label="X" value="a * b" />\n</Calc>',
    );
    expect(p.join()).toMatch(/unknown variable\(s\) "b"/);
  });

  it("accepts skill levels and rejects unknown ones", async () => {
    expect(
      await problems('<Level of="beginner">\n\n## Basics\n\nText\n\n</Level>'),
    ).toEqual([]);
    expect(
      (await problems('<Level of="expert">\n\nText\n\n</Level>')).join(),
    ).toMatch(/must be one of/);
  });

  it("requires a title", async () => {
    await expect(
      compileGuide("---\ndescription: x\n---\n\nHi"),
    ).rejects.toThrow(/title/);
  });
});

describe("the real guide", () => {
  it("compiles the Reserved Parking guide with a table of contents", async () => {
    const source = readFileSync(
      join(process.cwd(), "content/guides/reserved-parking.mdx"),
      "utf8",
    );
    const compiled = await compileGuide(source);
    expect(compiled.frontmatter.title).toBe("Reserved Parking guide");
    expect(compiled.toc.map((t) => t.url)).toContain("#parking-mime-bug");
  });
});

describe("the new-guide tutorial", () => {
  it("has no problems, so new guides start valid", async () => {
    const compiled = await compileGuide(
      tutorialGuide({ title: "My guide", author: "Someone" }),
    );
    expect(compiled.frontmatter.title).toBe("My guide");
    expect(compiled.toc.length).toBeGreaterThan(5);
  });
});

describe("tools", () => {
  const embed = guide('<Tool id="interest" />');

  it("lets a guide embed a published tool", async () => {
    await expect(
      compileGuide(embed, { kind: "guide", knownTools: new Set(["interest"]) }),
    ).resolves.toBeTruthy();
  });

  it("flags tools that don't exist or aren't published", async () => {
    await expect(
      compileGuide(embed, { kind: "guide", knownTools: new Set() }),
    ).rejects.toThrow(/no published tool "interest"/);
  });

  it("doesn't let a tool embed another tool", async () => {
    await expect(
      compileGuide(embed, { kind: "tool", knownTools: new Set(["interest"]) }),
    ).rejects.toThrow(/can't embed another tool/);
  });

  it("starts new tools without problems", async () => {
    const compiled = await compileGuide(
      toolTemplate({ title: "Interest", author: "Someone" }),
      { kind: "tool" },
    );
    expect(compiled.frontmatter.title).toBe("Interest");
  });
});

describe("tier list embeds", () => {
  const embed = guide('<TierList id="AbC123xy" />');

  it("accepts a published tier list", async () => {
    await expect(
      compileGuide(embed, { knownTierLists: new Set(["AbC123xy"]) }),
    ).resolves.toBeTruthy();
  });

  it("flags tier lists that don't exist or are private", async () => {
    await expect(
      compileGuide(embed, { knownTierLists: new Set() }),
    ).rejects.toThrow(/no published tier list/);
  });
});

describe("images", () => {
  it("allows uploaded and web images, but not javascript: or data: ones", async () => {
    expect(
      await problems(
        "![gif](/media/abc123)\n\n![web](https://example.com/a.gif)",
      ),
    ).toEqual([]);
    expect(
      (await problems("![x](javascript:alert(1))")).length,
    ).toBeGreaterThan(0);
  });
});

describe("the markup reference", () => {
  it("has no problems, so every documented example really works", async () => {
    const source = readFileSync(
      join(process.cwd(), "content/docs/markup-reference.mdx"),
      "utf8",
    );
    const compiled = await compileGuide(source);
    expect(compiled.toc.length).toBeGreaterThan(15);
  });
});

describe("the example announcement", () => {
  it("passes the same checks as the admin's own text", async () => {
    const { EXAMPLE_ANNOUNCEMENT } = await import("@/lib/announcement-example");
    const { siteTextSource } = await import("@/lib/settings");
    await expect(
      compileGuide(siteTextSource(EXAMPLE_ANNOUNCEMENT)),
    ).resolves.toBeTruthy();
  });
});

describe("links to headings", () => {
  it("turns links copied from the editor preview into same-page jumps", async () => {
    const { Body } = await compileGuide(
      guide(
        "## Parking Mime bug\n\nSee the [bug](https://balala.pro/preview/66c0e1c7-d93a-4728-ba54-8462ec99908b#parking-mime-bug) and [this](/preview/66c0e1c7-d93a-4728-ba54-8462ec99908b#parking-mime-bug).",
      ),
    );
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const html = renderToStaticMarkup(createElement(Body));
    expect(html).toContain('href="#parking-mime-bug"');
    expect(html).not.toContain("/preview/");
  });
});

describe("home intro", () => {
  it("keeps line breaks and turns Markdown links into links", async () => {
    const { introMarkup, siteTextSource } = await import("@/lib/settings");
    const text =
      "Maybe this helps you get good at BMP idk\nFor more info about the BMP mod, check out [their website](https://balatromp.com/)";
    expect(introMarkup(text)).toBe(
      "Maybe this helps you get good at BMP idk<br />\nFor more info about the BMP mod, check out [their website](https://balatromp.com/)",
    );
    expect(introMarkup("Intro\n\n- a\n- b")).toBe("Intro\n\n- a\n- b");
    await expect(
      compileGuide(siteTextSource(introMarkup(text))),
    ).resolves.toBeDefined();
  });
});

describe("page icon", () => {
  const withIcon = (icon: string) =>
    `---\ntitle: Test\nicon: ${icon}\n---\n\nHi\n`;

  it("accepts a card as kind:id, by name or game id", async () => {
    for (const icon of [
      "joker:reserved_parking",
      "tarot:hermit",
      "deck:mp_violet",
    ])
      await expect(compileGuide(withIcon(icon))).resolves.toBeDefined();
  });

  it("fans out up to 3 cards, read as a list", async () => {
    const { frontmatter } = await compileGuide(
      withIcon("[joker:baron, joker:mime, stake:white_stake]"),
    );
    expect(frontmatter.icon).toEqual([
      "joker:baron",
      "joker:mime",
      "stake:white_stake",
    ]);
    const single = await compileGuide(withIcon("joker:baron"));
    expect(single.frontmatter.icon).toEqual(["joker:baron"]);
    await expect(
      compileGuide(
        withIcon("[joker:baron, joker:mime, joker:idol, joker:dusk]"),
      ),
    ).rejects.toThrow(GuideValidationError);
  });

  it("rejects anything that isn't a card", async () => {
    for (const icon of ["joker:nope", "reserved_parking", "car:hermit"])
      await expect(compileGuide(withIcon(icon))).rejects.toThrow(
        GuideValidationError,
      );
  });
});

describe("stakes", () => {
  it("knows the vanilla and Multiplayer stake chips, in text and as icons", async () => {
    await expect(
      compileGuide(
        `---\ntitle: Test\nicon: stake:white_stake\n---\n\n<Stake id="white_stake" /> <Stake id="gold" card /> <Stake id="mp_plastic" /> <Stake id="mp_antimatter" />\n`,
      ),
    ).resolves.toBeDefined();
    await expect(
      compileGuide(`---\ntitle: Test\n---\n\n<Stake id="mp_nope" />\n`),
    ).rejects.toThrow(GuideValidationError);
  });
});
