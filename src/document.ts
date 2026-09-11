/**
 * The document shape every Scripture reader produces, regardless of source
 * format. USFX (`src/usfx.ts`), USFM (`src/usfm.ts`) and USX (`src/usx.ts`)
 * all parse to this — which is what lets `validateCorpus` and the build
 * pipeline hold any of the three to the same no-silent-loss discipline,
 * rather than one format getting a rigorous gate and the others a weaker one.
 */

import type { ScriptureFormat } from "./format.ts";

export interface Verse {
  readonly bcv: string;
  readonly book: string;
  readonly chapter: number;
  readonly verse: number;
  readonly text: string;
  /** Footnote prose, present on the verses a translation omits. */
  readonly note: string | null;
}

/**
 * Where a run of source text ended up, and how much of it there was.
 *
 * Counted rather than listed: a corpus holds hundreds of thousands of text
 * runs, and the invariant worth checking is arithmetic, not a transcript.
 * Every character in the source is either emitted somewhere or dropped
 * somewhere, and the totals have to agree. Text moving to the wrong
 * destination shifts two counters; text vanishing breaks the sum.
 */
export interface CoverageLedger {
  /** Characters routed to verse bodies, keyed by the marker that carried them. */
  readonly toVerses: ReadonlyMap<string, number>;
  /** Characters routed to chapter superscriptions. */
  readonly toTitles: ReadonlyMap<string, number>;
  /** Characters routed to chapter subscriptions. */
  readonly toSubscriptions: ReadonlyMap<string, number>;
  /** Characters routed to verse notes. */
  readonly toNotes: ReadonlyMap<string, number>;
  /** Characters deliberately dropped, keyed by marker — the lossy inventory. */
  readonly dropped: ReadonlyMap<string, number>;
  /** Characters seen outside any destination, e.g. whitespace between books. */
  readonly unattributed: number;
  /** Total characters across every text run in the source. */
  readonly sourceCharacters: number;
}

export interface ScriptureDocument {
  /** Which reader produced this document — the key into per-format ground truth. */
  readonly format: ScriptureFormat;
  readonly verses: readonly Verse[];
  /**
   * Chapter superscriptions printed *above* a chapter, keyed by
   * "BOOK.CHAPTER" — the titles of the Psalms ("A Psalm of David.").
   */
  readonly titles: ReadonlyMap<string, string>;
  /**
   * Chapter subscriptions printed *below* a chapter's last verse. USFX marks
   * these with the same element as a superscription, so position is the
   * only thing that separates them: Habakkuk 3 closes with "For the Chief
   * Musician, on my stringed instruments", which belongs after verse 19,
   * not above verse 1.
   */
  readonly subscriptions: ReadonlyMap<string, string>;
  /** Canonical book ids in document order, excluding front/back matter. */
  readonly books: readonly string[];
  /** Proof that no source text disappeared silently. See {@link CoverageLedger}. */
  readonly ledger: CoverageLedger;
}

/** Total characters recorded in one bucket, across every marker that carried them. */
export function sumBucket(bucket: ReadonlyMap<string, number>): number {
  return [...bucket.values()].reduce((total, n) => total + n, 0);
}

/** The six-bucket total a `CoverageLedger` must balance against `sourceCharacters`. */
export function sumLedger(ledger: CoverageLedger): number {
  return (
    sumBucket(ledger.toVerses) +
    sumBucket(ledger.toTitles) +
    sumBucket(ledger.toSubscriptions) +
    sumBucket(ledger.toNotes) +
    sumBucket(ledger.dropped) +
    ledger.unattributed
  );
}
