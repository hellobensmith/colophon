import { describe, expect, test } from "bun:test";
import { parseReference, ParseError, sequenceOf } from "./parser.ts";
import type { ParseErrorKind } from "./parser.ts";

describe("mandated parser cases", () => {
  test('"John 3:16" resolves to JHN.3.16', () => {
    const result = parseReference("John 3:16");
    expect(result.book).toBe("JHN");
    expect(result.segments).toHaveLength(1);
    const [segment] = result.segments;
    expect(segment!.start.chapter).toBe(3);
    expect(segment!.start.verse).toBe(16);
    expect(segment!.end.verse).toBe(16);
    expect(result.verseCount).toBe(1);
  });

  test('"1 Cor 13:4-7" is a range in 1 Corinthians, not John', () => {
    const result = parseReference("1 Cor 13:4-7");
    expect(result.book).toBe("1CO");
    const [segment] = result.segments;
    expect(segment!.start.chapter).toBe(13);
    expect(segment!.start.verse).toBe(4);
    expect(segment!.end.chapter).toBe(13);
    expect(segment!.end.verse).toBe(7);
    expect(result.verseCount).toBe(4);
  });

  test('"Genesis 1:1-2:3" spans chapters', () => {
    const result = parseReference("Genesis 1:1-2:3");
    const [segment] = result.segments;
    expect(segment!.start.chapter).toBe(1);
    expect(segment!.start.verse).toBe(1);
    expect(segment!.end.chapter).toBe(2);
    expect(segment!.end.verse).toBe(3);
    // Genesis 1 has 31 verses, so 31 + 3 = 34.
    expect(result.verseCount).toBe(34);
  });

  test('"Psalm 23:1-6" under Hebrew numbering shifts by the superscription', () => {
    const result = parseReference("Psalm 23:1-6", { numbering: "hebrew" });
    expect(result.book).toBe("PSA");
    expect(result.numbering).toBe("hebrew");
    // Psalm 23 carries a title, so Hebrew 1 is that title and Hebrew 2-6 are
    // English 1-5.
    expect(result.includeTitle).toBe(true);
    const [segment] = result.segments;
    expect(segment!.start.verse).toBe(1);
    expect(segment!.end.verse).toBe(5);
  });

  test('"Jo 3:16" is rejected as ambiguous', () => {
    expect(() => parseReference("Jo 3:16")).toThrow(ParseError);
    try {
      parseReference("Jo 3:16");
    } catch (error) {
      expect((error as Error).message).toContain("Ambiguous");
      expect((error as Error).message).toContain("John");
      expect((error as Error).message).toContain("Job");
    }
  });

  test('"John 3:99" reports the real chapter length', () => {
    expect(() => parseReference("John 3:99")).toThrow("John 3 only has 36 verses");
  });

  test('"1 Cor 13:4-7,13" yields two segments', () => {
    const result = parseReference("1 Cor 13:4-7,13");
    expect(result.book).toBe("1CO");
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]!.start.verse).toBe(4);
    expect(result.segments[0]!.end.verse).toBe(7);
    expect(result.segments[1]!.start.verse).toBe(13);
    expect(result.segments[1]!.end.verse).toBe(13);
    expect(result.verseCount).toBe(5);
  });

  test("an empty reference is rejected", () => {
    expect(() => parseReference("")).toThrow(ParseError);
    expect(() => parseReference("   ")).toThrow(ParseError);
  });

  test('"Revelation 22:21" is verse 31102', () => {
    const result = parseReference("Revelation 22:21");
    expect(result.segments[0]!.start.sequence).toBe(31102);
  });

  /**
   * The specification listed "2 John 1:10" as a ParseError on the grounds that
   * 2 John has 13 verses — but 10 is within 13, and 2 John 1:10 is a real verse
   * ("receive him not into your house"). Rejecting it would be wrong, so the
   * reference resolves and the adjacent genuine out-of-bounds case is covered
   * instead.
   */
  test('"2 John 1:10" resolves, and verse 14 does not', () => {
    const result = parseReference("2 John 1:10");
    expect(result.book).toBe("2JN");
    expect(result.segments[0]!.start.chapter).toBe(1);
    expect(result.segments[0]!.start.verse).toBe(10);
    expect(() => parseReference("2 John 1:14")).toThrow("2 John 1 only has 13 verses");
  });
});

describe("book resolution", () => {
  test("accepts full names, abbreviations, and ordinal forms", () => {
    expect(parseReference("Genesis 1:1").book).toBe("GEN");
    expect(parseReference("Gen 1:1").book).toBe("GEN");
    expect(parseReference("gen. 1:1").book).toBe("GEN");
    expect(parseReference("1 Corinthians 13:1").book).toBe("1CO");
    expect(parseReference("1Cor 13:1").book).toBe("1CO");
    expect(parseReference("I Corinthians 13:1").book).toBe("1CO");
    expect(parseReference("First Corinthians 13:1").book).toBe("1CO");
    expect(parseReference("Song of Solomon 1:1").book).toBe("SNG");
    expect(parseReference("Ps 23:1").book).toBe("PSA");
  });

  test("distinguishes Philippians from Philemon", () => {
    expect(parseReference("Phil 1:1").book).toBe("PHP");
    expect(parseReference("Phlm 1:1").book).toBe("PHM");
    expect(parseReference("Philemon 1:1").book).toBe("PHM");
  });

  test("rejects unknown books", () => {
    expect(() => parseReference("Hezekiah 1:1")).toThrow(ParseError);
  });

  test("rejects deuterocanonical books, which the ASV does not contain", () => {
    expect(() => parseReference("Tobit 1:1")).toThrow(/not present in the American Standard Version/);
  });
});

