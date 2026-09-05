import { describe, expect, test } from "bun:test";
import { foldForSearch, tokenize } from "./tokenize.ts";
import { search } from "./search.ts";
import { TEXT } from "./data/text.ts";

describe("folding 1901 typography", () => {
  test("the corpus uses the curly apostrophe exclusively", () => {
    // The premise of the fold: a reader's keyboard cannot produce what is here.
    expect(TEXT).not.toContain("'");
    expect((TEXT.match(/’/g) ?? []).length).toBeGreaterThan(1900);
  });

  test("an apostrophe separates rather than joining", () => {
    // A possessive is a form of the word, so it must reach the same token in
    // every position — not only where a trailing wildcard would rescue it.
    expect(tokenize("Jehovah’s")).toEqual(["jehovah"]);
    expect(tokenize("Jehovah's")).toEqual(["jehovah"]);
  });

  test("the ligature expands rather than splitting the word", () => {
    expect(foldForSearch("Cæsar")).toBe("Caesar");
    expect(tokenize("Cæsar")).toEqual(["caesar"]);
    expect(tokenize("Caesar")).toEqual(["caesar"]);
    // Before the fold this produced ["sar"], which matched Sarai.
    expect(tokenize("Cæsar")).not.toContain("sar");
  });

  test("diaereses reduce to their base letter", () => {
    expect(tokenize("Jaïrus")).toEqual(["jairus"]);
    expect(tokenize("Nicolaüs")).toEqual(["nicolaus"]);
  });

  test("single characters are not tokens", () => {
    expect(tokenize("a I o")).toEqual([]);
  });

  test("folding leaves ordinary text alone", () => {
    expect(foldForSearch("In the beginning God created")).toBe("In the beginning God created");
  });
});

describe("search reaches words as they are actually typed", () => {
  /**
   * Both of these returned zero before the fold: the corpus holds no ASCII
   * apostrophe, and æ was read as a word separator.
   */
  test("a possessive typed on an ordinary keyboard finds the verses", () => {
    const typed = search("Jehovah's", 3, 0);
    expect(typed.total).toBeGreaterThan(5000);
    expect(typed.total).toBe(search("Jehovah’s", 3, 0).total);
  });

  test("the modern spelling of a ligatured name finds it", () => {
    for (const [modern, printed] of [
      ["Caesar", "Cæsar"],
      ["Judaea", "Judæa"],
      ["Zacchaeus", "Zacchæus"],
      ["Galilaean", "Galilæan"],
    ] as const) {
      const a = search(modern, 1, 0);
      const b = search(printed, 1, 0);
      expect(a.total).toBe(b.total);
      expect(a.total).toBeGreaterThan(0);
    }
  });

  test("Caesar no longer matches Sarai", () => {
    for (const hit of search("Caesar", 10, 0).hits) {
      expect(hit.text.toLowerCase()).toContain("sar");
      expect(/cæsar|caesar/i.test(hit.text)).toBe(true);
    }
  });

  test("the ordinary path is unchanged", () => {
    expect(search("good shepherd", 1, 0).total).toBe(2);
    expect(search("faith hope love", 1, 0).hits[0]!.id).toBe("1CO.13.13");
    expect(search("speak", 100, 0).hits.some((hit) => /spake/i.test(hit.text))).toBe(true);
  });
});
