/**
 * Scripture reference parser.
 *
 * A pure function: it reads only the generated verse-count tables, never a
 * database or the network. Bounds are checked against the real ASV
 * versification, so "John 3:99" is rejected with the actual chapter length.
 */

import { VERSE_COUNTS, TITLED_PSALMS } from "./data/meta.ts";
import { BOOKS, PROTESTANT_ORDER } from "./canon.ts";

export type Numbering = "english" | "hebrew";

export interface VerseRef {
  readonly book: string;
  readonly chapter: number;
  readonly verse: number;
  /** 1-based position across the whole Bible; Revelation 22:21 is 31102. */
  readonly sequence: number;
}

export interface RefSegment {
  readonly start: VerseRef;
  readonly end: VerseRef;
}

export interface ParsedReference {
  /** Normalized for display, e.g. "1 Corinthians 13:4-7,13". */
  readonly reference: string;
  readonly book: string;
  readonly numbering: Numbering;
  /** True when a Hebrew-numbered request asks for a Psalm's superscription. */
  readonly includeTitle: boolean;
  readonly segments: readonly RefSegment[];
  readonly verseCount: number;
}

/**
 * Why a reference failed. Syntax and ambiguity are faults in the request
 * itself; the rest describe a well-formed reference to something that is not
 * there, which callers surface as 404 rather than 400.
 */
export type ParseErrorKind =
  | "syntax"
  | "ambiguous"
  | "unknown_book"
  | "unavailable"
  | "out_of_range";

export class ParseError extends Error {
  constructor(
    message: string,
    readonly kind: ParseErrorKind = "syntax",
  ) {
    super(message);
    this.name = "ParseError";
  }
}

/* ------------------------------------------------------------------ *
 * Sequence tables, derived once from the generated verse counts.
 * ------------------------------------------------------------------ */

const BOOK_START = new Map<string, number>();
const CHAPTER_OFFSET = new Map<string, readonly number[]>();

{
  let running = 0;
  for (const bookId of PROTESTANT_ORDER) {
    const chapters = VERSE_COUNTS[bookId];
    if (chapters === undefined) throw new Error(`Missing verse counts for ${bookId}`);
    BOOK_START.set(bookId, running + 1);
    const offsets: number[] = [];
    let withinBook = 0;
    for (const count of chapters) {
      offsets.push(withinBook);
      withinBook += count;
    }
    CHAPTER_OFFSET.set(bookId, offsets);
    running += withinBook;
  }
}

const TITLED_PSALM_SET: ReadonlySet<number> = new Set(TITLED_PSALMS);

export function chapterCount(bookId: string): number {
  return VERSE_COUNTS[bookId]?.length ?? 0;
}

export function verseCount(bookId: string, chapter: number): number {
  return VERSE_COUNTS[bookId]?.[chapter - 1] ?? 0;
}

export function sequenceOf(bookId: string, chapter: number, verse: number): number {
  const start = BOOK_START.get(bookId);
  const offsets = CHAPTER_OFFSET.get(bookId);
  if (start === undefined || offsets === undefined) {
    throw new ParseError(`Unknown book: ${bookId}`, "unknown_book");
  }
  const offset = offsets[chapter - 1];
  if (offset === undefined) {
    throw new ParseError(`${bookId} has no chapter ${chapter}`, "out_of_range");
  }
  return start + offset + (verse - 1);
}

/* ------------------------------------------------------------------ *
 * Book name resolution.
 * ------------------------------------------------------------------ */

