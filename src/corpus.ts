/**
 * Runtime view over the embedded corpus.
 *
 * Every table is built once at module scope. Cloudflare charges global-scope
 * evaluation against a one-second startup budget that is separate from the
 * per-request CPU limit, so doing this work eagerly here keeps requests cheap
 * rather than making the first request in an isolate pay for it.
 */

import { TEXT, LENGTHS, VERSE_COUNT } from "./data/text.ts";
import { TITLES, SUBSCRIPTIONS, NOTES } from "./data/meta.ts";
import { locate, sequenceOf } from "./parser.ts";

/** Decodes a base36 delta list into absolute values. */
export function decodeDeltas(encoded: string, expected: number): Int32Array {
  const parts = encoded.split(",");
  if (parts.length !== expected) {
    throw new Error(`Expected ${expected} encoded values, found ${parts.length}`);
  }
  const values = new Int32Array(expected);
  let running = 0;
  for (let index = 0; index < parts.length; index += 1) {
    running += Number.parseInt(parts[index]!, 36);
    values[index] = running;
  }
  return values;
}

/** Cumulative character offsets: verse n occupies [OFFSETS[n-1], OFFSETS[n]). */
const OFFSETS: Int32Array = (() => {
  const lengths = decodeDeltas(LENGTHS, VERSE_COUNT);
  const offsets = new Int32Array(VERSE_COUNT + 1);
  let cursor = 0;
  for (let index = 0; index < VERSE_COUNT; index += 1) {
    offsets[index] = cursor;
    cursor += lengths[index]!;
  }
  offsets[VERSE_COUNT] = cursor;
  return offsets;
})();

export const TOTAL_VERSES = VERSE_COUNT;

export interface CorpusVerse {
  readonly id: string;
  readonly book: string;
  readonly chapter: number;
  readonly verse: number;
  readonly sequence: number;
  readonly text: string;
  readonly note: string | null;
}

/** Verse text by global sequence, without materializing any intermediate array. */
export function textAt(sequence: number): string {
  if (sequence < 1 || sequence > VERSE_COUNT) {
    throw new RangeError(`Verse sequence out of range: ${sequence}`);
  }
  return TEXT.slice(OFFSETS[sequence - 1]!, OFFSETS[sequence]!);
}

export function verseAt(sequence: number): CorpusVerse {
  const { book, chapter, verse } = locate(sequence);
  const id = `${book}.${chapter}.${verse}`;
  return {
    id,
    book,
    chapter,
    verse,
    sequence,
    text: textAt(sequence),
    note: NOTES[id] ?? null,
  };
}

export function verseByReference(book: string, chapter: number, verse: number): CorpusVerse {
  return verseAt(sequenceOf(book, chapter, verse));
}

/** The superscription printed above a chapter, if it has one. */
export function descriptiveTitle(book: string, chapter: number): string | null {
  return TITLES[`${book}.${chapter}`] ?? null;
}

/**
 * The line printed below a chapter's last verse, if it has one. Only Habakkuk 3
 * has one in the ASV.
 */
export function subscription(book: string, chapter: number): string | null {
  return SUBSCRIPTIONS[`${book}.${chapter}`] ?? null;
}
