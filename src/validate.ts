/**
 * Corpus assertions. Run at build time by scripts/build-data.ts and again as a
 * test suite. Any failure is fatal: the build refuses to emit data modules that
 * do not match what the edition is expected to contain.
 *
 * The assertions divide three ways, and the division is the whole design:
 *
 * - **Universal** — true of any Scripture edition. Chapters contiguous from 1,
 *   verses contiguous within a chapter, no duplicate coordinate, the coverage
 *   ledger balancing, no residual markup. These stay hardcoded, and they are
 *   the ones that cannot be rubber-stamped: the ledger either sums or it does
 *   not.
 * - **Edition-specific** — the fingerprint of one text. Verse totals, per-book
 *   counts, which verses are empty, how many superscriptions. These come in as
 *   {@link CorpusExpectations}.
 * - **Conditional** — guards that exist to catch routing which silently stopped
 *   working, and which therefore need to know whether the edition has anything
 *   to route. The ASV has 116 Psalm superscriptions; the Douay-Rheims has none,
 *   because it folds each one into verse 1. An empty title bucket is a bug in
 *   the first case and correct in the second.
 */

import type { UsfxDocument } from "./usfx.ts";
import { EDITION_ORDER, type EditionId } from "./canon.ts";

/**
 * What one edition is expected to contain.
 *
 * Authored by hand, never derived from `src/data/*` — see the note in
 * `src/expectations/asv.ts`.
 *
 * Book order normally comes from `EDITION_ORDER` rather than being repeated
 * here: `doc.books` is the order the source prints, and canon.ts already
 * records that per edition.
 */
export interface CorpusExpectations {
  readonly editionId: EditionId;
  /**
   * The order this edition prints its books, when canon.ts does not already
   * know it. Defaults to `EDITION_ORDER[editionId]`.
   *
   * This is the seam for the case the project exists to serve: a publisher
   * self-hosting a text whose printing order is theirs, not one of ours. They
   * should be able to validate their own corpus without editing canon.ts.
   */
  readonly order?: readonly string[];
  readonly totalVerses: number;
  readonly books: ReadonlyMap<string, { chapters: number; verses: number }>;
  /** Verses printed as numbered placeholders with no text, carrying a note. */
  readonly emptyVerses: readonly string[];
  /** Chapter superscriptions, all of which must sit in the Psalter. */
  readonly titleCount: number;
  /** Chapters closing with a line printed below the last verse. */
  readonly subscriptions: readonly string[];
  /**
   * Whether any verse carries a footnote. Explicit rather than inferred from
   * `emptyVerses`, because an edition may footnote without omitting anything,
   * and a guard that is quietly approximate is worse than one more field.
   */
  readonly expectsNotes: boolean;
  /** Characters dropped on purpose, by element — the lossy inventory. */
  readonly dropped: ReadonlyMap<string, number>;
  /** Verses whose brackets legitimately do not balance. */
  readonly unbalancedBrackets: readonly string[];
}

export class ValidationError extends Error {
  constructor(public readonly failures: readonly string[]) {
    super(`Corpus validation failed with ${failures.length} error(s):\n  - ${failures.join("\n  - ")}`);
    this.name = "ValidationError";
  }
}

