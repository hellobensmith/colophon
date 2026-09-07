/**
 * Canon metadata and per-tradition book ordering.
 *
 * Orderings, each checked against a named authority rather than reconstructed:
 *  - Protestant (66): the ASV's own table of contents.
 *  - Catholic (73): the canonical order published by the USCCB for the NABRE
 *    (https://bible.usccb.org/bible), which follows the Vulgate tradition
 *    affirmed at the Council of Trent (1546). Verified book by book.
 *  - Orthodox Greek (76): the order of Rahlfs-Hanhart, *Septuaginta* (editio
 *    altera, Deutsche Bibelgesellschaft), the standard critical edition of the
 *    Greek Old Testament. Three features distinguish it from the Vulgate and
 *    are easy to get wrong: Esther precedes Judith and Tobit; Job follows the
 *    Song of Songs rather than preceding Proverbs; and the Twelve come *before*
 *    Isaiah, in their own LXX sequence (Hosea, Amos, Micah, Joel, ...) which is
 *    not the Masoretic one.
 *
 * A caution on printed Bibles: Greek Orthodox editions are not uniformly
 * ordered, and comparative tables often silently re-sort the Septuagint column
 * to align it row-by-row with a King James column. This file follows the
 * critical edition and does not attempt to represent every printed variant.
 *
 * Counting conventions, which is where the traditional totals of 73 and 76
 * actually come from:
 *  - The Letter of Jeremiah is carried as Baruch 6 rather than a separate book,
 *    as in the Vulgate and the Catholic canon.
 *  - Psalm 151 is appended to the Psalter rather than counted as a book, and
 *    4 Maccabees is treated as an appendix, as in Greek Orthodox practice.
 *  - The Greek additions to Esther and Daniel (Susanna, Bel and the Dragon, the
 *    Song of the Three) belong to those books, not to separate entries.
 *
 * The ASV contains no deuterocanonical text, so every deuterocanonical book is
 * carried as metadata only, with no verses.
 */

export type Tradition = "protestant" | "catholic" | "orthodox_greek";
export type Testament = "OT" | "NT";
export type DataAvailability = "full" | "metadata_only";

export interface BookMeta {
  readonly id: string;
  readonly name: string;
  readonly testament: Testament;
  readonly author: string;
  readonly approximateDate: string;
  readonly genre: string;
  readonly isDeuterocanon: boolean;
  readonly dataAvailability: DataAvailability;
}

/**
 * `author` and `approximateDate` record the *traditional* ascription — what the
 * receiving tradition has said about a book — not a critical judgement. "Moses"
 * for the Pentateuch and "Ezra" for Chronicles are conventions of that kind.
 * The date ranges are correspondingly broad, spanning the composition debate
 * rather than settling it. Treat both as catalogue metadata, not scholarship.
 */
type BookRow = readonly [
  id: string,
  name: string,
  testament: Testament,
  author: string,
  approximateDate: string,
  genre: string,
];