/** Conventional abbreviations. Entries here win over prefix matching. */
const ALIASES: ReadonlyMap<string, string> = new Map([
  ["gen", "GEN"], ["gn", "GEN"], ["ge", "GEN"],
  ["ex", "EXO"], ["exo", "EXO"], ["exod", "EXO"],
  ["lev", "LEV"], ["lv", "LEV"],
  ["num", "NUM"], ["nm", "NUM"], ["nu", "NUM"],
  ["deut", "DEU"], ["deu", "DEU"], ["dt", "DEU"],
  ["josh", "JOS"], ["jos", "JOS"],
  ["judg", "JDG"], ["jdg", "JDG"], ["jg", "JDG"],
  ["ruth", "RUT"], ["rut", "RUT"], ["ru", "RUT"],
  ["1 sam", "1SA"], ["1 sa", "1SA"], ["1 sm", "1SA"],
  ["2 sam", "2SA"], ["2 sa", "2SA"], ["2 sm", "2SA"],
  ["1 kgs", "1KI"], ["1 ki", "1KI"], ["1 kin", "1KI"], ["1 kings", "1KI"],
  ["2 kgs", "2KI"], ["2 ki", "2KI"], ["2 kin", "2KI"], ["2 kings", "2KI"],
  ["1 chr", "1CH"], ["1 ch", "1CH"], ["1 chron", "1CH"],
  ["2 chr", "2CH"], ["2 ch", "2CH"], ["2 chron", "2CH"],
  ["ezr", "EZR"],
  ["neh", "NEH"], ["ne", "NEH"],
  ["esth", "EST"], ["est", "EST"],
  ["jb", "JOB"],
  ["ps", "PSA"], ["psa", "PSA"], ["psalm", "PSA"], ["psalms", "PSA"], ["pss", "PSA"],
  ["prov", "PRO"], ["pro", "PRO"], ["pr", "PRO"], ["prv", "PRO"],
  ["eccl", "ECC"], ["ecc", "ECC"], ["qoh", "ECC"],
  ["song", "SNG"], ["sng", "SNG"], ["sos", "SNG"], ["canticles", "SNG"],
  ["song of songs", "SNG"], ["song of solomon", "SNG"],
  ["isa", "ISA"], ["is", "ISA"],
  ["jer", "JER"], ["jr", "JER"],
  ["lam", "LAM"],
  ["ezek", "EZK"], ["ezk", "EZK"], ["eze", "EZK"],
  ["dan", "DAN"], ["dn", "DAN"],
  ["hos", "HOS"],
  ["joel", "JOL"], ["jol", "JOL"],
  ["amos", "AMO"], ["amo", "AMO"], ["am", "AMO"],
  ["obad", "OBA"], ["oba", "OBA"], ["ob", "OBA"],
  ["jonah", "JON"], ["jon", "JON"],
  ["mic", "MIC"], ["mi", "MIC"],
  ["nah", "NAM"], ["nam", "NAM"],
  ["hab", "HAB"],
  ["zeph", "ZEP"], ["zep", "ZEP"],
  ["hag", "HAG"], ["hg", "HAG"],
  ["zech", "ZEC"], ["zec", "ZEC"],
  ["mal", "MAL"],
  ["matt", "MAT"], ["mat", "MAT"], ["mt", "MAT"],
  ["mark", "MRK"], ["mrk", "MRK"], ["mk", "MRK"],
  ["luke", "LUK"], ["luk", "LUK"], ["lk", "LUK"],
  ["john", "JHN"], ["jhn", "JHN"], ["jn", "JHN"],
  ["acts", "ACT"], ["act", "ACT"],
  ["rom", "ROM"], ["rm", "ROM"],
  ["1 cor", "1CO"], ["1 co", "1CO"],
  ["2 cor", "2CO"], ["2 co", "2CO"],
  ["gal", "GAL"], ["ga", "GAL"],
  ["eph", "EPH"],
  // "Phil" conventionally means Philippians; Philemon takes Phlm.
  ["phil", "PHP"], ["php", "PHP"], ["phi", "PHP"],
  ["col", "COL"],
  ["1 thess", "1TH"], ["1 th", "1TH"], ["1 thes", "1TH"],
  ["2 thess", "2TH"], ["2 th", "2TH"], ["2 thes", "2TH"],
  ["1 tim", "1TI"], ["1 ti", "1TI"], ["1 tm", "1TI"],
  ["2 tim", "2TI"], ["2 ti", "2TI"], ["2 tm", "2TI"],
  ["titus", "TIT"], ["tit", "TIT"],
  ["phlm", "PHM"], ["phm", "PHM"], ["philem", "PHM"], ["philemon", "PHM"],
  ["heb", "HEB"],
  ["jas", "JAS"], ["jm", "JAS"], ["james", "JAS"],
  ["1 pet", "1PE"], ["1 pe", "1PE"], ["1 pt", "1PE"],
  ["2 pet", "2PE"], ["2 pe", "2PE"], ["2 pt", "2PE"],
  ["1 john", "1JN"], ["1 jn", "1JN"], ["1 jhn", "1JN"],
  ["2 john", "2JN"], ["2 jn", "2JN"], ["2 jhn", "2JN"],
  ["3 john", "3JN"], ["3 jn", "3JN"], ["3 jhn", "3JN"],
  ["jude", "JUD"], ["jud", "JUD"],
  ["rev", "REV"], ["rv", "REV"], ["apocalypse", "REV"],
]);

const ORDINAL_WORDS: ReadonlyMap<string, string> = new Map([
  ["first", "1"], ["second", "2"], ["third", "3"],
  ["i", "1"], ["ii", "2"], ["iii", "3"],
]);

