/**
 * The USFM reader, checked against a text we already trust.
 *
 * A new parser for a format nobody has ingested before is hard to validate:
 * there is no known-good corpus to compare against, so a subtle
 * misclassification produces a plausible Bible that is quietly wrong.
 *
 * The ASV avoids that entirely. eBible publishes it in both formats from the
 * same underlying text, and this project has already ingested and served the
 * USFX. So the USFM reader has an exact target: parse the other format and it
 * must produce the same 31,102 verses, character for character, with the same
 * 116 superscriptions and the same single Habakkuk subscription.
 *
 * These tests use small fixtures for behaviour and the real archive for
 * equivalence. The archive tests are skipped when `.cache/` has not been
 * populated, so a fresh clone still runs green without a 19 MB download.
 */
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { parseUsfm, UnknownMarkerError } from "./usfm.ts";
import { sumLedger } from "./document.ts";

const BUNDLE = new URL("../.cache/asv-usfm", import.meta.url).pathname;
const hasArchive = existsSync(BUNDLE);

function book(body: string, id = "GEN"): string {
  return `\\id ${id} - Test\n\\h Test\n\\c 1\n${body}`;
}

describe("markers must be classified or the build stops", () => {
  test("an unknown marker throws rather than being absorbed", () => {
    expect(() => parseUsfm(book("\\p\n\\v 1 In the \\zbogus beginning."))).toThrow(
      UnknownMarkerError,
    );
  });

  test("the message says what to do about it", () => {
    try {
      parseUsfm(book("\\p\n\\v 1 A \\znovel thing."));
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as Error).message).toContain("\\znovel");
      expect((error as Error).message).toContain("MARKER_ROLES");
    }
  });
});

describe("the shapes that make USFM harder than its XML cousin", () => {
  test("a paragraph marker inside a verse does not end it", () => {
    // A reader that treated every marker as a boundary would lose the second
    // half of most poetry.
    const doc = parseUsfm(book("\\q1\n\\v 1 First line,\n\\q1 second line.\n\\v 2 Next."));
    expect(doc.verses).toHaveLength(2);
    expect(doc.verses[0]!.text).toBe("First line, second line.");
  });

  test("a marker's separating space is syntax, not text", () => {
    // `\w the|strong="H1"` is the word "the"; keeping the separator turns
    // "Calah (the same" into "Calah ( the same".
    const doc = parseUsfm(book(`\\p\n\\v 1 Calah (\\w the|strong="H1"\\w* same).`));
    expect(doc.verses[0]!.text).toBe("Calah (the same).");
  });

  test("a marker nested in another carries a + that is not part of its name", () => {
    const doc = parseUsfm(book(`\\p\n\\v 1 Done. [\\+w Selah\\+w*]`));
    expect(doc.verses[0]!.text).toBe("Done. [Selah]");
  });

  test("an unclosed Selah bracket is repaired", () => {
    const doc = parseUsfm(book("\\p\n\\v 1 Done. \\qs [Selah\\qs*"));
    expect(doc.verses[0]!.text).toBe("Done. [Selah]");
  });

  test("a footnote goes to the note, and its caller is dropped", () => {
    const doc = parseUsfm(
      book("\\p\n\\v 1 \\f + \\fr 1.1 \\ft Some authorities omit this.\\f*"),
    );
    expect(doc.verses[0]!.note).toBe("Some authorities omit this.");
    expect(doc.verses[0]!.text).toBe("");
  });
});

describe("\\d is a superscription above and a subscription below", () => {
  // The same distinction `<d>` carries in USFX, and only position separates
  // them. Habakkuk 3 is the one subscription in the ASV.
  test("before a verse it is a superscription", () => {
    const doc = parseUsfm(book("\\d A Psalm of David.\n\\q1\n\\v 1 Jehovah.", "PSA"));
    expect(doc.titles.get("PSA.1")).toBe("A Psalm of David.");
    expect(doc.subscriptions.size).toBe(0);
  });

  test("after the last verse it is a subscription", () => {
    const doc = parseUsfm(book("\\q1\n\\v 1 Jehovah.\n\\d For the Chief Musician.", "HAB"));
    expect(doc.subscriptions.get("HAB.1")).toBe("For the Chief Musician.");
    expect(doc.titles.size).toBe(0);
  });
});

