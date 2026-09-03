import { describe, expect, test } from "bun:test";
import {
  EXPECTED_BOOKS,
  EXPECTED_EMPTY_VERSES,
  EXPECTED_TITLE_COUNT,
  EXPECTED_TOTAL_VERSES,
} from "./validate.ts";
import { VERSE_COUNTS, TITLES, NOTES, TITLED_PSALMS } from "./data/meta.ts";
import { TOTAL_VERSES, textAt, verseAt, verseByReference, descriptiveTitle } from "./corpus.ts";
import { sequenceOf, locate } from "./parser.ts";
import { search } from "./search.ts";
import { PROTESTANT_ORDER } from "./canon.ts";

describe("generated corpus", () => {
  test("holds the full ASV versification", () => {
    expect(TOTAL_VERSES).toBe(EXPECTED_TOTAL_VERSES);
  });

  test("every book matches its known chapter and verse totals", () => {
    for (const [bookId, expected] of EXPECTED_BOOKS) {
      const chapters = VERSE_COUNTS[bookId];
      expect(chapters).toBeDefined();
      expect(chapters!.length).toBe(expected.chapters);
      const total = chapters!.reduce((sum, count) => sum + count, 0);
      expect(total).toBe(expected.verses);
    }
  });

  test("covers all 66 books and nothing more", () => {
    expect(Object.keys(VERSE_COUNTS).sort()).toEqual([...PROTESTANT_ORDER].sort());
  });

  test("book verse totals sum to the whole", () => {
    const total = Object.values(VERSE_COUNTS)
      .flatMap((chapters) => [...chapters])
      .reduce((sum, count) => sum + count, 0);
    expect(total).toBe(EXPECTED_TOTAL_VERSES);
  });
});

describe("omitted verses", () => {
  test("exactly the 16 known verses are empty", () => {
    const empty: string[] = [];
    for (let sequence = 1; sequence <= TOTAL_VERSES; sequence += 1) {
      if (textAt(sequence) === "") empty.push(verseAt(sequence).id);
    }
    expect(empty.sort()).toEqual([...EXPECTED_EMPTY_VERSES].sort());
  });

  test("each carries an explanatory note", () => {
    for (const id of EXPECTED_EMPTY_VERSES) {
      expect(NOTES[id]).toBeString();
      expect(NOTES[id]!.length).toBeGreaterThan(0);
    }
  });

  test("no other verse carries a note", () => {
    expect(Object.keys(NOTES).sort()).toEqual([...EXPECTED_EMPTY_VERSES].sort());
  });
});

describe("descriptive titles", () => {
  test("116 Psalm superscriptions plus Habakkuk 3", () => {
    expect(Object.keys(TITLES).length).toBe(EXPECTED_TITLE_COUNT);
    expect(TITLED_PSALMS.length).toBe(116);
    expect(descriptiveTitle("HAB", 3)).toBeString();
  });

  test("Psalm 23 has one and Psalm 1 does not", () => {
    expect(descriptiveTitle("PSA", 23)).toBe("A Psalm of David.");
    expect(descriptiveTitle("PSA", 1)).toBeNull();
  });
});

describe("sequence integrity", () => {
  test("round-trips every book boundary", () => {
    for (const bookId of PROTESTANT_ORDER) {
      const sequence = sequenceOf(bookId, 1, 1);
      const located = locate(sequence);
      expect(located.book).toBe(bookId);
      expect(located.chapter).toBe(1);
      expect(located.verse).toBe(1);
    }
  });

  test("round-trips a sample across the whole range", () => {
    for (let sequence = 1; sequence <= TOTAL_VERSES; sequence += 97) {
      const verse = verseAt(sequence);
      expect(sequenceOf(verse.book, verse.chapter, verse.verse)).toBe(sequence);
    }
  });

  test("known verses land where they should", () => {
    expect(verseAt(1).id).toBe("GEN.1.1");
    expect(verseAt(TOTAL_VERSES).id).toBe("REV.22.21");
    expect(verseByReference("JHN", 3, 16).text).toContain("For God so loved the world");
    expect(verseByReference("PSA", 23, 1).text).toBe("Jehovah is my shepherd; I shall not want.");
  });

  test("preserves the divine name", () => {
    expect(verseByReference("EXO", 6, 3).text).toContain("Jehovah");
  });
});

describe("search index", () => {
  test('returns results for "God", the mandated smoke test', () => {
    const outcome = search("God", 20, 0);
    expect(outcome.total).toBeGreaterThan(0);
    expect(outcome.hits.length).toBe(20);
  });

  test("ranks the expected verse first for a distinctive phrase", () => {
    expect(search("good shepherd", 5, 0).hits[0]!.id).toBe("JHN.10.11");
    expect(search("beginning God created", 5, 0).hits[0]!.id).toBe("GEN.1.1");
  });

  test("supports prefix matching on the final token", () => {
    expect(search("believeth", 5, 0).total).toBeGreaterThan(0);
    expect(search("believet", 5, 0).total).toBeGreaterThan(0);
  });

  test("paginates without overlap", () => {
    const first = search("love", 5, 0).hits.map((hit) => hit.id);
    const second = search("love", 5, 5).hits.map((hit) => hit.id);
    expect(first).toHaveLength(5);
    expect(new Set([...first, ...second]).size).toBe(10);
  });

  test("caps work on an extremely common term and says so", () => {
    const outcome = search("the", 10, 0);
    expect(outcome.truncated).toBe(true);
    expect(outcome.hits.length).toBe(10);
  });

  test("returns nothing for a term absent from the ASV", () => {
    expect(search("zzzznotaword", 10, 0).total).toBe(0);
  });

  test("every hit's text actually contains the term", () => {
    for (const hit of search("shepherd", 20, 0).hits) {
      expect(hit.text.toLowerCase()).toContain("shepherd");
    }
  });
});
