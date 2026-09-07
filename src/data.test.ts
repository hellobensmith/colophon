import { describe, expect, test } from "bun:test";
import {
  EXPECTED_BOOKS,
  EXPECTED_EMPTY_VERSES,
  EXPECTED_SUBSCRIPTIONS,
  EXPECTED_TITLE_COUNT,
  EXPECTED_TOTAL_VERSES,
} from "./validate.ts";
import { VERSE_COUNTS, TITLES, SUBSCRIPTIONS, NOTES, TITLED_PSALMS } from "./data/meta.ts";
import {
  TOTAL_VERSES,
  textAt,
  verseAt,
  verseByReference,
  descriptiveTitle,
  subscription,
} from "./corpus.ts";
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
  test("116 superscriptions, every one of them a Psalm", () => {
    expect(Object.keys(TITLES).length).toBe(EXPECTED_TITLE_COUNT);
    expect(TITLED_PSALMS.length).toBe(116);
    for (const key of Object.keys(TITLES)) expect(key.startsWith("PSA.")).toBe(true);
  });

  test("Psalm 23 has one and Psalm 1 does not", () => {
    expect(descriptiveTitle("PSA", 23)).toBe("A Psalm of David.");
    expect(descriptiveTitle("PSA", 1)).toBeNull();
  });

  /**
   * USFX marks a subscription with the same <d> element as a superscription, so
   * a parser keying on the element alone files Habakkuk's closing line as a
   * chapter heading — or, if it reads <d> as verse content, appends it to
   * verse 19. Neither should happen.
   */
  test("Habakkuk 3's closing line is a subscription, not a heading", () => {
    expect(Object.keys(SUBSCRIPTIONS)).toEqual([...EXPECTED_SUBSCRIPTIONS]);
    expect(descriptiveTitle("HAB", 3)).toBeNull();
    expect(subscription("HAB", 3)).toBe("For the Chief Musician, on my stringed instruments.");
  });

  test("the subscription never leaks into the surrounding verses", () => {
    const last = verseByReference("HAB", 3, 19);
    expect(last.text).toContain("walk upon my high places");
    expect(last.text).not.toContain("Chief Musician");
    // Habakkuk 3's own superscription is a numbered verse in the ASV.
    expect(verseByReference("HAB", 3, 1).text).toBe(
      "A prayer of Habakkuk the prophet, set to Shigionoth.",
    );
  });

  test("no Psalm carries a subscription", () => {
    for (const key of Object.keys(SUBSCRIPTIONS)) expect(key.startsWith("PSA.")).toBe(false);
  });
});

describe("editorial brackets", () => {
  test("Selah markers are closed", () => {
    const psalm3 = verseByReference("PSA", 3, 2).text;
    expect(psalm3).toContain("[Selah]");
    expect(psalm3).not.toMatch(/\[Selah$/);
  });

  /**
   * The ASV brackets John 7:53-8:11 to mark the passage's disputed manuscript
   * standing. That bracket opens in one verse and closes thirteen verses later,
   * so it is legitimately unbalanced per verse — balancing brackets verse by
   * verse would destroy real textual apparatus to tidy a markup artifact.
   */
  test("the disputed passage keeps its bracket across 13 verses", () => {
    expect(verseByReference("JHN", 7, 53).text.startsWith("[")).toBe(true);
    expect(verseByReference("JHN", 8, 11).text.endsWith("]")).toBe(true);
  });

  test("no other verse has an unbalanced bracket", () => {
    const unbalanced: string[] = [];
    for (let sequence = 1; sequence <= TOTAL_VERSES; sequence += 1) {
      const text = textAt(sequence);
      const opens = (text.match(/\[/g) ?? []).length;
      const closes = (text.match(/\]/g) ?? []).length;
      if (opens !== closes) unbalanced.push(verseAt(sequence).id);
    }
    expect(unbalanced).toEqual(["JHN.7.53", "JHN.8.11"]);
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

  test("locate agrees with sequenceOf at every book and chapter boundary", () => {
    // locate() became a binary search to keep a 500-verse passage affordable;
    // a scan and a search must not disagree at the edges.
    for (const bookId of PROTESTANT_ORDER) {
      const chapters = VERSE_COUNTS[bookId]!;
      for (let chapter = 1; chapter <= chapters.length; chapter += 1) {
        for (const verse of [1, chapters[chapter - 1]!]) {
          const sequence = sequenceOf(bookId, chapter, verse);
          expect(locate(sequence)).toEqual({ book: bookId, chapter, verse });
        }
      }
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
