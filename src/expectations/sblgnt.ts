/**
 * The SBL Greek New Testament (SBLGNT), v1.2 (2023-07-10), as SBL and Logos
 * Bible Software publish it.
 *
 * Hand-authored ground truth, like `asv.ts` and `dra.ts` — never derive any
 * of this from `src/data/*`.
 *
 * Every figure below was produced by `bun run scripts/build-data.ts
 * --translation sblgnt --source .cache/sblgnt-xml --report` against the real
 * 27-book corpus (staged from `/Users/ben/Downloads/SBLGNT-src/data/sblgnt/xml/`,
 * explicitly excluding `sblgnt.xml` — a metadata/title stub, not a book,
 * that a directory glob would otherwise sweep in and that would change
 * `REVISION_ID` depending on whether whoever staged the directory happened
 * to leave it there).
 *
 * This edition disagrees with the ASV's own New Testament versification in
 * 9 of 27 books — not a defect, four distinct real text-critical facts:
 *
 * - 15 verses the ASV numbers and empties, SBLGNT omits outright, with no
 *   placeholder at all (`omittedVerses` below) — Matt 17:21/18:11/23:14,
 *   Mark 7:16/9:44/9:46/11:26/15:28, Luke 17:36/23:17, John 5:4,
 *   Acts 8:37/15:34/24:7/28:29.
 * - Acts 19 ends at v40 where the ASV has 41 — NA/SBL fold the ASV's 19:41
 *   into 19:40; nothing is missing, the boundary moved.
 * - 3 John and Revelation 12 run the other way: 3 John splits the ASV's
 *   v14 into 14+15 (15 verses here against the ASV's 14), and Revelation
 *   12 has 18 verses because NA/SBL's 12:18 is the ASV's 13:1.
 * - Romans ends at 16:24 *with text* (the Byzantine closing, "Ἡ χάρις...
 *   Ἀμήν") and has no 16:25-27 — NA28/WH/Tregelles's doxology sits in the
 *   apparatus instead, not the text. SBLGNT siding with the Byzantine
 *   tradition against the critical editions at Paul's most-discussed
 *   structural crux is exactly the kind of divergence a validation gate
 *   must never "fix."
 *
 * Mark's Shorter Ending — 34 words between the verse-numbered 16:8 and
 * 16:9, with no verse number of its own — is not a text-critical surprise
 * this file needs to carry: it is routed to `ScriptureDocument.interpolations`
 * by the reader itself (`src/sblgnt.ts`), not folded into verse 8, so it
 * never appears as a versification discrepancy here at all.
 */

import type { CorpusExpectations } from "../validate.ts";

/** Chapter and verse totals per book, in canonical NT order. */
const BOOKS: ReadonlyMap<string, { chapters: number; verses: number }> = new Map([
  ["MAT", { chapters: 28, verses: 1068 }],
  ["MRK", { chapters: 16, verses: 673 }],
  ["LUK", { chapters: 24, verses: 1149 }],
  ["JHN", { chapters: 21, verses: 878 }],
  ["ACT", { chapters: 28, verses: 1002 }],
  ["ROM", { chapters: 16, verses: 430 }],
  ["1CO", { chapters: 16, verses: 437 }],
  ["2CO", { chapters: 13, verses: 256 }],
  ["GAL", { chapters: 6, verses: 149 }],
  ["EPH", { chapters: 6, verses: 155 }],
  ["PHP", { chapters: 4, verses: 104 }],
  ["COL", { chapters: 4, verses: 95 }],
  ["1TH", { chapters: 5, verses: 89 }],
  ["2TH", { chapters: 3, verses: 47 }],
  ["1TI", { chapters: 6, verses: 113 }],
  ["2TI", { chapters: 4, verses: 83 }],
  ["TIT", { chapters: 3, verses: 46 }],
  ["PHM", { chapters: 1, verses: 25 }],
  ["HEB", { chapters: 13, verses: 303 }],
  ["JAS", { chapters: 5, verses: 108 }],
  ["1PE", { chapters: 5, verses: 105 }],
  ["2PE", { chapters: 3, verses: 61 }],
  ["1JN", { chapters: 5, verses: 105 }],
  ["2JN", { chapters: 1, verses: 13 }],
  ["3JN", { chapters: 1, verses: 15 }],
  ["JUD", { chapters: 1, verses: 25 }],
  ["REV", { chapters: 22, verses: 405 }],
]);

const EXPECTED_TOTAL_VERSES = 7939;

/** The 15 verses this edition omits outright — no placeholder, no number. */
const EXPECTED_OMITTED_VERSES: readonly string[] = [
  "MAT.17.21", "MAT.18.11", "MAT.23.14",
  "MRK.7.16", "MRK.9.44", "MRK.9.46", "MRK.11.26", "MRK.15.28",
  "LUK.17.36", "LUK.23.17",
  "JHN.5.4",
  "ACT.8.37", "ACT.15.34", "ACT.24.7", "ACT.28.29",
];

/**
 * Real ASCII `[`/`]` (NA-style doubtful-word brackets, distinct from the
 * `⸀⸂⸃⟦⟧` critical-apparatus glyphs this reader drops) — Luke 22:19 opens,
 * 22:20 closes, crossing a verse boundary exactly like the ASV's John
 * 7:53/8:11 pericope does.
 */
const EXPECTED_UNBALANCED_BRACKETS: readonly string[] = ["LUK.22.19", "LUK.22.20"];

/**
 * Characters dropped on purpose, keyed by what carried them — the lossy
 * inventory for this one format. `apparatus-marker` is the critical-
 * apparatus glyph set (`⸀⸁⸂⸃⸄⸅⟦⟧`); `title` is each book's Greek title
 * element (e.g. `ΙΟΥΔΑ`); `verse-number` is the displayed chapter:verse
 * text inside `<verse-number>`, redundant with its `id` attribute.
 */
const EXPECTED_DROPPED_SBLGNT: ReadonlyMap<string, number> = new Map([
  ["apparatus-marker", 8711],
  ["title", 347],
  ["verse-number", 14168],
]);

export const SBLGNT: CorpusExpectations = {
  editionId: "sblgnt",
  totalVerses: EXPECTED_TOTAL_VERSES,
  books: BOOKS,
  emptyVerses: [],
  omittedVerses: EXPECTED_OMITTED_VERSES,
  // No Psalm superscriptions (NT-only), no subscriptions, no footnotes —
  // this is a critical text with an apparatus, not a translation with
  // translator notes.
  titleCount: 0,
  subscriptions: [],
  expectsNotes: false,
  dropped: new Map([["sblgnt", EXPECTED_DROPPED_SBLGNT]]),
  unbalancedBrackets: EXPECTED_UNBALANCED_BRACKETS,
};