/** The 66 books present in the ASV, in Protestant order. */
const PROTESTANT_ROWS: readonly BookRow[] = [
  ["GEN", "Genesis", "OT", "Moses", "c. 1400-400 BC", "Law"],
  ["EXO", "Exodus", "OT", "Moses", "c. 1400-400 BC", "Law"],
  ["LEV", "Leviticus", "OT", "Moses", "c. 1400-400 BC", "Law"],
  ["NUM", "Numbers", "OT", "Moses", "c. 1400-400 BC", "Law"],
  ["DEU", "Deuteronomy", "OT", "Moses", "c. 1400-400 BC", "Law"],
  ["JOS", "Joshua", "OT", "Joshua", "c. 1200-550 BC", "History"],
  ["JDG", "Judges", "OT", "Samuel", "c. 1050-550 BC", "History"],
  ["RUT", "Ruth", "OT", "Samuel", "c. 1000-450 BC", "History"],
  ["1SA", "1 Samuel", "OT", "Samuel, Nathan, and Gad", "c. 1000-550 BC", "History"],
  ["2SA", "2 Samuel", "OT", "Samuel, Nathan, and Gad", "c. 1000-550 BC", "History"],
  ["1KI", "1 Kings", "OT", "Jeremiah", "c. 600-550 BC", "History"],
  ["2KI", "2 Kings", "OT", "Jeremiah", "c. 600-550 BC", "History"],
  ["1CH", "1 Chronicles", "OT", "Ezra", "c. 450-400 BC", "History"],
  ["2CH", "2 Chronicles", "OT", "Ezra", "c. 450-400 BC", "History"],
  ["EZR", "Ezra", "OT", "Ezra", "c. 450-400 BC", "History"],
  ["NEH", "Nehemiah", "OT", "Nehemiah", "c. 430-400 BC", "History"],
  ["EST", "Esther", "OT", "Mordecai", "c. 470-350 BC", "History"],
  ["JOB", "Job", "OT", "Unknown", "c. 2000-500 BC", "Wisdom"],
  ["PSA", "Psalms", "OT", "David and others", "c. 1000-400 BC", "Poetry"],
  ["PRO", "Proverbs", "OT", "Solomon and others", "c. 950-700 BC", "Wisdom"],
  ["ECC", "Ecclesiastes", "OT", "Solomon", "c. 950-200 BC", "Wisdom"],
  ["SNG", "Song of Solomon", "OT", "Solomon", "c. 950-400 BC", "Poetry"],
  ["ISA", "Isaiah", "OT", "Isaiah", "c. 740-680 BC", "Major Prophets"],
  ["JER", "Jeremiah", "OT", "Jeremiah", "c. 626-580 BC", "Major Prophets"],
  ["LAM", "Lamentations", "OT", "Jeremiah", "c. 586-570 BC", "Major Prophets"],
  ["EZK", "Ezekiel", "OT", "Ezekiel", "c. 593-570 BC", "Major Prophets"],
  ["DAN", "Daniel", "OT", "Daniel", "c. 605-165 BC", "Major Prophets"],
  ["HOS", "Hosea", "OT", "Hosea", "c. 750-715 BC", "Minor Prophets"],
  ["JOL", "Joel", "OT", "Joel", "c. 835-400 BC", "Minor Prophets"],
  ["AMO", "Amos", "OT", "Amos", "c. 760-750 BC", "Minor Prophets"],
  ["OBA", "Obadiah", "OT", "Obadiah", "c. 850-586 BC", "Minor Prophets"],
  ["JON", "Jonah", "OT", "Jonah", "c. 780-400 BC", "Minor Prophets"],
  ["MIC", "Micah", "OT", "Micah", "c. 735-700 BC", "Minor Prophets"],
  ["NAM", "Nahum", "OT", "Nahum", "c. 663-612 BC", "Minor Prophets"],
  ["HAB", "Habakkuk", "OT", "Habakkuk", "c. 640-600 BC", "Minor Prophets"],
  ["ZEP", "Zephaniah", "OT", "Zephaniah", "c. 640-609 BC", "Minor Prophets"],
  ["HAG", "Haggai", "OT", "Haggai", "c. 520 BC", "Minor Prophets"],
  ["ZEC", "Zechariah", "OT", "Zechariah", "c. 520-480 BC", "Minor Prophets"],
  ["MAL", "Malachi", "OT", "Malachi", "c. 430-400 BC", "Minor Prophets"],
  ["MAT", "Matthew", "NT", "Matthew", "c. AD 60-90", "Gospel"],
  ["MRK", "Mark", "NT", "John Mark", "c. AD 55-70", "Gospel"],
  ["LUK", "Luke", "NT", "Luke", "c. AD 60-85", "Gospel"],
  ["JHN", "John", "NT", "John the Apostle", "c. AD 85-95", "Gospel"],
  ["ACT", "Acts", "NT", "Luke", "c. AD 62-90", "History"],
  ["ROM", "Romans", "NT", "Paul", "c. AD 57", "Epistle"],
  ["1CO", "1 Corinthians", "NT", "Paul", "c. AD 55", "Epistle"],
  ["2CO", "2 Corinthians", "NT", "Paul", "c. AD 56", "Epistle"],
  ["GAL", "Galatians", "NT", "Paul", "c. AD 49-55", "Epistle"],
  ["EPH", "Ephesians", "NT", "Paul", "c. AD 60-62", "Epistle"],
  ["PHP", "Philippians", "NT", "Paul", "c. AD 60-62", "Epistle"],
  ["COL", "Colossians", "NT", "Paul", "c. AD 60-62", "Epistle"],
  ["1TH", "1 Thessalonians", "NT", "Paul", "c. AD 50-51", "Epistle"],
  ["2TH", "2 Thessalonians", "NT", "Paul", "c. AD 50-52", "Epistle"],
  ["1TI", "1 Timothy", "NT", "Paul", "c. AD 62-64", "Epistle"],
  ["2TI", "2 Timothy", "NT", "Paul", "c. AD 64-67", "Epistle"],
  ["TIT", "Titus", "NT", "Paul", "c. AD 62-64", "Epistle"],
  ["PHM", "Philemon", "NT", "Paul", "c. AD 60-62", "Epistle"],
  ["HEB", "Hebrews", "NT", "Unknown", "c. AD 60-90", "Epistle"],
  ["JAS", "James", "NT", "James, brother of Jesus", "c. AD 45-62", "Epistle"],
  ["1PE", "1 Peter", "NT", "Peter", "c. AD 60-65", "Epistle"],
  ["2PE", "2 Peter", "NT", "Peter", "c. AD 65-68", "Epistle"],
  ["1JN", "1 John", "NT", "John the Apostle", "c. AD 85-95", "Epistle"],
  ["2JN", "2 John", "NT", "John the Apostle", "c. AD 85-95", "Epistle"],
  ["3JN", "3 John", "NT", "John the Apostle", "c. AD 85-95", "Epistle"],
  ["JUD", "Jude", "NT", "Jude, brother of Jesus", "c. AD 65-80", "Epistle"],
  ["REV", "Revelation", "NT", "John", "c. AD 68-95", "Apocalyptic"],
];

