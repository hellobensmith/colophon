import { describe, expect, test } from "bun:test";
import {
  fromGreek,
  fromHebrew,
  greekVerseCount,
  numberedVerses,
  hebrewToGreekPsalm,
  hasSuperscription,
  PsalmNumberingError,
} from "./psalms.ts";
import { parseReference, ParseError } from "./parser.ts";
import { verseByReference, descriptiveTitle } from "./corpus.ts";

const englishText = (psalm: number, verse: number, translation = "asv"): string =>
  verseByReference("PSA", psalm, verse, translation).text;

describe("Greek psalm numbering onto the ASV", () => {
  test("resolves the citations that motivate the feature", () => {
    // Greek 22 is the shepherd psalm; Greek 50 is the Miserere. Greek 22's
    // title folds into its first verse (no separate title verse in the
    // Vulgate), so Greek verse 1 is already the shepherd's opening line.
    const shepherd = fromGreek(22, 1, "asv");
    expect(shepherd).toEqual({ kind: "verse", psalm: 23, verse: 1 });
    expect(englishText(23, 1)).toContain("Jehovah is my shepherd");

    // Greek 50's title spans two Vulgate verses (a label, then a historical
    // clause); content starts at verse 3, not 2.
    const miserereTitle = fromGreek(50, 2, "asv");
    expect(miserereTitle).toEqual({ kind: "title", psalm: 51 });
    const miserere = fromGreek(50, 3, "asv");
    expect(miserere).toEqual({ kind: "verse", psalm: 51, verse: 1 });
    expect(englishText(51, 1)).toContain("Have mercy upon me");
  });

  test("Greek 9 runs through both Hebrew 9 and Hebrew 10", () => {
    expect(fromGreek(9, 1, "asv")).toEqual({ kind: "title", psalm: 9 });
    expect(fromGreek(9, 2, "asv")).toEqual({ kind: "verse", psalm: 9, verse: 1 });
    expect(fromGreek(9, 21, "asv")).toEqual({ kind: "verse", psalm: 9, verse: 20 });
    // The seam: the next Greek verse is the start of Hebrew 10.
    expect(fromGreek(9, 22, "asv")).toEqual({ kind: "verse", psalm: 10, verse: 1 });
    expect(fromGreek(9, 39, "asv")).toEqual({ kind: "verse", psalm: 10, verse: 18 });
    expect(greekVerseCount(9, "asv")).toBe(39);
  });

  test("Greek 113 runs through both Hebrew 114 and Hebrew 115", () => {
    expect(fromGreek(113, 8, "asv")).toEqual({ kind: "verse", psalm: 114, verse: 8 });
    expect(fromGreek(113, 9, "asv")).toEqual({ kind: "verse", psalm: 115, verse: 1 });
    expect(englishText(115, 1)).toContain("Not unto us");
    expect(greekVerseCount(113, "asv")).toBe(26);
  });

  test("Hebrew 116 splits into Greek 114 and 115 at the Credidi", () => {
    expect(fromGreek(114, 1, "asv")).toEqual({ kind: "verse", psalm: 116, verse: 1 });
    expect(fromGreek(114, 9, "asv")).toEqual({ kind: "verse", psalm: 116, verse: 9 });
    // Vulgate Psalm 115:1, "Credidi propter quod locutus sum".
    expect(fromGreek(115, 1, "asv")).toEqual({ kind: "verse", psalm: 116, verse: 10 });
    expect(englishText(116, 10)).toContain("I believe, for I will speak");
  });

  test("Hebrew 147 splits into Greek 146 and 147 at the Lauda Jerusalem", () => {
    expect(fromGreek(146, 11, "asv")).toEqual({ kind: "verse", psalm: 147, verse: 11 });
    // Vulgate Psalm 147:1, "Lauda Jerusalem Dominum".
    expect(fromGreek(147, 1, "asv")).toEqual({ kind: "verse", psalm: 147, verse: 12 });
    expect(englishText(147, 12)).toContain("Praise Jehovah, O Jerusalem");
  });

  test("both ends of the Psalter are numbered alike", () => {
    expect(fromGreek(1, 1, "asv")).toEqual({ kind: "verse", psalm: 1, verse: 1 });
    expect(fromGreek(148, 1, "asv")).toEqual({ kind: "verse", psalm: 148, verse: 1 });
    expect(fromGreek(150, 6, "asv")).toEqual({ kind: "verse", psalm: 150, verse: 6 });
  });

  test("rejects verses past the end of a Greek psalm", () => {
    expect(() => fromGreek(9, 40, "asv")).toThrow(PsalmNumberingError);
    expect(() => fromGreek(9, 40, "asv")).toThrow(/only has 39 verses in this edition/);
    expect(() => fromGreek(151, 1, "asv")).toThrow(PsalmNumberingError);
  });

  test("refuses an unknown translation rather than silently resolving against the ASV", () => {
    expect(() => fromGreek(1, 1, "kjv")).toThrow(PsalmNumberingError);
    expect(() => greekVerseCount(1, "kjv")).toThrow(PsalmNumberingError);
  });

  test("maps Hebrew psalms back to their Greek number", () => {
    expect(hebrewToGreekPsalm(9)).toBe(9);
    expect(hebrewToGreekPsalm(10)).toBe(9);
    expect(hebrewToGreekPsalm(23)).toBe(22);
    expect(hebrewToGreekPsalm(51)).toBe(50);
    expect(hebrewToGreekPsalm(116)).toBe(114);
    expect(hebrewToGreekPsalm(150)).toBe(150);
  });
});