describe("range and whole-unit references", () => {
  test("a bare chapter selects the whole chapter", () => {
    const result = parseReference("Psalm 117");
    expect(result.verseCount).toBe(2);
  });

  test("a bare book selects every verse", () => {
    expect(parseReference("Jude").verseCount).toBe(25);
    expect(parseReference("Obadiah").verseCount).toBe(21);
    expect(parseReference("Genesis").verseCount).toBe(1533);
  });

  test("single-chapter books accept a bare verse", () => {
    const result = parseReference("Jude 5");
    expect(result.book).toBe("JUD");
    expect(result.segments[0]!.start.chapter).toBe(1);
    expect(result.segments[0]!.start.verse).toBe(5);
  });

  test("rejects a chapter beyond the book", () => {
    expect(() => parseReference("Genesis 99:1")).toThrow(/has 50 chapters/);
  });

  test("rejects a backwards range", () => {
    expect(() => parseReference("Genesis 5:1-2:1")).toThrow(/backwards/);
  });

  test("en dashes and em dashes work like hyphens", () => {
    expect(parseReference("John 3:16–17").verseCount).toBe(2);
    expect(parseReference("John 3:16—17").verseCount).toBe(2);
  });
});

describe("Hebrew numbering", () => {
  test("is refused outside the Psalms", () => {
    expect(() => parseReference("John 3:16", { numbering: "hebrew" })).toThrow(
      /only available for Psalms/,
    );
  });

  test("leaves untitled Psalms unshifted", () => {
    // Psalm 1 carries no superscription.
    const result = parseReference("Psalm 1:1", { numbering: "hebrew" });
    expect(result.includeTitle).toBe(false);
    expect(result.segments[0]!.start.verse).toBe(1);
  });

  test("maps Hebrew verse 1 of a titled Psalm to the superscription alone", () => {
    const result = parseReference("Psalm 23:1", { numbering: "hebrew" });
    expect(result.includeTitle).toBe(true);
    expect(result.segments).toHaveLength(0);
    expect(result.verseCount).toBe(1);
  });

  test("enforces the Hebrew verse ceiling", () => {
    // Psalm 23 has 6 English verses and a title, so Hebrew runs 1-7.
    expect(parseReference("Psalm 23:7", { numbering: "hebrew" }).segments[0]!.start.verse).toBe(6);
    expect(() => parseReference("Psalm 23:8", { numbering: "hebrew" })).toThrow(
      /only has 7 verses in Hebrew numbering/,
    );
  });
});

describe("sequence numbering", () => {
  test("runs from Genesis 1:1 to Revelation 22:21", () => {
    expect(sequenceOf("GEN", 1, 1)).toBe(1);
    expect(sequenceOf("REV", 22, 21)).toBe(31102);
  });

  test("is contiguous across a book boundary", () => {
    // Malachi is the last Old Testament book; Matthew follows it.
    expect(sequenceOf("MAT", 1, 1) - sequenceOf("MAL", 4, 6)).toBe(1);
  });
});

describe("error classification", () => {
  function kindOf(reference: string, numbering?: "english" | "hebrew"): ParseErrorKind {
    try {
      parseReference(reference, numbering === undefined ? {} : { numbering });
    } catch (error) {
      if (error instanceof ParseError) return error.kind;
      throw error;
    }
    throw new Error(`Expected "${reference}" to fail`);
  }

  test("separates unreadable input from missing resources", () => {
    // Cannot be understood -> the caller sent something wrong.
    expect(kindOf("")).toBe("syntax");
    expect(kindOf("John 3:abc")).toBe("syntax");
    expect(kindOf("Genesis 5:1-2:1")).toBe("syntax");
    expect(kindOf("John 3:16", "hebrew")).toBe("syntax");
    expect(kindOf("Jo 3:16")).toBe("ambiguous");

    // Understood, but names something absent -> a 404 at the HTTP layer.
    expect(kindOf("Hezekiah 1:1")).toBe("unknown_book");
    expect(kindOf("Tobit 1:1")).toBe("unavailable");
    expect(kindOf("John 3:99")).toBe("out_of_range");
    expect(kindOf("Genesis 99:1")).toBe("out_of_range");
    expect(kindOf("2 John 1:14")).toBe("out_of_range");
    expect(kindOf("Psalm 23:8", "hebrew")).toBe("out_of_range");
  });

  test("defaults to syntax when no kind is given", () => {
    expect(new ParseError("boom").kind).toBe("syntax");
  });
});

describe("one-chapter books", () => {
  test("accept both the bare and the explicit chapter form", () => {
    for (const [bare, explicit] of [
      ["2 John 10", "2 John 1:10"],
      ["Jude 5", "Jude 1:5"],
      ["Obadiah 3", "Obadiah 1:3"],
      ["Philemon 6", "Philemon 1:6"],
    ] as const) {
      const first = parseReference(bare);
      const second = parseReference(explicit);
      expect(first.segments[0]!.start.sequence).toBe(second.segments[0]!.start.sequence);
      expect(first.book).toBe(second.book);
    }
  });
});
