/**
 * The Douay-Rheims, as eBible.org publishes it (engDRA).
 *
 * Hand-authored ground truth, like \`asv.ts\` — **never derive any of this from
 * \`src/data/*\`.** A gate fed numbers taken from its own output agrees with
 * whatever it is given.
 *
 * Every figure below was produced by \`bun run build:data --translation dra
 * --report\`, which asserts nothing and writes nothing, and then checked four
 * ways before being written down:
 *
 * - the per-book verses sum to 35,811, the total the parser reported
 * - the printed book order matches \`EDITION_ORDER.dra\` with no mismatches
 * - the coverage ledger balances exactly: 4,652,766 source characters =
 *   4,645,927 to verses + 3,559 dropped + 3,280 unattributed
 * - every headline figure matches the independent measurement recorded in
 *   docs/STATE.md on 7 September
 *
 * What makes this edition worth having: it agrees with the ASV about almost
 * nothing structural. No superscriptions, because it folds each psalm title
 * into verse 1. No footnotes, so no empty verses. Seven books the ASV does not
 * carry at all. Thirty-two of the sixty-six shared books numbered differently.
 */

import type { CorpusExpectations } from "../validate.ts";

/** Chapter and verse totals per book, in the order engDRA prints them. */
const BOOKS: ReadonlyMap<string, { chapters: number; verses: number }> = new Map([
    ["GEN", { chapters: 50, verses: 1531 }],     ["EXO", { chapters: 40, verses: 1211 }],
    ["LEV", { chapters: 27, verses: 858 }],      ["NUM", { chapters: 36, verses: 1288 }],
    ["DEU", { chapters: 34, verses: 959 }],      ["JOS", { chapters: 24, verses: 658 }],
    ["JDG", { chapters: 21, verses: 618 }],      ["RUT", { chapters: 4, verses: 85 }],
    ["1SA", { chapters: 31, verses: 811 }],      ["2SA", { chapters: 24, verses: 695 }],
    ["1KI", { chapters: 22, verses: 817 }],      ["2KI", { chapters: 25, verses: 719 }],
    ["1CH", { chapters: 29, verses: 940 }],      ["2CH", { chapters: 36, verses: 822 }],
    ["EZR", { chapters: 10, verses: 280 }],      ["NEH", { chapters: 13, verses: 404 }],
    ["EST", { chapters: 16, verses: 275 }],      ["JOB", { chapters: 42, verses: 1070 }],
    ["PSA", { chapters: 150, verses: 2530 }],    ["PRO", { chapters: 31, verses: 915 }],
    ["ECC", { chapters: 12, verses: 222 }],      ["SNG", { chapters: 8, verses: 116 }],
    ["ISA", { chapters: 66, verses: 1292 }],     ["JER", { chapters: 52, verses: 1363 }],
    ["LAM", { chapters: 5, verses: 154 }],       ["EZK", { chapters: 48, verses: 1272 }],
    ["DAN", { chapters: 14, verses: 531 }],      ["HOS", { chapters: 14, verses: 198 }],
    ["JOL", { chapters: 3, verses: 73 }],        ["AMO", { chapters: 9, verses: 147 }],
    ["OBA", { chapters: 1, verses: 21 }],        ["JON", { chapters: 4, verses: 48 }],
    ["MIC", { chapters: 7, verses: 104 }],       ["NAM", { chapters: 3, verses: 47 }],
    ["HAB", { chapters: 3, verses: 56 }],        ["ZEP", { chapters: 3, verses: 53 }],
    ["HAG", { chapters: 2, verses: 38 }],        ["ZEC", { chapters: 14, verses: 211 }],
    ["MAL", { chapters: 4, verses: 55 }],        ["TOB", { chapters: 14, verses: 298 }],
    ["JDT", { chapters: 16, verses: 345 }],      ["WIS", { chapters: 19, verses: 439 }],
    ["SIR", { chapters: 51, verses: 1591 }],     ["BAR", { chapters: 6, verses: 213 }],
    ["1MA", { chapters: 16, verses: 929 }],      ["2MA", { chapters: 15, verses: 558 }],
    ["MAT", { chapters: 28, verses: 1070 }],     ["MRK", { chapters: 16, verses: 677 }],
    ["LUK", { chapters: 24, verses: 1151 }],     ["JHN", { chapters: 21, verses: 880 }],
    ["ACT", { chapters: 28, verses: 1004 }],     ["ROM", { chapters: 16, verses: 433 }],
    ["1CO", { chapters: 16, verses: 437 }],      ["2CO", { chapters: 13, verses: 256 }],
    ["GAL", { chapters: 6, verses: 149 }],       ["EPH", { chapters: 6, verses: 155 }],
    ["PHP", { chapters: 4, verses: 104 }],       ["COL", { chapters: 4, verses: 95 }],
    ["1TH", { chapters: 5, verses: 88 }],        ["2TH", { chapters: 3, verses: 46 }],
    ["1TI", { chapters: 6, verses: 113 }],       ["2TI", { chapters: 4, verses: 83 }],
    ["TIT", { chapters: 3, verses: 46 }],        ["PHM", { chapters: 1, verses: 25 }],
    ["HEB", { chapters: 13, verses: 303 }],      ["JAS", { chapters: 5, verses: 108 }],
    ["1PE", { chapters: 5, verses: 105 }],       ["2PE", { chapters: 3, verses: 61 }],
    ["1JN", { chapters: 5, verses: 105 }],       ["2JN", { chapters: 1, verses: 13 }],
    ["3JN", { chapters: 1, verses: 14 }],        ["JUD", { chapters: 1, verses: 25 }],
    ["REV", { chapters: 22, verses: 405 }],     
]);

export const DRA: CorpusExpectations = {
  editionId: "dra",
  totalVerses: 35811,
  books: BOOKS,
  // No footnotes, so nothing is printed as an empty placeholder.
  emptyVerses: [],
  // The superscriptions exist in the text; they are simply numbered as verse 1
  // rather than marked with <d>, so none reach the title bucket.
  titleCount: 0,
  subscriptions: [],
  expectsNotes: false,
  // No USFM ground truth yet — there is no real DRA-as-USFM bundle on disk
  // to measure against, and this project's rule is never to author a
  // number without a real source to check it against. Real gap, not
  // silently glossed over: `validateCorpus` refuses loudly rather than
  // skipping the check if a USFM `--source` build of the DRA is ever tried.
  dropped: new Map([
    [
      "usfx",
      new Map([
        // <cl> is a chapter label, and does not occur in the ASV at all.
        ["cl", 6],
        ["h", 633],
        ["id", 73],
        ["languageCode", 3],
        ["toc", 2844],
      ]),
    ],
  ]),
  unbalancedBrackets: [],
};