describe("Greek psalms whose Vulgate structure genuinely splits or merges content", () => {
  // Found by comparing this edition's own verse divisions against the
  // Clementine Vulgate directly, 9 September 2026 — see the doc comment on
  // irregularGreekParts in psalms.ts for the full source and method.

  test("Greek 12 splits Hebrew 13:2, then merges 13:5-6 (the original motivating bug)", () => {
    expect(fromGreek(12, 1, "asv")).toEqual({ kind: "verse", psalm: 13, verse: 1 });
    // The split: both Vulgate verses 2 and 3 name the same, complete ASV verse.
    expect(fromGreek(12, 2, "asv")).toEqual({ kind: "verse", psalm: 13, verse: 2 });
    expect(fromGreek(12, 3, "asv")).toEqual({ kind: "verse", psalm: 13, verse: 2 });
    expect(fromGreek(12, 4, "asv")).toEqual({ kind: "verse", psalm: 13, verse: 3 });
    expect(fromGreek(12, 5, "asv")).toEqual({ kind: "verse", psalm: 13, verse: 4 });
    // The merge: refused, not silently resolved to 13:5 or 13:6.
    expect(() => fromGreek(12, 6, "asv")).toThrow(/merges Hebrew 13:5-6/);
    expect(greekVerseCount(12, "asv")).toBe(6);
    // The original bug: this used to return {psalm:13, verse:6} under 200.
    expect(() => fromGreek(12, 7, "asv")).toThrow(/only has 6 verses in this edition/);
  });

  test("Greek 52 splits Hebrew 53:1 and is otherwise clean — fully resolvable, nothing refused", () => {
    expect(fromGreek(52, 1, "asv")).toEqual({ kind: "verse", psalm: 53, verse: 1 });
    expect(fromGreek(52, 2, "asv")).toEqual({ kind: "verse", psalm: 53, verse: 1 });
    expect(fromGreek(52, 3, "asv")).toEqual({ kind: "verse", psalm: 53, verse: 2 });
    expect(fromGreek(52, 7, "asv")).toEqual({ kind: "verse", psalm: 53, verse: 6 });
    expect(greekVerseCount(52, "asv")).toBe(7);
  });

  test("Greek 71 merges Hebrew 72:1-2; the rest of the psalm is clean", () => {
    expect(fromGreek(71, 1, "asv")).toEqual({ kind: "title", psalm: 72 });
    expect(() => fromGreek(71, 2, "asv")).toThrow(/merges Hebrew 72:1-2/);
    expect(fromGreek(71, 3, "asv")).toEqual({ kind: "verse", psalm: 72, verse: 3 });
    expect(fromGreek(71, 20, "asv")).toEqual({ kind: "verse", psalm: 72, verse: 20 });
  });

  test("Greek 99 adds a superscription Hebrew 100 never had, then merges 100:1-2", () => {
    expect(() => fromGreek(99, 1, "asv")).toThrow(/superscription the Hebrew original never had/);
    expect(() => fromGreek(99, 2, "asv")).toThrow(/merges Hebrew 100:1-2/);
    expect(fromGreek(99, 3, "asv")).toEqual({ kind: "verse", psalm: 100, verse: 3 });
  });

  test("Greek 108 merges Hebrew 109:1-2; the rest of the psalm is clean", () => {
    expect(fromGreek(108, 1, "asv")).toEqual({ kind: "title", psalm: 109 });
    expect(() => fromGreek(108, 2, "asv")).toThrow(/merges Hebrew 109:1-2/);
    expect(fromGreek(108, 3, "asv")).toEqual({ kind: "verse", psalm: 109, verse: 3 });
    expect(fromGreek(108, 31, "asv")).toEqual({ kind: "verse", psalm: 109, verse: 31 });
  });

  test("Greek 129's tangled middle is refused as a block rather than guessed", () => {
    expect(fromGreek(129, 1, "asv")).toEqual({ kind: "verse", psalm: 130, verse: 1 });
    expect(fromGreek(129, 3, "asv")).toEqual({ kind: "verse", psalm: 130, verse: 3 });
    expect(() => fromGreek(129, 4, "asv")).toThrow(/redistributes Hebrew 130:4-7/);
    expect(() => fromGreek(129, 7, "asv")).toThrow(/redistributes Hebrew 130:4-7/);
    expect(fromGreek(129, 8, "asv")).toEqual({ kind: "verse", psalm: 130, verse: 8 });
  });

  test("Greek 145 adds a superscription Hebrew 146 never had, then merges parts of 146:1-3", () => {
    // This is the exact failure a prior fix introduced: HTTP 200 with an
    // empty verse list. It must refuse instead.
    expect(() => fromGreek(145, 1, "asv")).toThrow(/superscription the Hebrew original never had/);
    expect(() => fromGreek(145, 2, "asv")).toThrow(/merges parts of Hebrew 146:1-3/);
    expect(fromGreek(145, 3, "asv")).toEqual({ kind: "verse", psalm: 146, verse: 3 });
    expect(fromGreek(145, 10, "asv")).toEqual({ kind: "verse", psalm: 146, verse: 10 });
  });

  test("Greek 43 and 55 refuse their unresolved boundary rather than guess", () => {
    expect(() => fromGreek(43, 22, "asv")).toThrow(/merges Hebrew 44:21-22/);
    expect(fromGreek(43, 23, "asv")).toEqual({ kind: "verse", psalm: 44, verse: 23 });
    expect(fromGreek(55, 11, "asv")).toEqual({ kind: "verse", psalm: 56, verse: 10 });
    expect(() => fromGreek(55, 12, "asv")).toThrow(/compresses Hebrew 56:11-13/);
    expect(() => fromGreek(55, 13, "asv")).toThrow(/compresses Hebrew 56:11-13/);
  });

  test("every resolvable Greek verse maps to a distinct English position", () => {
    const TWO_LINE_TITLES = new Set([50, 51, 53, 59]);
    const SPLIT_PSALMS = new Set([12, 52]);
    const seen = new Map<string, number>();
    let verses = 0;
    let titles = 0;
    let refused = 0;
    for (let psalm = 1; psalm <= 150; psalm += 1) {
      const total = greekVerseCount(psalm, "asv");
      for (let verse = 1; verse <= total; verse += 1) {
        let position;
        try {
          position = fromGreek(psalm, verse, "asv");
        } catch (error) {
          expect(error).toBeInstanceOf(PsalmNumberingError);
          refused += 1;
          continue;
        }
        const key =
          position.kind === "title" ? `T${position.psalm}` : `${position.psalm}:${position.verse}`;
        const seenCount = seen.get(key) ?? 0;
        if (seenCount > 0) {
          const allowedDuplicate =
            (position.kind === "title" && TWO_LINE_TITLES.has(psalm) && verse === 2) ||
            (position.kind === "verse" && SPLIT_PSALMS.has(psalm));
          expect(allowedDuplicate).toBe(true);
        }
        seen.set(key, seenCount + 1);
        if (position.kind === "title") titles += 1;
        else verses += 1;
      }
    }
    // 14 verses across the nine special psalms are explicitly refused, not
    // guessed. Four two-line titles and two clean splits each collapse two
    // addressable coordinates onto one ASV position (20 duplicates worth of
    // coordinates, 6 collapsed keys), so distinct positions are fewer than
    // verses+titles.
    expect(refused).toBe(14);
    expect(verses).toBe(2444);
    expect(titles).toBe(68);
    expect(seen.size).toBe(2506);
  });
});