/** Lowercases, strips punctuation, and turns "First"/"II" into a leading digit. */
function normalizeBookName(raw: string): string {
  let value = raw.toLowerCase().replace(/\./g, " ").replace(/\s+/g, " ").trim();
  const match = /^([a-z]+|[1-3])\s+(.*)$/.exec(value);
  if (match !== null) {
    const ordinal = ORDINAL_WORDS.get(match[1] ?? "");
    if (ordinal !== undefined) value = `${ordinal} ${match[2] ?? ""}`.trim();
  }
  const compact = /^([1-3])([a-z].*)$/.exec(value);
  if (compact !== null) value = `${compact[1] ?? ""} ${compact[2] ?? ""}`;
  return value;
}

const NORMALIZED_NAMES: ReadonlyMap<string, string> = new Map(
  [...BOOKS.values()].map((book) => [normalizeBookName(book.name), book.id]),
);

function displayName(bookId: string): string {
  return BOOKS.get(bookId)?.name ?? bookId;
}

function resolveBook(raw: string): string {
  const name = normalizeBookName(raw);
  if (name === "") throw new ParseError("No book name was given");

  const exact = NORMALIZED_NAMES.get(name) ?? ALIASES.get(name);
  if (exact !== undefined) return ensureAvailable(exact, raw);

  const candidates = new Set<string>();
  for (const [candidateName, id] of NORMALIZED_NAMES) {
    if (candidateName.startsWith(name)) candidates.add(id);
  }
  for (const [alias, id] of ALIASES) {
    if (alias.startsWith(name)) candidates.add(id);
  }

  if (candidates.size === 1) {
    const [only] = candidates;
    return ensureAvailable(only as string, raw);
  }
  if (candidates.size === 0) {
    throw new ParseError(`Unknown book: "${raw.trim()}"`, "unknown_book");
  }
  const names = [...candidates].map(displayName).sort();
  throw new ParseError(
    `Ambiguous book abbreviation "${raw.trim()}" — it could mean ${names.join(", ")}`,
    "ambiguous",
  );
}

function ensureAvailable(bookId: string, raw: string): string {
  const meta = BOOKS.get(bookId);
  if (meta !== undefined && meta.dataAvailability === "metadata_only") {
    throw new ParseError(
      `${meta.name} is not present in the American Standard Version; ` +
        `only its canon metadata is available`,
      "unavailable",
    );
  }
  if (VERSE_COUNTS[bookId] === undefined) {
    throw new ParseError(`Unknown book: "${raw.trim()}"`, "unknown_book");
  }
  return bookId;
}

/* ------------------------------------------------------------------ *
 * Reference grammar.
 * ------------------------------------------------------------------ */

interface RawSegment {
  readonly startChapter: number | null;
  readonly startVerse: number | null;
  readonly endChapter: number | null;
  readonly endVerse: number | null;
}

/** Splits "John 3:16" into its book name and the numeric remainder. */
function splitReference(input: string): { bookPart: string; numericPart: string } {
  const trimmed = input.trim();
  const match = /^(.*?)\s*((?:\d+\s*:)?\s*\d+(?:\s*[-–—]\s*\d+(?:\s*:\s*\d+)?)?(?:\s*,\s*\d+(?:\s*:\s*\d+)?(?:\s*[-–—]\s*\d+(?:\s*:\s*\d+)?)?)*)?$/.exec(
    trimmed,
  );
  if (match === null) return { bookPart: trimmed, numericPart: "" };
  return { bookPart: match[1] ?? "", numericPart: (match[2] ?? "").trim() };
}

function parseSegments(numericPart: string, singleChapterBook: boolean): RawSegment[] {
  const segments: RawSegment[] = [];
  let carriedChapter: number | null = null;

  for (const piece of numericPart.split(",")) {
    const text = piece.trim();
    if (text === "") throw new ParseError("Empty segment in reference");

    const [leftRaw, rightRaw] = splitOnDash(text);

    const left = parsePoint(leftRaw, carriedChapter, singleChapterBook);
    carriedChapter = left.chapter;

    if (rightRaw === null) {
      segments.push({
        startChapter: left.chapter,
        startVerse: left.verse,
        endChapter: left.chapter,
        endVerse: left.verse,
      });
      continue;
    }

    const right = parsePoint(rightRaw, left.chapter, singleChapterBook);
    segments.push({
      startChapter: left.chapter,
      startVerse: left.verse,
      endChapter: right.chapter,
      endVerse: right.verse,
    });
    carriedChapter = right.chapter;
  }
  return segments;
}

