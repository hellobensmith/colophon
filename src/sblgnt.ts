/**
 * Reader for the SBL Greek New Testament's own bespoke XML — not USFX, USFM
 * or USX. A small vocabulary: `<book id="Mt">`, `<title>`, `<p>`/`<p />`,
 * `<verse-number id="Matthew 1:1">1:1</verse-number>`, `<w>` (one word),
 * `<suffix>` (trailing punctuation/space), `<prefix>` (leading text —
 * sometimes just a space, sometimes a critical-apparatus glyph marking a
 * textual variant: `⸀ ⸁ ⸂ ⸃ ⸄ ⸅ ⟦ ⟧`).
 *
 * Two things this format needs that no other reader here does:
 *
 * 1. **The join rule.** 85% of `<suffix>` elements are empty, and the XML's
 *    own pretty-printed indentation is not the word separator — naive
 *    concatenation is wrong in a way invisible from a short book. The rule
 *    below is verified character-exact against the source's own
 *    `data/sblgnt/text/*.txt` rendering across all 7,939 verses: a `prefix?
 *    + w` unit's leading whitespace (present on every prefix, since a
 *    prefix is either a bare space or a space plus a marker glyph) *is* the
 *    separator — insert nothing before it, but strip it if the output
 *    already ends in whitespace; absent a prefix, insert one space before
 *    `w` unless the output is empty or already ends in whitespace. `suffix`
 *    always appends raw, no separator logic. A `<p>`/`</p>`/`<p />`
 *    boundary mid-verse (34 in the corpus) contributes one more space the
 *    same way — confirmed against 34 mid-verse paragraph breaks.
 *
 * 2. **Mark's Shorter Ending.** Between the verse-numbered 16:8 and 16:9,
 *    the source prints 34 `⟦…⟧`-bracketed words with no verse number of
 *    their own. A verse-keyed reader defaults this onto the end of v8 —
 *    silently, since the coverage ledger still balances. The rule that
 *    catches it without being a Mark-specific hack: a `⟦` opening *after* a
 *    verse already has real accumulated content, with no verse-number
 *    between its open and its matching `⟧`, is an interpolation, not a
 *    continuation — routed to {@link ScriptureDocument.interpolations}
 *    instead of the verse. The other two `⟦` spans in the corpus (John
 *    7:53's and Mark 16:9's own) both open as the *first* content of their
 *    verse, so this rule never fires for them.
 *
 * Critical-apparatus glyphs (`⸀⸁⸂⸃⸄⸅⟦⟧`) are dropped from served text —
 * ledger-accounted, not destroyed — the same treatment this project's other
 * readers already give footnote callers: apparatus marks in print sit on
 * the same page as the note they point to, and this reader has no inline
 * note to pair them with (see `/apparatus`). ASCII `[`/`]`/`(`/`)` are left
 * as literal printed text — real punctuation in this source, not apparatus
 * notation — so `validateCorpus`'s bracket-balance check still sees them.
 */

import type { CoverageLedger, ScriptureDocument, Verse } from "./document.ts";

export type SblgntDocument = ScriptureDocument;

/** Raised when the source contains an element this reader has never classified. */
export class UnknownSblgntElementError extends Error {
  constructor(
    readonly element: string,
    readonly location: string,
  ) {
    super(
      `Unclassified SBLGNT source element <${element}> near ${location}. ` +
        `Add it to src/sblgnt.ts before ingesting.`,
    );
    this.name = "UnknownSblgntElementError";
  }
}

/** Raised when a `⟦` interpolation span never closes before EOF or a new verse reopens the puzzle. */
export class UnclosedInterpolationError extends Error {
  constructor(readonly location: string) {
    super(`A "⟦" interpolation span near ${location} never closed with a matching "⟧".`);
    this.name = "UnclosedInterpolationError";
  }
}

/**
 * SBLGNT's own `<book id>` values, mapped to Colophon's 3-letter codes.
 * Built from the real attribute values (not filenames — `1Cor.xml` carries
 * `id="1Co"`, not `id="1Cor"`; `1Tim`/`2Tim`/`Tit` run 3-4 chars where
 * `1Th`/`2Th` run 3 — SBL's own scheme has no fixed length rule).
 */
const BOOK_ID_TO_CANON: ReadonlyMap<string, string> = new Map([
  ["Mt", "MAT"],
  ["Mk", "MRK"],
  ["Lu", "LUK"],
  ["Jn", "JHN"],
  ["Ac", "ACT"],
  ["Ro", "ROM"],
  ["1Co", "1CO"],
  ["2Co", "2CO"],
  ["Gal", "GAL"],
  ["Eph", "EPH"],
  ["Php", "PHP"],
  ["Col", "COL"],
  ["1Th", "1TH"],
  ["2Th", "2TH"],
  ["1Tim", "1TI"],
  ["2Tim", "2TI"],
  ["Tit", "TIT"],
  ["Phm", "PHM"],
  ["Heb", "HEB"],
  ["Jam", "JAS"],
  ["1Pe", "1PE"],
  ["2Pe", "2PE"],
  ["1Jn", "1JN"],
  ["2Jn", "2JN"],
  ["3Jn", "3JN"],
  ["Jud", "JUD"],
  ["Re", "REV"],
]);

