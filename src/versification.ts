/**
 * Versification — how one edition numbers its verses.
 *
 * This is deliberately not part of the canon. Two editions can agree perfectly
 * on which books exist and in what order, and still disagree about how many
 * verses are in a chapter: 32 of the 66 books the ASV and the Douay-Rheims
 * share are numbered differently, Esther and Daniel by whole chapters. A verse
 * coordinate is therefore only meaningful paired with the edition it was taken
 * from, and there is no shared skeleton to factor out.
 *
 * The tables below are derived, not authored. Given an edition's verse counts
 * and its book order, everything the sequence arithmetic needs falls out:
 * where each book starts in the global numbering, where each chapter starts
 * within its book, and the ascending book starts that {@link import("./parser.ts").locate}
 * binary-searches.
 *
 * Building them costs a pass over every chapter in the edition, so callers get
 * them through a memo in `src/translations.ts` rather than building per call.
 * The Worker's cold start lands on whichever request an isolate serves first;
 * an edition nobody asks for should not be paid for.
 */

export interface Versification {
  /** Chapter-by-chapter verse counts, keyed by book id. */
  readonly verseCounts: Readonly<Record<string, readonly number[]>>;
  /** The edition's book order. Index positions line up with {@link bookStarts}. */
  readonly order: readonly string[];
  /** First global sequence of each book, keyed by book id. One-based. */
  readonly bookStart: ReadonlyMap<string, number>;
  /** Verses preceding each chapter, within its own book. Zero-based. */
  readonly chapterOffset: ReadonlyMap<string, readonly number[]>;
  /** Ascending first-sequence of each book, positionally matched to {@link order}. */
  readonly bookStarts: readonly number[];
  /** Every verse in the edition. */
  readonly totalVerses: number;
}

/**
 * Derives the sequence tables for one edition.
 *
 * Throws rather than skipping when a book in the order has no counts: a
 * silently shortened table would put every later book's coordinates off by
 * however many verses were missed, and the arithmetic would still look sound.
 */
export function buildVersification(
  verseCounts: Readonly<Record<string, readonly number[]>>,
  order: readonly string[],
): Versification {
  const bookStart = new Map<string, number>();
  const chapterOffset = new Map<string, readonly number[]>();

  let running = 0;
  for (const bookId of order) {
    const chapters = verseCounts[bookId];
    if (chapters === undefined) throw new Error(`Missing verse counts for ${bookId}`);
    bookStart.set(bookId, running + 1);
    const offsets: number[] = [];
    let withinBook = 0;
    for (const count of chapters) {
      offsets.push(withinBook);
      withinBook += count;
    }
    chapterOffset.set(bookId, offsets);
    running += withinBook;
  }

  return {
    verseCounts,
    order,
    bookStart,
    chapterOffset,
    bookStarts: order.map((id) => bookStart.get(id) ?? 0),
    totalVerses: running,
  };
}