function splitOnDash(text: string): [string, string | null] {
  const index = text.search(/[-–—]/);
  if (index === -1) return [text.trim(), null];
  return [text.slice(0, index).trim(), text.slice(index + 1).trim()];
}

interface Point {
  readonly chapter: number | null;
  readonly verse: number | null;
}

function parsePoint(
  text: string,
  carriedChapter: number | null,
  singleChapterBook: boolean,
): Point {
  if (text === "") throw new ParseError("Incomplete reference");

  const colon = text.indexOf(":");
  if (colon !== -1) {
    const chapter = toInteger(text.slice(0, colon), "chapter");
    const verse = toInteger(text.slice(colon + 1), "verse");
    return { chapter, verse };
  }

  const value = toInteger(text, "number");
  // Bare numbers continue an open chapter, name a verse in a one-chapter book,
  // or otherwise name a whole chapter.
  if (carriedChapter !== null) return { chapter: carriedChapter, verse: value };
  if (singleChapterBook) return { chapter: 1, verse: value };
  return { chapter: value, verse: null };
}

function toInteger(text: string, label: string): number {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new ParseError(`Expected a ${label} number but found "${trimmed}"`);
  }
  const value = Number.parseInt(trimmed, 10);
  if (value < 1) throw new ParseError(`A ${label} number must be 1 or greater`);
  return value;
}

/* ------------------------------------------------------------------ *
 * Hebrew numbering.
 * ------------------------------------------------------------------ */

/**
 * Converts a Hebrew verse number to its English counterpart. For the 116 Psalms
 * carrying a superscription, that title is Hebrew verse 1, so every English
 * verse shifts up by one; verse 0 denotes the superscription itself.
 */
function hebrewToEnglish(chapter: number, hebrewVerse: number): number {
  return TITLED_PSALM_SET.has(chapter) ? hebrewVerse - 1 : hebrewVerse;
}

function hebrewVerseCount(chapter: number): number {
  return verseCount("PSA", chapter) + (TITLED_PSALM_SET.has(chapter) ? 1 : 0);
}

/* ------------------------------------------------------------------ *
 * Entry point.
 * ------------------------------------------------------------------ */

export function parseReference(
  input: string,
  options: { readonly numbering?: Numbering } = {},
): ParsedReference {
  const numbering: Numbering = options.numbering ?? "english";

  if (typeof input !== "string" || input.trim() === "") {
    throw new ParseError("A reference is required, for example \"John 3:16\"");
  }

  const { bookPart, numericPart } = splitReference(input);

  // If no numeric part could be read but the tail still looks like an attempt
  // at one, say so. Otherwise the whole string is treated as a book name and
  // the caller gets "Unknown book: John 3:abc", which hides the real fault.
  if (numericPart === "") {
    const tail = bookPart.trim().split(/\s+/).at(-1) ?? "";
    if (tail.includes(":") || (/\d/.test(tail) && !/^[1-3]$/.test(tail))) {
      throw new ParseError(
        `Could not read "${tail}" as a chapter or verse number`,
        "syntax",
      );
    }
  }

  const book = resolveBook(bookPart);

  if (numbering === "hebrew" && book !== "PSA") {
    throw new ParseError(
      "Hebrew numbering is only available for Psalms; " +
        `${displayName(book)} uses a single verse numbering`,
    );
  }

  const chapters = chapterCount(book);
  const singleChapterBook = chapters === 1;

  // A bare book name means the whole book.
  const rawSegments: RawSegment[] =
    numericPart === ""
      ? [{ startChapter: 1, startVerse: 1, endChapter: chapters, endVerse: null }]
      : parseSegments(numericPart, singleChapterBook);

  let includeTitle = false;
  const segments: RefSegment[] = [];

  for (const raw of rawSegments) {
    const startChapter = raw.startChapter ?? 1;
    const endChapter = raw.endChapter ?? startChapter;
    validateChapter(book, startChapter);
    validateChapter(book, endChapter);

    let startVerse: number;
    let endVerse: number;

    if (numbering === "hebrew") {
      const hebrewStart = raw.startVerse ?? 1;
      const hebrewEnd = raw.endVerse ?? hebrewVerseCount(endChapter);
      validateHebrewVerse(startChapter, hebrewStart);
      validateHebrewVerse(endChapter, hebrewEnd);
      startVerse = hebrewToEnglish(startChapter, hebrewStart);
      endVerse = hebrewToEnglish(endChapter, hebrewEnd);
      if (startVerse === 0) {
        includeTitle = true;
        startVerse = 1;
      }
      if (endVerse === 0) {
        // The range covers only the superscription.
        includeTitle = true;
        continue;
      }
    } else {
      startVerse = raw.startVerse ?? 1;
      endVerse = raw.endVerse ?? verseCount(book, endChapter);
      validateVerse(book, startChapter, startVerse);
      validateVerse(book, endChapter, endVerse);
    }

    const start: VerseRef = {
      book,
      chapter: startChapter,
      verse: startVerse,
      sequence: sequenceOf(book, startChapter, startVerse),
    };
    const end: VerseRef = {
      book,
      chapter: endChapter,
      verse: endVerse,
      sequence: sequenceOf(book, endChapter, endVerse),
    };
    if (end.sequence < start.sequence) {
      throw new ParseError(
        `Reference range runs backwards: ${displayName(book)} ${startChapter}:${startVerse}` +
          ` is after ${endChapter}:${endVerse}`,
      );
    }
    segments.push({ start, end });
  }

  const verseTotal =
    segments.reduce((sum, segment) => sum + (segment.end.sequence - segment.start.sequence + 1), 0) +
    (includeTitle ? 1 : 0);

  if (segments.length === 0 && !includeTitle) {
    throw new ParseError("Reference selects no verses");
  }

  return {
    reference: formatReference(book, segments, includeTitle, numbering),
    book,
    numbering,
    includeTitle,
    segments,
    verseCount: verseTotal,
  };
}

