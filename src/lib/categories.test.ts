import { describe, expect, it } from "vitest";
import { groupByCategory } from "./categories";

const page = (name: string, tags: string[]) => ({ name, tags });

describe("groupByCategory", () => {
  const pages = [
    page("Reserved Parking", ["econ", "jokers"]),
    page("White Stake", ["white stake", "ranked"]),
    page("Black Stake", ["Black Stake"]),
    page("Misc", ["tool"]),
  ];

  it("puts each page in the first matching category, in order, then the catch-all", () => {
    const groups = groupByCategory(pages, {
      categories: [
        { name: "Jokers", tags: ["jokers"] },
        { name: "Stakes", tags: ["white stake", "black stake"] },
        { name: "Econ", tags: ["econ"] },
      ],
      othersName: "Others",
    });
    expect(groups.map((g) => [g.name, g.pages.map((p) => p.name)])).toEqual([
      ["Jokers", ["Reserved Parking"]],
      ["Stakes", ["White Stake", "Black Stake"]],
      ["Others", ["Misc"]],
    ]);
  });

  it("leaves out empty groups, and keeps an unnamed catch-all", () => {
    const groups = groupByCategory([page("Misc", ["tool"])], {
      categories: [{ name: "Jokers", tags: ["jokers"] }],
      othersName: "",
    });
    expect(groups).toEqual([{ name: "", pages: [page("Misc", ["tool"])] }]);
  });
});
