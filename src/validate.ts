/**
 * Corpus assertions. Run at build time by scripts/build-data.ts and again as a
 * test suite. Any failure is fatal: the build refuses to emit data modules that
 * do not match the known ASV versification.
 */

import type { UsfxDocument } from "./usfx.ts";
import { PROTESTANT_ORDER } from "./canon.ts";

/** Total verses in the traditional ASV/KJV versification. */
export const EXPECTED_TOTAL_VERSES = 31_102;

/**
 * Chapter and verse totals for each of the 66 books, in the traditional
 * ASV/KJV versification. These are the counts the ebible.org USFX edition must
 * reproduce exactly.
 */
export const EXPECTED_BOOKS: ReadonlyMap<string, { chapters: number; verses: number }> =
  new Map([
    ["GEN", { chapters: 50, verses: 1533 }], ["EXO", { chapters: 40, verses: 1213 }],
    ["LEV", { chapters: 27, verses: 859 }],  ["NUM", { chapters: 36, verses: 1288 }],
    ["DEU", { chapters: 34, verses: 959 }],  ["JOS", { chapters: 24, verses: 658 }],
    ["JDG", { chapters: 21, verses: 618 }],  ["RUT", { chapters: 4, verses: 85 }],
    ["1SA", { chapters: 31, verses: 810 }],  ["2SA", { chapters: 24, verses: 695 }],
    ["1KI", { chapters: 22, verses: 816 }],  ["2KI", { chapters: 25, verses: 719 }],
    ["1CH", { chapters: 29, verses: 942 }],  ["2CH", { chapters: 36, verses: 822 }],
    ["EZR", { chapters: 10, verses: 280 }],  ["NEH", { chapters: 13, verses: 406 }],
    ["EST", { chapters: 10, verses: 167 }],  ["JOB", { chapters: 42, verses: 1070 }],
    ["PSA", { chapters: 150, verses: 2461 }],["PRO", { chapters: 31, verses: 915 }],
    ["ECC", { chapters: 12, verses: 222 }],  ["SNG", { chapters: 8, verses: 117 }],
    ["ISA", { chapters: 66, verses: 1292 }], ["JER", { chapters: 52, verses: 1364 }],
    ["LAM", { chapters: 5, verses: 154 }],   ["EZK", { chapters: 48, verses: 1273 }],
    ["DAN", { chapters: 12, verses: 357 }],  ["HOS", { chapters: 14, verses: 197 }],
    ["JOL", { chapters: 3, verses: 73 }],    ["AMO", { chapters: 9, verses: 146 }],
    ["OBA", { chapters: 1, verses: 21 }],    ["JON", { chapters: 4, verses: 48 }],
    ["MIC", { chapters: 7, verses: 105 }],   ["NAM", { chapters: 3, verses: 47 }],
    ["HAB", { chapters: 3, verses: 56 }],    ["ZEP", { chapters: 3, verses: 53 }],
    ["HAG", { chapters: 2, verses: 38 }],    ["ZEC", { chapters: 14, verses: 211 }],
    ["MAL", { chapters: 4, verses: 55 }],    ["MAT", { chapters: 28, verses: 1071 }],
    ["MRK", { chapters: 16, verses: 678 }],  ["LUK", { chapters: 24, verses: 1151 }],
    ["JHN", { chapters: 21, verses: 879 }],  ["ACT", { chapters: 28, verses: 1007 }],
    ["ROM", { chapters: 16, verses: 433 }],  ["1CO", { chapters: 16, verses: 437 }],
    ["2CO", { chapters: 13, verses: 257 }],  ["GAL", { chapters: 6, verses: 149 }],
    ["EPH", { chapters: 6, verses: 155 }],   ["PHP", { chapters: 4, verses: 104 }],
    ["COL", { chapters: 4, verses: 95 }],    ["1TH", { chapters: 5, verses: 89 }],
    ["2TH", { chapters: 3, verses: 47 }],    ["1TI", { chapters: 6, verses: 113 }],
    ["2TI", { chapters: 4, verses: 83 }],    ["TIT", { chapters: 3, verses: 46 }],
    ["PHM", { chapters: 1, verses: 25 }],    ["HEB", { chapters: 13, verses: 303 }],
    ["JAS", { chapters: 5, verses: 108 }],   ["1PE", { chapters: 5, verses: 105 }],
    ["2PE", { chapters: 3, verses: 61 }],    ["1JN", { chapters: 5, verses: 105 }],
    ["2JN", { chapters: 1, verses: 13 }],    ["3JN", { chapters: 1, verses: 14 }],
    ["JUD", { chapters: 1, verses: 25 }],    ["REV", { chapters: 22, verses: 404 }],
  ]);

/**
 * The 16 verses the ASV omits from its text, retained as numbered placeholders
 * carrying only a footnote. They are expected to have empty text and a note.
 */
