/**
 * Tests the gate, not the corpus.
 *
 * `validateCorpus` is what stands between a malformed ingest and published
 * Scripture, and it runs exactly once in the whole codebase — at
 * `scripts/build-data.ts:280`. A validator nobody has watched fail is a
 * validator nobody knows works, so each dimension here is exercised by feeding
 * it a document that should trip it.
 *
 * The conditional guards get particular attention. They exist to catch routing
 * that silently stopped working, and they were previously unconditional: an
 * empty title bucket always failed. That is right for the ASV, which has 116
 * Psalm superscriptions, and wrong for the Douay-Rheims, which has none because
 * it folds each one into verse 1. Both directions are asserted below.
 */
import { describe, expect, test } from "bun:test";
import { parseUsfx, type UsfxDocument } from "./usfx.ts";
import { validateCorpus, ValidationError, type CorpusExpectations } from "./validate.ts";

/** A two-book document in the shape the real archives use. */
function document(body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?><usfx><languageCode>eng</languageCode>${body}</usfx>`;
}

function book(id: string, verses: readonly string[], extra = ""): string {
  const numbered = verses
    .map(
      (text, i) =>
        `<v id="${i + 1}" bcv="${id}.1.${i + 1}" />${text}<ve />`,
    )
    .join("");
  return (
    `<book id="${id}"><id id="${id}">- Test</id><h>${id}</h><toc level="1">${id}</toc>` +
    `<c id="1" />${extra}<p style="p">${numbered}</p></book>`
  );
}

const TWO_BOOKS = document(book("GEN", ["In the beginning."]) + book("EXO", ["Now these are the names."]));

/** The minimum expectation set that TWO_BOOKS satisfies. */
const BASE: CorpusExpectations = {
  editionId: "asv",
  // A two-book edition: supplying the order directly is the same mechanism a
  // self-hosting publisher uses for a text canon.ts has never heard of.
  order: ["GEN", "EXO"],
  totalVerses: 2,
  books: new Map([
    ["GEN", { chapters: 1, verses: 1 }],
    ["EXO", { chapters: 1, verses: 1 }],
  ]),
  emptyVerses: [],
  titleCount: 0,
  subscriptions: [],
  expectsNotes: false,
  dropped: new Map(),
  unbalancedBrackets: [],
};

/** Only the ledger and book-order checks care about the real edition order. */
function expectationsFor(doc: UsfxDocument, over: Partial<CorpusExpectations> = {}): CorpusExpectations {
  const dropped = new Map<string, number>();
  for (const [element, count] of doc.ledger.dropped) dropped.set(element, count);
  return { ...BASE, dropped, ...over };
}

function failuresFrom(fn: () => void): readonly string[] {
  try {
    fn();
  } catch (error) {
    if (error instanceof ValidationError) return error.failures;
    throw error;
  }
  return [];
}

describe("the gate passes a document that matches its expectations", () => {
  test("no failures for a well-formed corpus", () => {
    const doc = parseUsfx(TWO_BOOKS);
    expect(failuresFrom(() => validateCorpus(doc, expectationsFor(doc)))).toEqual([]);
  });
});

describe("the gate catches each kind of corruption", () => {
  const doc = parseUsfx(TWO_BOOKS);

  test("a wrong verse total", () => {
    const failures = failuresFrom(() =>
      validateCorpus(doc, expectationsFor(doc, { totalVerses: 3 })),
    );
    expect(failures.join()).toContain("total verses: expected 3, got 2");
  });

  test("a book present in the source but not expected", () => {
    const failures = failuresFrom(() =>
      validateCorpus(doc, expectationsFor(doc, {
        books: new Map([["GEN", { chapters: 1, verses: 1 }]]),
      })),
    );
    expect(failures.join()).toContain("EXO: unexpected book in source");
  });

  test("a wrong per-book chapter count", () => {
    const failures = failuresFrom(() =>
      validateCorpus(doc, expectationsFor(doc, {
        books: new Map([
          ["GEN", { chapters: 2, verses: 1 }],
          ["EXO", { chapters: 1, verses: 1 }],
        ]),
      })),
    );
    expect(failures.join()).toContain("GEN chapters: expected 2, got 1");
    expect(failures.join()).toContain("GEN 2: missing chapter");
  });

  test("books printed out of the edition's order", () => {
    // EXO before GEN contradicts EDITION_ORDER.asv
    const swapped = parseUsfx(
      document(book("EXO", ["Now these are the names."]) + book("GEN", ["In the beginning."])),
    );
    const failures = failuresFrom(() => validateCorpus(swapped, expectationsFor(swapped)));
    expect(failures.join()).toContain("book order at position 1");
  });

  test("an element dropping text it did not drop before", () => {
    const failures = failuresFrom(() =>
      validateCorpus(doc, expectationsFor(doc, { dropped: new Map() })),
    );
    expect(failures.join()).toContain("dropping text that was not previously dropped");
  });

  test("a verse still carrying markup is refused", () => {
    // The parser strips tags, so residual markup can only arrive as an entity.
    const withMarkup = parseUsfx(document(book("GEN", ["A &lt;b&gt; tag."])));
    const failures = failuresFrom(() =>
      validateCorpus(withMarkup, expectationsFor(withMarkup, {
        totalVerses: 1,
        books: new Map([["GEN", { chapters: 1, verses: 1 }]]),
      })),
    );
    expect(failures.join()).toContain("residual markup");
  });
});

describe("the conditional guards read their premise from the edition", () => {
  // This is the change that lets the Douay-Rheims through. Getting it backwards
  // in either direction is the failure worth catching.
  const doc = parseUsfx(TWO_BOOKS); // no titles, no subscriptions, no notes

  test("an edition expecting no superscriptions passes with an empty bucket", () => {
    const failures = failuresFrom(() =>
      validateCorpus(doc, expectationsFor(doc, { titleCount: 0 })),
    );
    expect(failures.join()).not.toContain("superscription");
  });

  test("an edition expecting superscriptions fails on an empty bucket", () => {
    const failures = failuresFrom(() =>
      validateCorpus(doc, expectationsFor(doc, { titleCount: 116 })),
    );
    expect(failures.join()).toContain("no text reached any chapter superscription");
  });

  test("subscriptions behave the same way", () => {
    expect(
      failuresFrom(() => validateCorpus(doc, expectationsFor(doc, { subscriptions: [] }))).join(),
    ).not.toContain("subscription");
    expect(
      failuresFrom(() =>
        validateCorpus(doc, expectationsFor(doc, { subscriptions: ["HAB.3"] })),
      ).join(),
    ).toContain("no text reached any chapter subscription");
  });

  test("notes behave the same way", () => {
    expect(
      failuresFrom(() => validateCorpus(doc, expectationsFor(doc, { expectsNotes: false }))).join(),
    ).not.toContain("verse note");
    expect(
      failuresFrom(() => validateCorpus(doc, expectationsFor(doc, { expectsNotes: true }))).join(),
    ).toContain("no text reached any verse note");
  });
});

describe("the real ASV expectations still describe the real ASV", () => {
  test("the shipped expectation set is internally consistent", async () => {
    const { ASV } = await import("./expectations/asv.ts");
    const total = [...ASV.books.values()].reduce((sum, b) => sum + b.verses, 0);
    expect(total).toBe(ASV.totalVerses);
    expect(ASV.books.size).toBe(66);
    expect(ASV.editionId).toBe("asv");
    // Every superscription the ASV carries sits in the Psalter, so the count
    // cannot exceed the number of Psalms.
    expect(ASV.titleCount).toBeLessThanOrEqual(150);
  });
});