function validateChapter(book: string, chapter: number): void {
  const total = chapterCount(book);
  if (chapter < 1 || chapter > total) {
    throw new ParseError(
      `${displayName(book)} has ${total} chapter${total === 1 ? "" : "s"}, so there is no chapter ${chapter}`,
      "out_of_range",
    );
  }
}

function validateVerse(book: string, chapter: number, verse: number): void {
  const total = verseCount(book, chapter);
  if (verse < 1 || verse > total) {
    throw new ParseError(
      `${displayName(book)} ${chapter} only has ${total} verses`,
      "out_of_range",
    );
  }
}

function validateHebrewVerse(chapter: number, verse: number): void {
  const total = hebrewVerseCount(chapter);
  if (verse < 1 || verse > total) {
    throw new ParseError(
      `Psalm ${chapter} only has ${total} verses in Hebrew numbering`,
      "out_of_range",
    );
  }
}

function formatReference(
  book: string,
  segments: readonly RefSegment[],
  includeTitle: boolean,
  numbering: Numbering,
): string {
  const name = displayName(book);
  if (segments.length === 0) return `${name} (title)`;

  const parts: string[] = [];
  let lastChapter: number | null = null;
  for (const segment of segments) {
    const { start, end } = segment;
    const startLabel =
      start.chapter === lastChapter ? `${start.verse}` : `${start.chapter}:${start.verse}`;
    if (start.sequence === end.sequence) {
      parts.push(startLabel);
    } else if (start.chapter === end.chapter) {
      parts.push(`${startLabel}-${end.verse}`);
    } else {
      parts.push(`${startLabel}-${end.chapter}:${end.verse}`);
    }
    lastChapter = end.chapter;
  }
  const suffix = numbering === "hebrew" ? " (Hebrew numbering)" : "";
  const titleMark = includeTitle ? " with title" : "";
  return `${name} ${parts.join(",")}${titleMark}${suffix}`;
}

/**
 * Reverse of {@link sequenceOf}: turns a global verse sequence back into its
 * book, chapter, and verse. Throws for sequences outside 1..31102.
 */
export function locate(sequence: number): { book: string; chapter: number; verse: number } {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new ParseError(`Verse sequence out of range: ${sequence}`, "out_of_range");
  }
  for (const bookId of PROTESTANT_ORDER) {
    const start = BOOK_START.get(bookId);
    const offsets = CHAPTER_OFFSET.get(bookId);
    const chapters = VERSE_COUNTS[bookId];
    if (start === undefined || offsets === undefined || chapters === undefined) continue;
    const bookLength = offsets[offsets.length - 1]! + chapters[chapters.length - 1]!;
    if (sequence >= start && sequence < start + bookLength) {
      const withinBook = sequence - start;
      for (let index = offsets.length - 1; index >= 0; index -= 1) {
        const offset = offsets[index]!;
        if (withinBook >= offset) {
          return { book: bookId, chapter: index + 1, verse: withinBook - offset + 1 };
        }
      }
    }
  }
  throw new ParseError(`Verse sequence out of range: ${sequence}`, "out_of_range");
}
