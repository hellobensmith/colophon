import { describe, expect, test } from "bun:test";
import { buildFamilies } from "./morphology.ts";
import { INDEX } from "./data/search-index.ts";
import { search } from "./search.ts";

const TOKENS = INDEX.split("\n").map((line) => line.slice(0, line.indexOf(":")));
const families = buildFamilies(TOKENS);
const familyOf = (word: string): readonly string[] => families.get(word) ?? [word];

describe("archaic morphology", () => {
  test("links irregular forms no suffix rule could derive", () => {
    expect(familyOf("say")).toContain("said");
    expect(familyOf("say")).toContain("saith");
    expect(familyOf("speak")).toContain("spake");
    expect(familyOf("speak")).toContain("spoken");
    expect(familyOf("go")).toContain("went");
    expect(familyOf("see")).toContain("saw");
    expect(familyOf("have")).toContain("hath");
    expect(familyOf("child")).toContain("children");
  });

  test("links regular -eth, -est, -ed and -ing forms", () => {
    expect(familyOf("love")).toEqual(
      expect.arrayContaining(["love", "loved", "loveth", "lovest", "loving"]),
    );
    expect(familyOf("walk")).toEqual(
      expect.arrayContaining(["walk", "walked", "walketh", "walking"]),
    );
  });

  test("refuses merges the corpus shows to be different words", () => {
    // Each of these was produced by an earlier, looser rule set.
    expect(familyOf("have")).not.toContain("hades");
    expect(familyOf("have")).not.toContain("hasted");
    expect(familyOf("be")).not.toContain("wasted");
    expect(familyOf("be")).not.toContain("arts");
    expect(familyOf("see")).not.toContain("sawed");
    expect(familyOf("find")).not.toContain("founded");
    expect(familyOf("fall")).not.toContain("felled");
  });

  test("never merges a word into a lemma of the wrong length class", () => {
    for (const [member, family] of families) {
      expect(family).toContain(member);
      expect(family.length).toBeGreaterThan(1);
    }
  });
});

describe("search recall through morphology", () => {
  test("a lemma reaches its irregular forms in the text", () => {
    const speak = search("speak", 100, 0);
    expect(speak.hits.some((hit) => /spake/i.test(hit.text))).toBe(true);

    const say = search("say", 100, 0);
    expect(say.hits.some((hit) => /said|saith/i.test(hit.text))).toBe(true);
  });

  test("recall exceeds what prefix matching alone could reach", () => {
    // "spake" shares no prefix with "speak", so this total is only reachable
    // through the irregular table.
    expect(search("speak", 1, 0).total).toBeGreaterThan(1000);
    expect(search("say", 1, 0).total).toBeGreaterThan(5000);
  });
});

describe("AND semantics", () => {
  test("every term must appear, so totals mean what they say", () => {
    const outcome = search("good shepherd", 20, 0);
    expect(outcome.total).toBe(2);
    for (const hit of outcome.hits) {
      expect(hit.text.toLowerCase()).toContain("good");
      expect(hit.text.toLowerCase()).toContain("shepherd");
    }
  });

  test("one absent word empties the result", () => {
    expect(search("God zzzznotaword", 10, 0).total).toBe(0);
  });

  test("finds a verse from a phrase spread across it", () => {
    expect(search("faith hope love", 5, 0).hits[0]!.id).toBe("1CO.13.13");
    expect(search("beginning God created", 5, 0).hits[0]!.id).toBe("GEN.1.1");
  });

  test("multi-term queries stay exact rather than truncating", () => {
    // "lord" seeds the candidate set and "the" filters it by membership, so no
    // budget cap is reached even though "the" alone would exceed it.
    const outcome = search("the lord", 10, 0);
    expect(outcome.truncated).toBe(false);
    for (const hit of outcome.hits) {
      expect(hit.text.toLowerCase()).toContain("lord");
    }
  });
});