describe("Greek psalm numbering onto the DRA", () => {
  test("is identity — the DRA already prints this division natively", () => {
    expect(fromGreek(1, 1, "dra")).toEqual({ kind: "verse", psalm: 1, verse: 1 });
    expect(fromGreek(150, 6, "dra")).toEqual({ kind: "verse", psalm: 150, verse: 6 });
  });

  test("a two-line title addresses both lines as real, distinct verses", () => {
    // Unlike the ASV, which has one undifferentiated title string, the DRA
    // prints both lines of the Miserere's superscription as its own verses.
    expect(fromGreek(50, 1, "dra")).toEqual({ kind: "verse", psalm: 50, verse: 1 });
    expect(fromGreek(50, 2, "dra")).toEqual({ kind: "verse", psalm: 50, verse: 2 });
    expect(fromGreek(50, 3, "dra")).toEqual({ kind: "verse", psalm: 50, verse: 3 });
    expect(englishText(50, 2, "dra")).toContain("Nathan");
  });

  test("bounds check against the DRA's own verse counts, not the ASV's", () => {
    expect(greekVerseCount(12, "dra")).toBe(6);
    expect(() => fromGreek(12, 7, "dra")).toThrow(/only has 6 verses in this edition/);
  });

  test("never returns a title position — the DRA has no separate title bucket", () => {
    for (let psalm = 1; psalm <= 150; psalm += 1) {
      const total = greekVerseCount(psalm, "dra");
      for (let verse = 1; verse <= total; verse += 1) {
        expect(fromGreek(psalm, verse, "dra").kind).toBe("verse");
      }
    }
  });
});

