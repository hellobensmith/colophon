/**
 * Runtime view over the embedded corpora.
 *
 * Each edition's tables are built once and kept, but **not eagerly**. Cloudflare
 * charges global-scope evaluation against a one-second startup budget separate
 * from the per-request CPU limit, and that budget is paid by whichever request
 * an isolate happens to serve first. Building every registered edition's offset
 * table at module scope would charge that request for texts it did not ask for,
 * so the work happens on first use per edition — the same reasoning, and the
 * same shape, as `versificationOf` in `src/translations.ts`.
 *
 * The verse text itself is still a module-scope string constant in each
 * generated module; only the derived tables are deferred.
 */

import * as asvText from "./data/asv/text.ts";
import * as asvMeta from "./data/asv/meta.ts";
import * as draText from "./data/dra/text.ts";
import * as draMeta from "./data/dra/meta.ts";
import * as sblgntText from "./data/sblgnt/text.ts";
import * as sblgntMeta from "./data/sblgnt/meta.ts";
import { locate, sequenceOf } from "./parser.ts";
import { UnknownTranslationError } from "./translations.ts";

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

/** The generated modules for one edition, before any table is derived. */
interface EditionModules {
  readonly text: string;
  readonly lengths: string;
  readonly verseCount: number;
  readonly titles: Readonly<Record<string, string>>;
  readonly subscriptions: Readonly<Record<string, string>>;
  readonly notes: Readonly<Record<string, string>>;
  readonly revisionId: string;
  readonly generationId: string;
  readonly editionId: string;
}

/**
 * Statically imported, because a Worker bundle has no loader: every edition it
 * can serve has to be present at build time. Registering an edition in
 * `src/translations.ts` without adding it here would resolve coordinates
 * correctly and then read another edition's words.
 */
const MODULES: Readonly<Record<string, EditionModules>> = {
  asv: {
    text: asvText.TEXT,
    lengths: asvText.LENGTHS,
    verseCount: asvText.VERSE_COUNT,
    titles: asvMeta.TITLES,
    subscriptions: asvMeta.SUBSCRIPTIONS,
    notes: asvMeta.NOTES,
    revisionId: asvMeta.REVISION_ID,
    generationId: asvMeta.GENERATION_ID,
    editionId: asvMeta.EDITION_ID,
  },
  dra: {
    text: draText.TEXT,
    lengths: draText.LENGTHS,
    verseCount: draText.VERSE_COUNT,
    titles: draMeta.TITLES,
    subscriptions: draMeta.SUBSCRIPTIONS,
    notes: draMeta.NOTES,
    revisionId: draMeta.REVISION_ID,
    generationId: draMeta.GENERATION_ID,
    editionId: draMeta.EDITION_ID,
  },
  sblgnt: {
    text: sblgntText.TEXT,
    lengths: sblgntText.LENGTHS,
    verseCount: sblgntText.VERSE_COUNT,
    titles: sblgntMeta.TITLES,
    subscriptions: sblgntMeta.SUBSCRIPTIONS,
    notes: sblgntMeta.NOTES,
    revisionId: sblgntMeta.REVISION_ID,
    generationId: sblgntMeta.GENERATION_ID,
    editionId: sblgntMeta.EDITION_ID,
  },
};

interface Corpus extends EditionModules {
  /** Cumulative offsets: verse n occupies [offsets[n-1], offsets[n]). */
  readonly offsets: Int32Array;
}

const BUILT = new Map<string, Corpus>();

function corpusFor(translation: string): Corpus {
  const cached = BUILT.get(translation);
  if (cached !== undefined) return cached;

  const modules = MODULES[translation];
  if (modules === undefined) {
    throw new UnknownTranslationError(translation);
  }

  const lengths = decodeDeltas(modules.lengths, modules.verseCount);
  const offsets = new Int32Array(modules.verseCount + 1);
  let cursor = 0;
  for (let index = 0; index < modules.verseCount; index += 1) {
    offsets[index] = cursor;
    cursor += lengths[index]!;
  }
  offsets[modules.verseCount] = cursor;

  const built: Corpus = { ...modules, offsets };
  BUILT.set(translation, built);
  return built;
}

/** Which editions have text embedded, as opposed to merely being registered. */
export const EMBEDDED_TRANSLATIONS: readonly string[] = Object.keys(MODULES);

export function totalVersesOf(translation: string): number {
  return corpusFor(translation).verseCount;
}

/** What this edition is and what was published, for identity headers. */
export function identityOf(translation: string): {
  readonly editionId: string;
  readonly revisionId: string;
  readonly generationId: string;
} {
  const corpus = corpusFor(translation);
  return {
    editionId: corpus.editionId,
    revisionId: corpus.revisionId,
    generationId: corpus.generationId,
  };
}

export interface CorpusVerse {
  /**
   * The edition this verse was actually read from.
   *
   * Carried so provenance can be checked rather than assumed. Three separate
   * bugs in this codebase resolved a coordinate against one edition and read
   * the text from another, and every one returned HTTP 200 with a real verse
   * in it. A type cannot catch passing the wrong translation, only a missing
   * one — this field is what lets the response boundary catch the rest.
   */
  readonly translation: string;
  readonly id: string;
  readonly book: string;
  readonly chapter: number;
  readonly verse: number;
  readonly sequence: number;
  readonly text: string;
  readonly note: string | null;
}

/** Verse text by global sequence, without materializing any intermediate array. */
export function textAt(sequence: number, translation: string): string {
  const corpus = corpusFor(translation);
  if (sequence < 1 || sequence > corpus.verseCount) {
    throw new RangeError(`Verse sequence out of range: ${sequence}`);
  }
  return corpus.text.slice(corpus.offsets[sequence - 1]!, corpus.offsets[sequence]!);
}

export function verseAt(
  sequence: number,
  translation: string,
): CorpusVerse {
  const corpus = corpusFor(translation);
  const { book, chapter, verse } = locate(sequence, translation);
  const id = `${book}.${chapter}.${verse}`;
  return {
    translation,
    id,
    book,
    chapter,
    verse,
    sequence,
    text: textAt(sequence, translation),
    note: corpus.notes[id] ?? null,
  };
}

export function verseByReference(
  book: string,
  chapter: number,
  verse: number,
  translation: string,
): CorpusVerse {
  return verseAt(sequenceOf(book, chapter, verse, translation), translation);
}

/** The superscription printed above a chapter, if it has one. */
export function descriptiveTitle(
  book: string,
  chapter: number,
  translation: string,
): string | null {
  return corpusFor(translation).titles[`${book}.${chapter}`] ?? null;
}

/**
 * The line printed below a chapter's last verse, if it has one. Only Habakkuk 3
 * has one in the ASV; the Douay-Rheims has none at all.
 */
export function subscription(
  book: string,
  chapter: number,
  translation: string,
): string | null {
  return corpusFor(translation).subscriptions[`${book}.${chapter}`] ?? null;
}