export const EXPECTED_EMPTY_VERSES: readonly string[] = [
  "MAT.17.21", "MAT.18.11", "MAT.23.14",
  "MRK.7.16", "MRK.9.44", "MRK.9.46", "MRK.11.26", "MRK.15.28",
  "LUK.17.36", "LUK.23.17",
  "JHN.5.4",
  "ACT.8.37", "ACT.15.34", "ACT.24.7", "ACT.28.29",
  "ROM.16.24",
];

/**
 * The 116 Psalms carrying a superscription ("A Psalm of David.").
 * Every `<d>` in the ASV outside these is the single Habakkuk 3 subscription.
 */
export const EXPECTED_TITLE_COUNT = 116;

/**
 * Habakkuk 3 closes with "For the Chief Musician, on my stringed instruments",
 * printed below verse 19. It uses the same `<d>` element as a superscription,
 * so a parser that keys on the element alone files it as a chapter heading.
 */
export const EXPECTED_SUBSCRIPTIONS: readonly string[] = ["HAB.3"];

/**
 * Characters the parser drops on purpose, by element — the lossy inventory.
 * These are document furniture, not scripture: the book id line, the running
 * header, table-of-contents entries, the language code, and footnote callers.
 *
 * Asserted rather than merely reported. A change here means the source's shape
 * changed, and the question of whether text moved from a kept element to a
 * dropped one deserves an answer before the corpus is republished.
 */
export const EXPECTED_DROPPED: ReadonlyMap<string, number> = new Map([
  ["languageCode", 3],
  ["id", 1904],
  ["h", 585],
  ["toc", 2809],
  ["fr", 89],
]);

export class ValidationError extends Error {
  constructor(public readonly failures: readonly string[]) {
    super(`Corpus validation failed with ${failures.length} error(s):\n  - ${failures.join("\n  - ")}`);
    this.name = "ValidationError";
  }
}