describe("Hebrew psalm numbering", () => {
  test("counts a superscription as verse 1", () => {
    expect(hasSuperscription(23)).toBe(true);
    expect(fromHebrew(23, 1)).toEqual({ kind: "title", psalm: 23 });
    expect(fromHebrew(23, 2)).toEqual({ kind: "verse", psalm: 23, verse: 1 });
    expect(numberedVerses(23)).toBe(7);
  });

  test("leaves psalms without a superscription unshifted", () => {
    expect(hasSuperscription(1)).toBe(false);
    expect(fromHebrew(1, 1)).toEqual({ kind: "verse", psalm: 1, verse: 1 });
    expect(numberedVerses(1)).toBe(6);
  });
});

describe("numbering through the reference parser", () => {
  test("a Greek reference resolves to the English psalm", () => {
    const result = parseReference("Psalm 50:3", { numbering: "greek" });
    expect(result.numbering).toBe("greek");
    expect(result.segments[0]!.start.chapter).toBe(51);
    expect(result.segments[0]!.start.verse).toBe(1);
    expect(result.reference).toContain("Greek numbering");
  });

  test("a Greek range crosses the Hebrew psalm boundary inside Greek 9", () => {
    const result = parseReference("Psalm 9:21-22", { numbering: "greek" });
    const [segment] = result.segments;
    expect(segment!.start.chapter).toBe(9);
    expect(segment!.start.verse).toBe(20);
    expect(segment!.end.chapter).toBe(10);
    expect(segment!.end.verse).toBe(1);
    expect(result.verseCount).toBe(2);
  });

  test("a Greek superscription comes back as a title", () => {
    const result = parseReference("Psalm 9:1", { numbering: "greek" });
    expect(result.includeTitle).toBe(true);
    expect(result.titleChapter).toBe(9);
    expect(descriptiveTitle("PSA", 9, "asv")).toBeString();
  });

  test("a title-only reference still names its chapter", () => {
    // Without the chapter this read "Psalms title", which is true of 116 psalms.
    expect(parseReference("Psalm 23:1", { numbering: "hebrew" }).reference).toBe(
      "Psalms 23 title (Hebrew numbering)",
    );
    expect(parseReference("Psalm 9:1", { numbering: "greek" }).reference).toBe(
      "Psalms 9 title (Greek numbering)",
    );
  });

  test("Hebrew and Greek both stay confined to the Psalms", () => {
    expect(() => parseReference("John 3:16", { numbering: "greek" })).toThrow(
      /Greek numbering is only available for Psalms/,
    );
    expect(() => parseReference("John 3:16", { numbering: "hebrew" })).toThrow(
      /Hebrew numbering is only available for Psalms/,
    );
  });

  test("out-of-range Greek verses are a not-found, not a syntax error", () => {
    try {
      parseReference("Psalm 9:40", { numbering: "greek" });
      throw new Error("expected a failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
      expect((error as ParseError).kind).toBe("out_of_range");
    }
  });

  test("Hebrew numbering is refused for a non-ASV translation", () => {
    try {
      parseReference("Psalm 51:1", { numbering: "hebrew", translation: "dra" });
      throw new Error("expected a failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
      expect((error as ParseError).message).toContain("Hebrew numbering is not implemented");
    }
  });
});