describe("the coverage ledger", () => {
  test("every source character is accounted for", () => {
    const doc = parseUsfm(book(`\\p\n\\v 1 Calah (\\w the|strong="H1"\\w* same).`));
    expect(sumLedger(doc.ledger)).toBe(doc.ledger.sourceCharacters);
  });

  test("a \\w attribute tail is dropped, not silently lost from the ledger", () => {
    const doc = parseUsfm(book(`\\p\n\\v 1 \\w the|strong="H1"\\w* word.`));
    expect(doc.verses[0]!.text).toBe("the word.");
    expect(doc.ledger.dropped.get("word-attribute")).toBeGreaterThan(0);
    expect(sumLedger(doc.ledger)).toBe(doc.ledger.sourceCharacters);
  });

  test("the \\id and \\c lines balance even though nothing under them is stored", () => {
    // book() itself already exercises \id and \c — this pins the balance
    // rather than the id/chapter values, which are covered elsewhere.
    const doc = parseUsfm(book("\\p\n\\v 1 Text.", "PSA"));
    expect(doc.ledger.dropped.get("id")).toBeGreaterThan(0);
    expect(doc.ledger.dropped.get("chapter-number")).toBeGreaterThan(0);
    expect(sumLedger(doc.ledger)).toBe(doc.ledger.sourceCharacters);
  });

  test("an opener immediately followed by another marker still balances", () => {
    // \p\n\q1 — the tokenizer strips the one-space separator down to "",
    // pushing no token at all; the stripped character still has to be
    // accounted for.
    const doc = parseUsfm(book("\\p \\q1\n\\v 1 Text."));
    expect(doc.verses[0]!.text).toBe("Text.");
    expect(sumLedger(doc.ledger)).toBe(doc.ledger.sourceCharacters);
  });

  test("a title balances, and lands in toTitles or toSubscriptions once its destination is known", () => {
    const before = parseUsfm(book("\\d A Psalm of David.\n\\q1\n\\v 1 Jehovah.", "PSA"));
    expect(sumLedger(before.ledger)).toBe(before.ledger.sourceCharacters);
    expect(before.ledger.toTitles.size).toBeGreaterThan(0);
    expect(before.ledger.toSubscriptions.size).toBe(0);

    const after = parseUsfm(book("\\q1\n\\v 1 Jehovah.\n\\d For the Chief Musician.", "HAB"));
    expect(sumLedger(after.ledger)).toBe(after.ledger.sourceCharacters);
    expect(after.ledger.toSubscriptions.size).toBeGreaterThan(0);
    expect(after.ledger.toTitles.size).toBe(0);
  });

  test("a footnote balances", () => {
    const doc = parseUsfm(
      book("\\p\n\\v 1 \\f + \\fr 1.1 \\ft Some authorities omit this.\\f*"),
    );
    expect(sumLedger(doc.ledger)).toBe(doc.ledger.sourceCharacters);
    expect(doc.ledger.toNotes.size).toBeGreaterThan(0);
  });
});

describe("front matter is not scripture", () => {
  test("FRT and INT books are read but contribute no verses", () => {
    const doc = parseUsfm(
      `\\id FRT - Front\n\\p Some preface.\n` + book("\\p\n\\v 1 Real text."),
    );
    expect(doc.books).toEqual(["GEN"]);
    expect(doc.verses).toHaveLength(1);
  });
});

describe.skipIf(!hasArchive)("the ASV, read from USFM, is the ASV", () => {
  test("every verse matches the corpus built from USFX", async () => {
    const { readLocal } = await import("../scripts/sources.ts");
    const { verseAt, totalVersesOf } = await import("./corpus.ts");
    const doc = parseUsfm((await readLocal(BUNDLE)).text);

    expect(doc.verses).toHaveLength(totalVersesOf("asv"));

    let text = 0;
    let ids = 0;
    let notes = 0;
    for (let index = 0; index < doc.verses.length; index += 1) {
      const mine = doc.verses[index]!;
      const known = verseAt(index + 1, "asv");
      if (mine.bcv !== known.id) ids += 1;
      if (mine.text !== known.text) text += 1;
      if ((mine.note ?? null) !== (known.note ?? null)) notes += 1;
    }
    expect({ ids, text, notes }).toEqual({ ids: 0, text: 0, notes: 0 });
  });

  test("the coverage ledger balances against the real archive", async () => {
    const { readLocal } = await import("../scripts/sources.ts");
    const doc = parseUsfm((await readLocal(BUNDLE)).text);
    expect(sumLedger(doc.ledger)).toBe(doc.ledger.sourceCharacters);
    // The \w attribute tail is the largest single gap this ledger closes —
    // roughly two thirds of all source characters, since almost every word
    // is Strong's-tagged. A small nonzero count would be easy to get by
    // accident; this pins the order of magnitude.
    expect(doc.ledger.dropped.get("word-attribute")).toBeGreaterThan(5_000_000);
  });

  test("and so do its superscriptions, subscription and book order", async () => {
    const { readLocal } = await import("../scripts/sources.ts");
    const { parseUsfx } = await import("./usfx.ts");
    const usfm = parseUsfm((await readLocal(BUNDLE)).text);
    const usfx = parseUsfx(
      await Bun.file(new URL("../.cache/eng-asv_usfx.xml", import.meta.url)).text(),
    );

    expect(usfm.books).toEqual([...usfx.books]);
    expect([...usfm.titles.entries()].sort()).toEqual([...usfx.titles.entries()].sort());
    expect([...usfm.subscriptions.entries()].sort()).toEqual(
      [...usfx.subscriptions.entries()].sort(),
    );
  });
});
