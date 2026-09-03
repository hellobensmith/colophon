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

const englishText = (psalm: number, verse: number): string =>
  verseByReference("PSA", psalm, verse).text;

describe("Greek psalm numbering", () => {
  test("resolves the citations that motivate the feature", () => {
    // Greek 22 is the shepherd psalm; Greek 50 is the Miserere.
    const shepherd = fromGreek(22, 2);
    expect(shepherd).toEqual({ kind: "verse", psalm: 23, verse: 1 });
    expect(englishText(23, 1)).toContain("Jehovah is my shepherd");

    const miserere = fromGreek(50, 2);
    expect(miserere).toEqual({ kind: "verse", psalm: 51, verse: 1 });
    expect(englishText(51, 1)).toContain("Have mercy upon me");
  });

  test("Greek 9 runs through both Hebrew 9 and Hebrew 10", () => {
    expect(fromGreek(9, 1)).toEqual({ kind: "title", psalm: 9 });
    expect(fromGreek(9, 2)).toEqual({ kind: "verse", psalm: 9, verse: 1 });
    expect(fromGreek(9, 21)).toEqual({ kind: "verse", psalm: 9, verse: 20 });
    // The seam: the next Greek verse is the start of Hebrew 10.
    expect(fromGreek(9, 22)).toEqual({ kind: "verse", psalm: 10, verse: 1 });
    expect(fromGreek(9, 39)).toEqual({ kind: "verse", psalm: 10, verse: 18 });
    expect(greekVerseCount(9)).toBe(39);
  });

  test("Greek 113 runs through both Hebrew 114 and Hebrew 115", () => {
    expect(fromGreek(113, 8)).toEqual({ kind: "verse", psalm: 114, verse: 8 });
    expect(fromGreek(113, 9)).toEqual({ kind: "verse", psalm: 115, verse: 1 });
    expect(englishText(115, 1)).toContain("Not unto us");
    expect(greekVerseCount(113)).toBe(26);
  });

  test("Hebrew 116 splits into Greek 114 and 115 at the Credidi", () => {
    expect(fromGreek(114, 1)).toEqual({ kind: "verse", psalm: 116, verse: 1 });
    expect(fromGreek(114, 9)).toEqual({ kind: "verse", psalm: 116, verse: 9 });
    // Vulgate Psalm 115:1, "Credidi propter quod locutus sum".
    expect(fromGreek(115, 1)).toEqual({ kind: "verse", psalm: 116, verse: 10 });
    expect(englishText(116, 10)).toContain("I believe, for I will speak");
  });

  test("Hebrew 147 splits into Greek 146 and 147 at the Lauda Jerusalem", () => {
    expect(fromGreek(146, 11)).toEqual({ kind: "verse", psalm: 147, verse: 11 });
    // Vulgate Psalm 147:1, "Lauda Jerusalem Dominum".
    expect(fromGreek(147, 1)).toEqual({ kind: "verse", psalm: 147, verse: 12 });
    expect(englishText(147, 12)).toContain("Praise Jehovah, O Jerusalem");
  });

  test("both ends of the Psalter are numbered alike", () => {
    expect(fromGreek(1, 1)).toEqual({ kind: "verse", psalm: 1, verse: 1 });
    expect(fromGreek(148, 1)).toEqual({ kind: "verse", psalm: 148, verse: 1 });
    expect(fromGreek(150, 6)).toEqual({ kind: "verse", psalm: 150, verse: 6 });
  });

  test("every Greek verse maps to a distinct English position, and all are covered", () => {
    const seen = new Set<string>();
    let verses = 0;
    let titles = 0;
    for (let psalm = 1; psalm <= 150; psalm += 1) {
      for (let verse = 1; verse <= greekVerseCount(psalm); verse += 1) {
        const position = fromGreek(psalm, verse);
        const key =
          position.kind === "title" ? `T${position.psalm}` : `${position.psalm}:${position.verse}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
        if (position.kind === "title") titles += 1;
        else verses += 1;
      }
    }
    // The Psalter's 2,461 verses plus the 116 superscriptions, exactly once each.
    expect(verses).toBe(2461);
    expect(titles).toBe(116);
    expect(seen.size).toBe(2577);
  });

  test("rejects verses past the end of a Greek psalm", () => {
    expect(() => fromGreek(9, 40)).toThrow(PsalmNumberingError);
    expect(() => fromGreek(9, 40)).toThrow(/only has 39 verses in Greek numbering/);
    expect(() => fromGreek(151, 1)).toThrow(PsalmNumberingError);
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
    const result = parseReference("Psalm 50:2", { numbering: "greek" });
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
    expect(descriptiveTitle("PSA", 9)).toBeString();
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
});