/** The order this edition prints its books — standard canonical NT order. */
const CANONICAL_ORDER: readonly string[] = [
  "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH",
  "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS",
  "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
];

/** Critical-apparatus glyphs dropped from served text — ledger-accounted, not destroyed. */
const APPARATUS_MARKERS = /[⸀⸁⸂⸃⸄⸅⟦⟧]/g;

interface MutableVerse {
  bcv: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

/**
 * A fresh instance per call, not a shared module-level constant: this
 * carries the `g` flag's `lastIndex`, and an exception thrown mid-parse
 * (an unclassified element, an unclosed interpolation) would otherwise
 * leave a shared regex's `lastIndex` non-zero for whatever call comes next.
 */
function tokenPattern(): RegExp {
  return /<verse-number id="([^"]*)">([^<]*)<\/verse-number>|<w>([^<]*)<\/w>|<suffix>([^<]*)<\/suffix>|<prefix>([^<]*)<\/prefix>|<book id="([^"]*)">|<\/book>|<title>([^<]*)<\/title>|<p\s*\/>|<\/p>|<p>/g;
}

/** Separator logic for a `prefix? + w` unit — see the module doc comment. */
function appendPiece(out: string, piece: string): string {
  if (piece === "") return out;
  if (/^\s/.test(piece)) {
    if (out === "" || /\s$/.test(out)) piece = piece.replace(/^\s+/, "");
  } else if (out !== "" && !/\s$/.test(out)) {
    piece = ` ${piece}`;
  }
  return out + piece;
}

/** A paragraph boundary contributes a joining space, never a separator collapse. */
function appendBreakSpace(out: string): string {
  if (out !== "" && !/\s$/.test(out)) return `${out} `;
  return out;
}

/** Strips critical-apparatus glyphs from a fragment, returning clean text and the count dropped. */
function stripMarkers(text: string): { clean: string; dropped: number } {
  const matches = text.match(APPARATUS_MARKERS);
  return { clean: text.replace(APPARATUS_MARKERS, ""), dropped: matches?.length ?? 0 };
}

export function parseSblgnt(xml: string): SblgntDocument {
  const source = xml.replace(/^﻿/, "");

  const verses: MutableVerse[] = [];
  const interpolations = new Map<string, string>();
  const books: string[] = [];
  const bookSet = new Set<string>();

  const toVerses = new Map<string, number>();
  const dropped = new Map<string, number>();
  let unattributed = 0;
  let sourceCharacters = 0;

  const record = (bucket: Map<string, number>, key: string, length: number): void => {
    if (length <= 0) return;
    bucket.set(key, (bucket.get(key) ?? 0) + length);
  };

  let currentCanonBook: string | null = null;
  let currentVerse: MutableVerse | null = null;
  let currentHasContent = false;
  let pendingPrefix = "";

  let inInterpolation = false;
  let interpolationText = "";
  let interpolationAfterBcv: string | null = null;

  /** Appends a `prefix? + w` unit's already-marker-stripped text, with separator logic. */
  function appendUnit(clean: string): void {
    if (clean === "") return;
    if (inInterpolation) {
      interpolationText = appendPiece(interpolationText, clean);
      record(toVerses, "interpolation", clean.length);
    } else if (currentVerse === null) {
      unattributed += clean.length;
    } else {
      currentVerse.text = appendPiece(currentVerse.text, clean);
      currentHasContent = currentVerse.text !== "";
      record(toVerses, "w", clean.length);
    }
  }

  /** Appends an already-marker-stripped `suffix` — raw, never through separator logic. */
  function appendSuffix(clean: string): void {
    if (clean === "") return;
    if (inInterpolation) {
      interpolationText += clean;
      record(toVerses, "interpolation", clean.length);
    } else if (currentVerse === null) {
      unattributed += clean.length;
    } else {
      currentVerse.text += clean;
      currentHasContent = currentVerse.text !== "";
      record(toVerses, "suffix", clean.length);
    }
  }

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const tokenRe = tokenPattern();
  while ((match = tokenRe.exec(source)) !== null) {
    // Gap text between the previous match and this one — pretty-print whitespace.
    const gap = source.slice(lastIndex, match.index);
    if (/\S/.test(gap)) {
      throw new UnknownSblgntElementError("(stray text outside any element)", gap.slice(0, 40));
    }
    sourceCharacters += gap.length;
    unattributed += gap.length;
    lastIndex = match.index + match[0].length;

    const [, verseNumberId, verseNumberText, w, suffix, prefix, bookId, titleText] = match;

    if (bookId !== undefined) {
      const canon = BOOK_ID_TO_CANON.get(bookId);
      if (canon === undefined) {
        throw new UnknownSblgntElementError(`book id="${bookId}"`, bookId);
      }
      currentCanonBook = canon;
      if (!bookSet.has(canon)) {
        bookSet.add(canon);
        books.push(canon);
      }
    } else if (match[0] === "</book>") {
      currentCanonBook = null;
      currentVerse = null;
      currentHasContent = false;
    } else if (titleText !== undefined) {
      sourceCharacters += titleText.length;
      record(dropped, "title", titleText.length);
    } else if (verseNumberId !== undefined) {
      if (inInterpolation) {
        throw new UnclosedInterpolationError(verseNumberId);
      }
      sourceCharacters += (verseNumberText ?? "").length;
      record(dropped, "verse-number", (verseNumberText ?? "").length);
      const coords = /^(.*) (\d+):(\d+)$/.exec(verseNumberId);
      if (coords === null || currentCanonBook === null) {
        throw new UnknownSblgntElementError(`verse-number id="${verseNumberId}"`, verseNumberId);
      }
      const chapter = Number(coords[2]);
      const verse = Number(coords[3]);
      currentVerse = {
        bcv: `${currentCanonBook}.${chapter}.${verse}`,
        book: currentCanonBook,
        chapter,
        verse,
        text: "",
      };
      currentHasContent = false;
      verses.push(currentVerse);
    } else if (w !== undefined) {
      sourceCharacters += pendingPrefix.length + w.length;
      const { clean: cleanPrefix, dropped: prefixMarkers } = stripMarkers(pendingPrefix);
      if (prefixMarkers > 0) record(dropped, "apparatus-marker", prefixMarkers);

      // Interpolation open: a "⟦" in this prefix, after the current verse
      // already has real content, with none pending already.
      if (/⟦/.test(pendingPrefix) && !inInterpolation && currentHasContent && currentVerse !== null) {
        inInterpolation = true;
        interpolationText = "";
        interpolationAfterBcv = currentVerse.bcv;
      }
      pendingPrefix = "";

      appendUnit(cleanPrefix + w);
    } else if (suffix !== undefined) {
      sourceCharacters += suffix.length;
      const closesInterpolation = inInterpolation && /⟧/.test(suffix);
      const { clean: cleanSuffix, dropped: suffixMarkers } = stripMarkers(suffix);
      if (suffixMarkers > 0) record(dropped, "apparatus-marker", suffixMarkers);
      appendSuffix(cleanSuffix);
      if (closesInterpolation && interpolationAfterBcv !== null) {
        interpolations.set(interpolationAfterBcv, interpolationText.trim());
        inInterpolation = false;
        interpolationText = "";
        interpolationAfterBcv = null;
      }
    } else if (prefix !== undefined) {
      pendingPrefix = prefix;
    } else {
      // <p>, </p>, <p /> — a structural paragraph boundary. Contributes a
      // joining space mid-verse (34 in the corpus), matching src/usx.ts's
      // own "don't save/restore the sink at a paragraph close" handling —
      // a verse can genuinely run across a paragraph break here too. Pure
      // structure, no source characters of its own to account for.
      if (inInterpolation) {
        interpolationText = appendBreakSpace(interpolationText);
      } else if (currentVerse !== null) {
        currentVerse.text = appendBreakSpace(currentVerse.text);
      }
    }
  }
  const tail = source.slice(lastIndex);
  if (/\S/.test(tail)) {
    throw new UnknownSblgntElementError("(stray text after the last element)", tail.slice(0, 40));
  }
  sourceCharacters += tail.length;
  unattributed += tail.length;

  if (inInterpolation) {
    throw new UnclosedInterpolationError("end of source");
  }

  books.sort((a, b) => CANONICAL_ORDER.indexOf(a) - CANONICAL_ORDER.indexOf(b));
  verses.sort((a, b) => {
    const byBook = CANONICAL_ORDER.indexOf(a.book) - CANONICAL_ORDER.indexOf(b.book);
    if (byBook !== 0) return byBook;
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    return a.verse - b.verse;
  });

  const finalVerses: Verse[] = verses.map((v) => ({
    bcv: v.bcv,
    book: v.book,
    chapter: v.chapter,
    verse: v.verse,
    text: v.text.trim(),
    note: null,
  }));

  const ledger: CoverageLedger = {
    toVerses,
    toTitles: new Map(),
    toSubscriptions: new Map(),
    toNotes: new Map(),
    dropped,
    unattributed,
    sourceCharacters,
  };

  return {
    format: "sblgnt",
    verses: finalVerses,
    titles: new Map(),
    subscriptions: new Map(),
    books,
    interpolations,
    ledger,
  };
}
