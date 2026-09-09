/**
 * Scripture reference parser.
 *
 * A pure function: it reads only the generated verse-count tables, never a
 * database or the network. Bounds are checked against the real ASV
 * versification, so "John 3:99" is rejected with the actual chapter length.
 */

import { BOOKS } from "./canon.ts";
import { DEFAULT_TRANSLATION, resolveTranslation, versificationOf } from "./translations.ts";
import {
  fromGreek,
  fromHebrew,
  greekVerseCount,
  numberedVerses,
  PsalmNumberingError,
  type PsalmPosition,
} from "./psalms.ts";

export type Numbering = "english" | "hebrew" | "greek";

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
  /** Psalm whose superscription `includeTitle` refers to. */
  readonly titleChapter: number | null;
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
 * Sequence arithmetic.
 *
 * The tables these read live with the edition, not here — see
 * `src/versification.ts`. Every function below takes the translation whose
 * numbering it should use. The default keeps existing callers on the ASV, but
 * a coordinate is only meaningful paired with an edition, so pass it wherever
 * the caller knows it.
 * ------------------------------------------------------------------ */

export function chapterCount(bookId: string, translation: string): number {
  return versificationOf(translation).verseCounts[bookId]?.length ?? 0;
}

export function verseCount(
  bookId: string,
  chapter: number,
  translation: string,
): number {
  return versificationOf(translation).verseCounts[bookId]?.[chapter - 1] ?? 0;
}