/** Deuterocanonical books, carried as metadata only. */
const DEUTEROCANON_ROWS: readonly BookRow[] = [
  ["TOB", "Tobit", "OT", "Unknown", "c. 225-175 BC", "History"],
  ["JDT", "Judith", "OT", "Unknown", "c. 150-100 BC", "History"],
  ["WIS", "Wisdom of Solomon", "OT", "Unknown", "c. 100-50 BC", "Wisdom"],
  ["SIR", "Sirach", "OT", "Jesus ben Sira", "c. 200-175 BC", "Wisdom"],
  ["BAR", "Baruch", "OT", "Baruch", "c. 200-100 BC", "Major Prophets"],
  ["1MA", "1 Maccabees", "OT", "Unknown", "c. 100 BC", "History"],
  ["2MA", "2 Maccabees", "OT", "Unknown", "c. 124-100 BC", "History"],
  ["1ES", "1 Esdras", "OT", "Unknown", "c. 200-100 BC", "History"],
  ["3MA", "3 Maccabees", "OT", "Unknown", "c. 100-1 BC", "History"],
  ["MAN", "Prayer of Manasseh", "OT", "Unknown", "c. 200-1 BC", "Poetry"],
];

const DEUTEROCANON_IDS: ReadonlySet<string> = new Set(
  DEUTEROCANON_ROWS.map((row) => row[0]),
);

function toMeta(row: BookRow): BookMeta {
  const isDeuterocanon = DEUTEROCANON_IDS.has(row[0]);
  return {
    id: row[0],
    name: row[1],
    testament: row[2],
    author: row[3],
    approximateDate: row[4],
    genre: row[5],
    isDeuterocanon,
    dataAvailability: isDeuterocanon ? "metadata_only" : "full",
  };
}

export const BOOKS: ReadonlyMap<string, BookMeta> = new Map(
  [...PROTESTANT_ROWS, ...DEUTEROCANON_ROWS].map((row) => [row[0], toMeta(row)]),
);

/** The 66 books of the ASV, in Protestant order. */
export const PROTESTANT_ORDER: readonly string[] = PROTESTANT_ROWS.map((row) => row[0]);

const NEW_TESTAMENT_ORDER: readonly string[] = PROTESTANT_ROWS.filter(
  (row) => row[2] === "NT",
).map((row) => row[0]);

/** Vulgate order, as carried into the Nova Vulgata and NABRE. */
const CATHOLIC_OLD_TESTAMENT: readonly string[] = [
  "GEN", "EXO", "LEV", "NUM", "DEU",
  "JOS", "JDG", "RUT", "1SA", "2SA", "1KI", "2KI", "1CH", "2CH", "EZR", "NEH",
  "TOB", "JDT", "EST", "1MA", "2MA",
  "JOB", "PSA", "PRO", "ECC", "SNG", "WIS", "SIR",
  "ISA", "JER", "LAM", "BAR", "EZK", "DAN",
  "HOS", "JOL", "AMO", "OBA", "JON", "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL",
];

/**
 * Greek Septuagint order as printed by the Greek Orthodox Church. The Minor
 * Prophets precede the Major Prophets, and the Prayer of Manasseh follows the
 * Psalter.
 */