/** Throws ValidationError listing every discrepancy, rather than the first. */
export function validateCorpus(doc: UsfxDocument): void {
  const failures: string[] = [];

  if (doc.verses.length !== EXPECTED_TOTAL_VERSES) {
    failures.push(
      `total verses: expected ${EXPECTED_TOTAL_VERSES}, got ${doc.verses.length}`,
    );
  }

  const byBook = new Map<string, Map<number, number>>();
  for (const verse of doc.verses) {
    let chapters = byBook.get(verse.book);
    if (chapters === undefined) {
      chapters = new Map<number, number>();
      byBook.set(verse.book, chapters);
    }
    chapters.set(verse.chapter, (chapters.get(verse.chapter) ?? 0) + 1);
  }

  if (doc.books.length !== PROTESTANT_ORDER.length) {
    failures.push(
      `book count: expected ${PROTESTANT_ORDER.length}, got ${doc.books.length}`,
    );
  }
  for (const [index, bookId] of doc.books.entries()) {
    const expectedId = PROTESTANT_ORDER[index];
    if (expectedId !== bookId) {
      failures.push(
        `book order at position ${index + 1}: expected ${expectedId ?? "none"}, got ${bookId}`,
      );
    }
  }

  for (const [bookId, expected] of EXPECTED_BOOKS) {
    const chapters = byBook.get(bookId);
    if (chapters === undefined) {
      failures.push(`${bookId}: missing entirely`);
      continue;
    }
    const verseTotal = [...chapters.values()].reduce((sum, n) => sum + n, 0);
    if (chapters.size !== expected.chapters) {
      failures.push(
        `${bookId} chapters: expected ${expected.chapters}, got ${chapters.size}`,
      );
    }
    if (verseTotal !== expected.verses) {
      failures.push(`${bookId} verses: expected ${expected.verses}, got ${verseTotal}`);
    }
    // Chapters must be contiguous from 1..n with no gaps.
    for (let chapter = 1; chapter <= expected.chapters; chapter += 1) {
      if (!chapters.has(chapter)) failures.push(`${bookId} ${chapter}: missing chapter`);
    }
  }

  for (const bookId of byBook.keys()) {
    if (!EXPECTED_BOOKS.has(bookId)) failures.push(`${bookId}: unexpected book in source`);
  }

  // Verses must be contiguous from 1..n within every chapter.
  const seen = new Set<string>();
  for (const verse of doc.verses) {
    if (seen.has(verse.bcv)) failures.push(`${verse.bcv}: duplicate verse`);
    seen.add(verse.bcv);
  }
  for (const [bookId, chapters] of byBook) {
    for (const [chapter, count] of chapters) {
      for (let verse = 1; verse <= count; verse += 1) {
        if (!seen.has(`${bookId}.${chapter}.${verse}`)) {
          failures.push(`${bookId}.${chapter}.${verse}: gap in verse numbering`);
        }
      }
    }
  }

  const empty = doc.verses.filter((verse) => verse.text === "").map((verse) => verse.bcv);
  const expectedEmpty = [...EXPECTED_EMPTY_VERSES].sort();
  if (JSON.stringify([...empty].sort()) !== JSON.stringify(expectedEmpty)) {
    failures.push(
      `empty verses: expected [${expectedEmpty.join(", ")}], got [${[...empty].sort().join(", ")}]`,
    );
  }
  for (const bcv of EXPECTED_EMPTY_VERSES) {
    const verse = doc.verses.find((candidate) => candidate.bcv === bcv);
    if (verse !== undefined && verse.note === null) {
      failures.push(`${bcv}: omitted verse is missing its explanatory note`);
    }
  }

  if (doc.titles.size !== EXPECTED_TITLE_COUNT) {
    failures.push(
      `superscriptions: expected ${EXPECTED_TITLE_COUNT}, got ${doc.titles.size}`,
    );
  }
  for (const key of doc.titles.keys()) {
    if (!key.startsWith("PSA.")) {
      failures.push(`${key}: superscription outside the Psalter`);
    }
  }
  const subscriptions = [...doc.subscriptions.keys()].sort();
  if (JSON.stringify(subscriptions) !== JSON.stringify([...EXPECTED_SUBSCRIPTIONS].sort())) {
    failures.push(
      `subscriptions: expected [${EXPECTED_SUBSCRIPTIONS.join(", ")}], got [${subscriptions.join(", ")}]`,
    );
  }

  // Selah markers must read "[Selah]"; the only brackets left open are the two
  // ends of the disputed passage at John 7:53-8:11, which span 13 verses.
  const unbalanced = doc.verses
    .filter((verse) => {
      const opens = (verse.text.match(/\[/g) ?? []).length;
      const closes = (verse.text.match(/\]/g) ?? []).length;
      return opens !== closes;
    })
    .map((verse) => verse.bcv)
    .sort();
  const expectedUnbalanced = ["JHN.7.53", "JHN.8.11"];
  if (JSON.stringify(unbalanced) !== JSON.stringify(expectedUnbalanced)) {
    failures.push(
      `unbalanced brackets: expected only [${expectedUnbalanced.join(", ")}], got [${unbalanced.join(", ")}]`,
    );
  }
  const openSelah = doc.verses.filter((verse) => /\[(Selah|Higgaion)[^\]]*$/.test(verse.text));
  if (openSelah.length > 0) {
    failures.push(
      `${openSelah.length} Selah marker(s) left unclosed, e.g. ${openSelah[0]?.bcv ?? ""}`,
    );
  }

  // Coverage: every character of source text is either emitted somewhere or
  // dropped somewhere. Text moving to the wrong destination shifts two buckets;
  // text vanishing breaks the sum.
  const ledger = doc.ledger;
  const sum = (bucket: ReadonlyMap<string, number>): number =>
    [...bucket.values()].reduce((total, n) => total + n, 0);
  const accounted =
    sum(ledger.toVerses) +
    sum(ledger.toTitles) +
    sum(ledger.toSubscriptions) +
    sum(ledger.toNotes) +
    sum(ledger.dropped) +
    ledger.unattributed;
  if (accounted !== ledger.sourceCharacters) {
    failures.push(
      `coverage: ${ledger.sourceCharacters} source characters but ${accounted} accounted for ` +
        `(${ledger.sourceCharacters - accounted} unexplained)`,
    );
  }

  for (const [element, expected] of EXPECTED_DROPPED) {
    const actual = ledger.dropped.get(element) ?? 0;
    if (actual !== expected) {
      failures.push(`dropped <${element}>: expected ${expected} characters, got ${actual}`);
    }
  }
  for (const element of ledger.dropped.keys()) {
    if (!EXPECTED_DROPPED.has(element)) {
      failures.push(`<${element}>: dropping text that was not previously dropped`);
    }
  }

  // The superscription of a titled Psalm must reach the title bucket, and
  // Habakkuk's closing line the subscription bucket. Empty buckets would mean
  // the routing silently stopped working.
  if (sum(ledger.toTitles) === 0) failures.push("no text reached any chapter superscription");
  if (sum(ledger.toSubscriptions) === 0) failures.push("no text reached any chapter subscription");
  if (sum(ledger.toNotes) === 0) failures.push("no text reached any verse note");

  const withMarkup = doc.verses.filter((verse) => /[<>]/.test(verse.text));
  if (withMarkup.length > 0) {
    failures.push(
      `${withMarkup.length} verse(s) contain residual markup, e.g. ${withMarkup[0]?.bcv ?? ""}`,
    );
  }

  if (failures.length > 0) throw new ValidationError(failures);
}