export function sequenceOf(
  bookId: string,
  chapter: number,
  verse: number,
  translation: string,
): number {
  const { bookStart, chapterOffset } = versificationOf(translation);
  const start = bookStart.get(bookId);
  const offsets = chapterOffset.get(bookId);
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

  // The deuterocanon had no abbreviations at all: every one of these books
  // resolved only by prefix-matching its full name, which happens to work for
  // most of them and never worked for Judith, whose id is not a prefix of it.
  // They became reachable when the Douay-Rheims was registered, so the names a
  // reader of *that* edition would actually type belong here.
  ["tob", "TOB"], ["tb", "TOB"],
  ["jdt", "JDT"], ["jdth", "JDT"], ["jth", "JDT"],
  ["wis", "WIS"], ["ws", "WIS"],
  ["sir", "SIR"], ["ecclesiasticus", "SIR"], ["ecclus", "SIR"],
  ["bar", "BAR"], ["br", "BAR"],
  ["1 maccabees", "1MA"], ["1 macc", "1MA"], ["1 mac", "1MA"], ["1 ma", "1MA"],
  ["2 maccabees", "2MA"], ["2 macc", "2MA"], ["2 mac", "2MA"], ["2 ma", "2MA"],
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

function resolveBook(raw: string, translation: string): string {
  const name = normalizeBookName(raw);
  if (name === "") throw new ParseError("No book name was given");

  const exact = NORMALIZED_NAMES.get(name) ?? ALIASES.get(name);
  if (exact !== undefined) return ensureAvailable(exact, raw, translation);

  const candidates = new Set<string>();
  for (const [candidateName, id] of NORMALIZED_NAMES) {
    if (candidateName.startsWith(name)) candidates.add(id);
  }
  for (const [alias, id] of ALIASES) {
    if (alias.startsWith(name)) candidates.add(id);
  }

  if (candidates.size === 1) {
    const [only] = candidates;
    return ensureAvailable(only as string, raw, translation);
  }

  /*
   * Whether an abbreviation is ambiguous depends on the edition. "Eccl" names
   * only Ecclesiastes in the ASV, and could mean Ecclesiastes or Ecclesiasticus
   * in the Douay-Rheims, which prints both. So narrow by what this edition
   * actually contains before calling it ambiguous.
   *
   * Narrowing only ever breaks ties. A name matching exactly one book stays on
   * the path above whether or not the edition has it, which is what keeps
   * "Tobit" in the ASV reporting that it is not present rather than that it
   * does not exist.
   */
  if (candidates.size > 1) {
    const counts = versificationOf(translation).verseCounts;
    const present = [...candidates].filter((id) => counts[id] !== undefined);
    if (present.length === 1) {
      return ensureAvailable(present[0]!, raw, translation);
    }
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

function ensureAvailable(
  bookId: string,
  raw: string,
  translation: string,
): string {
  // Whether a book is available is a fact about *this edition*, not about the
  // canon. `dataAvailability` in canon.ts is derived globally — every
  // deuterocanonical book is marked metadata_only there — so consulting it
  // first would refuse Tobit for the Douay-Rheims, which prints all fourteen
  // chapters of it. The edition's own verse counts are the authority; the canon
  // metadata only explains *why* something is missing.
  if (versificationOf(translation).verseCounts[bookId] !== undefined) {
    return bookId;
  }

  const meta = BOOKS.get(bookId);
  if (meta !== undefined) {
    throw new ParseError(
      `${meta.name} is not present in the ` +
        `${resolveTranslation(translation).meta.name}; ` +
        `only its canon metadata is available`,
      "unavailable",
    );
  }
  throw new ParseError(`Unknown book: "${raw.trim()}"`, "unknown_book");
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

/**
 * Ceiling on comma-separated segments in one reference.
 *
 * A citation like `1 Cor 13:4-7,13` has two. Ten thousand parsed in 11 ms before
 * the 500-verse cap rejected the result, which is work done on behalf of a
 * request that was never going to be served.
 */
const MAX_SEGMENTS = 64;

function parseSegments(numericPart: string, singleChapterBook: boolean): RawSegment[] {
  const segments: RawSegment[] = [];
  let carriedChapter: number | null = null;

  const pieces = numericPart.split(",");
  if (pieces.length > MAX_SEGMENTS) {
    throw new ParseError(
      `A reference may have at most ${MAX_SEGMENTS} comma-separated parts; this one has ${pieces.length}`,
      "syntax",
    );
  }

  for (const piece of pieces) {
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
 * Psalm numbering.
 * ------------------------------------------------------------------ */

/**
 * Resolves a psalm reference written in Hebrew or Greek numbering to its place
 * in the ASV's English text. A Greek psalm may span two Hebrew ones, so the
 * answer carries its own psalm number rather than assuming the input's.
 */
function resolvePsalm(numbering: Numbering, psalm: number, verse: number): PsalmPosition {
  try {
    return numbering === "greek" ? fromGreek(psalm, verse) : fromHebrew(psalm, verse);
  } catch (error) {
    if (error instanceof PsalmNumberingError) {
      throw new ParseError(error.message, "out_of_range");
    }
    throw error;
  }
}

/** Verses a psalm has under the requested numbering, superscription included. */
function psalmVerseCount(numbering: Numbering, psalm: number): number {
  try {
    return numbering === "greek" ? greekVerseCount(psalm) : numberedVerses(psalm);
  } catch (error) {
    if (error instanceof PsalmNumberingError) {
      throw new ParseError(error.message, "out_of_range");
    }
    throw error;
  }
}

/* ------------------------------------------------------------------ *
 * Entry point.
 * ------------------------------------------------------------------ */

export function parseReference(
  input: string,
  options: {
    readonly numbering?: Numbering;
    /**
     * Which edition's versification to resolve against. A coordinate is only
     * meaningful paired with an edition; the default keeps existing callers
     * on the ASV.
     */
    readonly translation?: string;
  } = {},
): ParsedReference {
  const numbering: Numbering = options.numbering ?? "english";
  const translation: string = options.translation ?? DEFAULT_TRANSLATION;

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

  const book = resolveBook(bookPart, translation);

  if (numbering !== "english" && book !== "PSA") {
    const scheme = numbering === "greek" ? "Greek" : "Hebrew";
    throw new ParseError(
      `${scheme} numbering is only available for Psalms; ` +
        `${displayName(book)} is numbered the same way in every tradition`,
    );
  }

  const chapters = chapterCount(book, translation);
  const singleChapterBook = chapters === 1;

  // A bare book name means the whole book.
  const rawSegments: RawSegment[] =
    numericPart === ""
      ? [{ startChapter: 1, startVerse: 1, endChapter: chapters, endVerse: null }]
      : parseSegments(numericPart, singleChapterBook);

  let includeTitle = false;
  let titleChapter: number | null = null;
  const segments: RefSegment[] = [];

  for (const raw of rawSegments) {
    const startChapter = raw.startChapter ?? 1;
    const endChapter = raw.endChapter ?? startChapter;
    validateChapter(book, startChapter, translation);
    validateChapter(book, endChapter, translation);


    let startVerse: number;
    let endVerse: number;

    if (numbering !== "english") {
      const start = resolvePsalm(numbering, startChapter, raw.startVerse ?? 1);
      const end = resolvePsalm(
        numbering,
        endChapter,
        raw.endVerse ?? psalmVerseCount(numbering, endChapter),
      );

      if (start.kind === "title") {
        includeTitle = true;
        titleChapter = start.psalm;
      }
      // A range that ends on a superscription covers nothing but that title.
      if (end.kind === "title") {
        includeTitle = true;
        titleChapter = end.psalm;
        continue;
      }

      // Greek numbering can move the psalm as well as the verse, so the
      // English chapter comes from the resolved position, not the input.
      const startPsalm = start.psalm;
      const startEnglishVerse = start.kind === "title" ? 1 : start.verse;
      const startRef: VerseRef = {
        book,
        chapter: startPsalm,
        verse: startEnglishVerse,
        sequence: sequenceOf(book, startPsalm, startEnglishVerse, translation),
      };
      const endRef: VerseRef = {
        book,
        chapter: end.psalm,
        verse: end.verse,
        sequence: sequenceOf(book, end.psalm, end.verse, translation),
      };
      if (endRef.sequence < startRef.sequence) {
        throw new ParseError(
          `Reference range runs backwards: Psalm ${startChapter}:${raw.startVerse ?? 1}` +
            ` is after ${endChapter}:${raw.endVerse ?? ""}`,
          "syntax",
        );
      }
      segments.push({ start: startRef, end: endRef });
      continue;
    }

    {
      startVerse = raw.startVerse ?? 1;
      endVerse = raw.endVerse ?? verseCount(book, endChapter, translation);
      validateVerse(book, startChapter, startVerse, translation);
      validateVerse(book, endChapter, endVerse, translation);
    }

    const start: VerseRef = {
      book,
      chapter: startChapter,
      verse: startVerse,
      sequence: sequenceOf(book, startChapter, startVerse, translation),
    };
    const end: VerseRef = {
      book,
      chapter: endChapter,
      verse: endVerse,
      sequence: sequenceOf(book, endChapter, endVerse, translation),
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
    reference: formatReference(book, segments, includeTitle, titleChapter, numbering),
    book,
    numbering,
    includeTitle,
    titleChapter,
    segments,
    verseCount: verseTotal,
  };
}

function validateChapter(
  book: string,
  chapter: number,
  translation: string,
): void {
  const total = chapterCount(book, translation);
  if (chapter < 1 || chapter > total) {
    throw new ParseError(
      `${displayName(book)} has ${total} chapter${total === 1 ? "" : "s"}, so there is no chapter ${chapter}`,
      "out_of_range",
    );
  }
}

function validateVerse(
  book: string,
  chapter: number,
  verse: number,
  translation: string,
): void {
  const total = verseCount(book, chapter, translation);
  if (verse < 1 || verse > total) {
    throw new ParseError(
      `${displayName(book)} ${chapter} only has ${total} verses`,
      "out_of_range",
    );
  }
}

function formatReference(
  book: string,
  segments: readonly RefSegment[],
  includeTitle: boolean,
  titleChapter: number | null,
  numbering: Numbering,
): string {
  const name = displayName(book);
  const scheme =
    numbering === "hebrew"
      ? " (Hebrew numbering)"
      : numbering === "greek"
        ? " (Greek numbering)"
        : "";

  // A request that resolves to nothing but a superscription still has to say
  // which chapter's superscription it is.
  if (segments.length === 0) {
    return titleChapter === null
      ? `${name} title${scheme}`
      : `${name} ${titleChapter} title${scheme}`;
  }

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
  const titleMark = includeTitle ? " with title" : "";
  return `${name} ${parts.join(",")}${titleMark}${scheme}`;
}

/**
 * Reverse of {@link sequenceOf}: turns a global verse sequence back into its
 * book, chapter, and verse. Throws for sequences outside the edition's range —
 * 1..31102 for the ASV, but that ceiling belongs to the edition, not to this
 * function.
 */
export function locate(
  sequence: number,
  translation: string,
): { book: string; chapter: number; verse: number } {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new ParseError(`Verse sequence out of range: ${sequence}`, "out_of_range");
  }
  const { order, bookStarts, chapterOffset, verseCounts } = versificationOf(translation);
  // Binary search rather than a scan: a 500-verse passage calls this once per
  // verse, and a linear pass over 66 books made that 33,000 iterations.
  let low = 0;
  let high = bookStarts.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (bookStarts[mid]! <= sequence) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (found === -1) throw new ParseError(`Verse sequence out of range: ${sequence}`, "out_of_range");

  const bookId = order[found]!;
  const offsets = chapterOffset.get(bookId)!;
  const chapters = verseCounts[bookId]!;
  const bookLength = offsets[offsets.length - 1]! + chapters[chapters.length - 1]!;
  const withinBook = sequence - bookStarts[found]!;
  if (withinBook >= bookLength) {
    throw new ParseError(`Verse sequence out of range: ${sequence}`, "out_of_range");
  }
  // Chapter offsets ascend too, so the same search applies within the book.
  let clow = 0;
  let chigh = offsets.length - 1;
  let chapterIndex = 0;
  while (clow <= chigh) {
    const mid = (clow + chigh) >>> 1;
    if (offsets[mid]! <= withinBook) {
      chapterIndex = mid;
      clow = mid + 1;
    } else {
      chigh = mid - 1;
    }
  }
  return {
    book: bookId,
    chapter: chapterIndex + 1,
    verse: withinBook - offsets[chapterIndex]! + 1,
  };
}