const ORTHODOX_OLD_TESTAMENT: readonly string[] = [
  "GEN", "EXO", "LEV", "NUM", "DEU",
  // History: 1 Esdras precedes 2 Esdras (Ezra-Nehemiah), and Esther comes
  // before Judith and Tobit — the reverse of the Vulgate arrangement.
  "JOS", "JDG", "RUT", "1SA", "2SA", "1KI", "2KI", "1CH", "2CH",
  "1ES", "EZR", "NEH", "EST", "JDT", "TOB", "1MA", "2MA", "3MA",
  // Poetry and wisdom: the Prayer of Manasseh follows the Psalter (it stands
  // among the Odes), and Job closes the section rather than opening it.
  "PSA", "MAN", "PRO", "ECC", "SNG", "JOB", "WIS", "SIR",
  // Prophets: the Twelve first, in the Septuagint's own order, then the Major
  // Prophets with Baruch between Jeremiah and Lamentations.
  "HOS", "AMO", "MIC", "JOL", "OBA", "JON", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL",
  "ISA", "JER", "BAR", "LAM", "EZK", "DAN",
];

export const CANON_ORDER: Readonly<Record<Tradition, readonly string[]>> = {
  protestant: PROTESTANT_ORDER,
  catholic: [...CATHOLIC_OLD_TESTAMENT, ...NEW_TESTAMENT_ORDER],
  orthodox_greek: [...ORTHODOX_OLD_TESTAMENT, ...NEW_TESTAMENT_ORDER],
};

/**
 * How a particular printed edition orders its books.
 *
 * This is deliberately *not* {@link CANON_ORDER}, and the two must not be
 * collapsed. They answer different questions:
 *
 * - A **tradition** order answers "what is the Catholic canon, and in what
 *   sequence is it enumerated". `catholic` above follows the USCCB's NABRE
 *   interleaving, where Tobit and Judith sit after Nehemiah and Wisdom and
 *   Sirach after the Song.
 * - An **edition** order answers "how does this book of this edition actually
 *   print". eBible's Douay-Rheims gathers the whole deuterocanon *after
 *   Malachi*, immediately before Matthew.
 *
 * Both are real Catholic orderings. Reporting only the tradition order would
 * silently reorder what the source prints; reporting only the edition order
 * would make "the Catholic canon" change shape depending on which translation
 * was asked. So each is carried on its own terms, which is the same commitment
 * the identity headers make about the text itself.
 */
export type EditionId = "asv" | "dra";

const PROTESTANT_OLD_TESTAMENT: readonly string[] = PROTESTANT_ROWS.filter(
  (row) => row[2] === "OT",
).map((row) => row[0]);

/**
 * Verified 7 September 2026 against `engDRA_usfx.xml` (sha256 9dfbc526…): the
 * parsed document order is the 39 Protestant Old Testament books, then these
 * seven, then the New Testament.
 */
const DRA_DEUTEROCANON: readonly string[] = ["TOB", "JDT", "WIS", "SIR", "BAR", "1MA", "2MA"];

export const EDITION_ORDER: Readonly<Record<EditionId, readonly string[]>> = {
  asv: PROTESTANT_ORDER,
  dra: [...PROTESTANT_OLD_TESTAMENT, ...DRA_DEUTEROCANON, ...NEW_TESTAMENT_ORDER],
};

export const EDITIONS: readonly EditionId[] = ["asv", "dra"];

export function isEdition(value: string): value is EditionId {
  return (EDITIONS as readonly string[]).includes(value);
}

/** 1-based position of a book as this edition prints it, or null if absent. */
export function editionPosition(bookId: string, edition: EditionId): number | null {
  const index = EDITION_ORDER[edition].indexOf(bookId);
  return index === -1 ? null : index + 1;
}

export const TRADITIONS: readonly Tradition[] = [
  "protestant",
  "catholic",
  "orthodox_greek",
];

export function isTradition(value: string): value is Tradition {
  return (TRADITIONS as readonly string[]).includes(value);
}

/** 1-based position of a book within a tradition, or null if absent from it. */
export function canonPosition(bookId: string, tradition: Tradition): number | null {
  const index = CANON_ORDER[tradition].indexOf(bookId);
  return index === -1 ? null : index + 1;
}

/** Positions across every tradition, for the `canons` field of a book response. */
export function canonPositions(
  bookId: string,
): Readonly<Record<Tradition, number | null>> {
  return {
    protestant: canonPosition(bookId, "protestant"),
    catholic: canonPosition(bookId, "catholic"),
    orthodox_greek: canonPosition(bookId, "orthodox_greek"),
  };
}