/** Throws ValidationError listing every discrepancy, rather than the first. */
export function validateCorpus(
  doc: UsfxDocument,
  expected: CorpusExpectations,
): void {
  const failures: string[] = [];
  const order = expected.order ?? EDITION_ORDER[expected.editionId];

  if (doc.verses.length !== expected.totalVerses) {
    failures.push(
      `total verses: expected ${expected.totalVerses}, got ${doc.verses.length}`,
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

  if (doc.books.length !== order.length) {
    failures.push(
      `book count: expected ${order.length}, got ${doc.books.length}`,
    );
  }
  for (const [index, bookId] of doc.books.entries()) {
    const expectedId = order[index];
    if (expectedId !== bookId) {
      failures.push(
        `book order at position ${index + 1}: expected ${expectedId ?? "none"}, got ${bookId}`,
      );
    }
  }

  for (const [bookId, counts] of expected.books) {
    const chapters = byBook.get(bookId);
    if (chapters === undefined) {
      failures.push(`${bookId}: missing entirely`);
      continue;
    }
    const verseTotal = [...chapters.values()].reduce((sum, n) => sum + n, 0);
    if (chapters.size !== counts.chapters) {
      failures.push(
        `${bookId} chapters: expected ${counts.chapters}, got ${chapters.size}`,
      );
    }
    if (verseTotal !== counts.verses) {
      failures.push(`${bookId} verses: expected ${counts.verses}, got ${verseTotal}`);
    }
    // Chapters must be contiguous from 1..n with no gaps.
    for (let chapter = 1; chapter <= counts.chapters; chapter += 1) {
      if (!chapters.has(chapter)) failures.push(`${bookId} ${chapter}: missing chapter`);
    }
  }

  for (const bookId of byBook.keys()) {
    if (!expected.books.has(bookId)) failures.push(`${bookId}: unexpected book in source`);
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
  const expectedEmpty = [...expected.emptyVerses].sort();
  if (JSON.stringify([...empty].sort()) !== JSON.stringify(expectedEmpty)) {
    failures.push(
      `empty verses: expected [${expectedEmpty.join(", ")}], got [${[...empty].sort().join(", ")}]`,
    );
  }
  for (const bcv of expected.emptyVerses) {
    const verse = doc.verses.find((candidate) => candidate.bcv === bcv);
    if (verse !== undefined && verse.note === null) {
      failures.push(`${bcv}: omitted verse is missing its explanatory note`);
    }
  }

  if (doc.titles.size !== expected.titleCount) {
    failures.push(
      `superscriptions: expected ${expected.titleCount}, got ${doc.titles.size}`,
    );
  }
  for (const key of doc.titles.keys()) {
    if (!key.startsWith("PSA.")) {
      failures.push(`${key}: superscription outside the Psalter`);
    }
  }
  const subscriptions = [...doc.subscriptions.keys()].sort();
  if (JSON.stringify(subscriptions) !== JSON.stringify([...expected.subscriptions].sort())) {
    failures.push(
      `subscriptions: expected [${expected.subscriptions.join(", ")}], got [${subscriptions.join(", ")}]`,
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
  const expectedUnbalanced = [...expected.unbalancedBrackets].sort();
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

  for (const [element, characters] of expected.dropped) {
    const actual = ledger.dropped.get(element) ?? 0;
    if (actual !== characters) {
      failures.push(`dropped <${element}>: expected ${characters} characters, got ${actual}`);
    }
  }
  for (const element of ledger.dropped.keys()) {
    if (!expected.dropped.has(element)) {
      failures.push(`<${element}>: dropping text that was not previously dropped`);
    }
  }

  // An empty bucket means routing silently stopped working — but only if this
  // edition has anything to route. The Douay-Rheims has no superscriptions, no
  // subscriptions and no footnotes at all, so for it an empty bucket is the
  // correct result rather than a broken one.
  if (expected.titleCount > 0 && sum(ledger.toTitles) === 0) {
    failures.push("no text reached any chapter superscription");
  }
  if (expected.subscriptions.length > 0 && sum(ledger.toSubscriptions) === 0) {
    failures.push("no text reached any chapter subscription");
  }
  if (expected.expectsNotes && sum(ledger.toNotes) === 0) {
    failures.push("no text reached any verse note");
  }

  const withMarkup = doc.verses.filter((verse) => /[<>]/.test(verse.text));
  if (withMarkup.length > 0) {
    failures.push(
      `${withMarkup.length} verse(s) contain residual markup, e.g. ${withMarkup[0]?.bcv ?? ""}`,
    );
  }

  if (failures.length > 0) throw new ValidationError(failures);
}
