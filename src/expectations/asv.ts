/**
 * The American Standard Version 1901, as eBible.org publishes it.
 *
 * Hand-authored ground truth. **Never derive any of this from `src/data/*`** —
 * those modules are what the build emits, so checking them against numbers taken
 * from themselves would pass on any corpus, including a wrong one. The
 * duplication between `books` here and the generated `VERSE_COUNTS` is the
 * test, not an oversight.
 *
 * Book order is deliberately absent: `EDITION_ORDER.asv` in `src/canon.ts`
 * already records what this edition prints, and is asserted against the canon
 * order by `src/edition.test.ts`.
 */

import type { CorpusExpectations } from "../validate.ts";

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

export const ASV: CorpusExpectations = {
  editionId: "asv",
  totalVerses: EXPECTED_TOTAL_VERSES,
  books: EXPECTED_BOOKS,
  emptyVerses: EXPECTED_EMPTY_VERSES,
  titleCount: EXPECTED_TITLE_COUNT,
  subscriptions: EXPECTED_SUBSCRIPTIONS,
  // The 16 omitted verses each carry an explanatory footnote.
  expectsNotes: true,
  dropped: EXPECTED_DROPPED,
  // The two ends of the disputed passage at John 7:53-8:11.
  unbalancedBrackets: ["JHN.7.53", "JHN.8.11"],
};
