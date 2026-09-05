/**
 * Book identifiers, one row per book of the Protestant canon.
 *
 * Generated from the verified corpus rather than typed: ordinals are canonical
 * position, chapter counts come from the parsed source, and both are covered by
 * the main test suite. The conformance suite keeps its own copy so it stays
 * runnable by someone who does not have our corpus.
 *
 * The identifier schemes differ by API. Numeric ordinals address a book in
 * bolls.life, rkeplin and getbible; wldeh uses a lowercase slug; the rest take
 * a human reference string.
 */

export interface BookRow {
  readonly usfm: string;
  readonly ordinal: number;
  readonly name: string;
  readonly slug: string;
  readonly chapters: number;
  readonly lastChapterVerses: number;
}

export const BOOKS: readonly BookRow[] = [
  {
    "usfm": "GEN",
    "ordinal": 1,
    "name": "Genesis",
    "slug": "genesis",
    "chapters": 50,
    "lastChapterVerses": 26
  },
  {
    "usfm": "EXO",
    "ordinal": 2,
    "name": "Exodus",
    "slug": "exodus",
    "chapters": 40,
    "lastChapterVerses": 38
  },
  {
    "usfm": "LEV",
    "ordinal": 3,
    "name": "Leviticus",
    "slug": "leviticus",
    "chapters": 27,
    "lastChapterVerses": 34
  },
  {
    "usfm": "NUM",
    "ordinal": 4,
    "name": "Numbers",
    "slug": "numbers",
    "chapters": 36,
    "lastChapterVerses": 13
  },
  {
    "usfm": "DEU",
    "ordinal": 5,
    "name": "Deuteronomy",
    "slug": "deuteronomy",
    "chapters": 34,
    "lastChapterVerses": 12
  },
  {
    "usfm": "JOS",
    "ordinal": 6,
    "name": "Joshua",
    "slug": "joshua",
    "chapters": 24,
    "lastChapterVerses": 33
  },
  {
    "usfm": "JDG",
    "ordinal": 7,
    "name": "Judges",
    "slug": "judges",
    "chapters": 21,
    "lastChapterVerses": 25
  },
  {
    "usfm": "RUT",
    "ordinal": 8,
    "name": "Ruth",
    "slug": "ruth",
    "chapters": 4,
    "lastChapterVerses": 22
  },
  {
    "usfm": "1SA",
    "ordinal": 9,
    "name": "1 Samuel",
    "slug": "1samuel",
    "chapters": 31,
    "lastChapterVerses": 13
  },
  {
    "usfm": "2SA",
    "ordinal": 10,
    "name": "2 Samuel",
    "slug": "2samuel",
    "chapters": 24,
    "lastChapterVerses": 25
  },
  {
    "usfm": "1KI",
    "ordinal": 11,
    "name": "1 Kings",
    "slug": "1kings",
    "chapters": 22,
    "lastChapterVerses": 53
  },
  {
    "usfm": "2KI",
    "ordinal": 12,
    "name": "2 Kings",
    "slug": "2kings",
    "chapters": 25,
    "lastChapterVerses": 30
  },
  {
    "usfm": "1CH",
    "ordinal": 13,
    "name": "1 Chronicles",
    "slug": "1chronicles",
    "chapters": 29,
    "lastChapterVerses": 30
  },
  {
    "usfm": "2CH",
    "ordinal": 14,
    "name": "2 Chronicles",
    "slug": "2chronicles",
    "chapters": 36,
    "lastChapterVerses": 23
  },
  {
    "usfm": "EZR",
    "ordinal": 15,
    "name": "Ezra",
    "slug": "ezra",
    "chapters": 10,
    "lastChapterVerses": 44
  },
  {
    "usfm": "NEH",
    "ordinal": 16,
    "name": "Nehemiah",
    "slug": "nehemiah",
    "chapters": 13,
    "lastChapterVerses": 31
  },
  {
    "usfm": "EST",
    "ordinal": 17,
    "name": "Esther",
    "slug": "esther",
    "chapters": 10,
    "lastChapterVerses": 3
  },
  {
    "usfm": "JOB",
    "ordinal": 18,
    "name": "Job",
    "slug": "job",
    "chapters": 42,
    "lastChapterVerses": 17
  },
  {
    "usfm": "PSA",
    "ordinal": 19,
    "name": "Psalms",
    "slug": "psalms",
    "chapters": 150,
    "lastChapterVerses": 6
  },
  {
    "usfm": "PRO",
    "ordinal": 20,
    "name": "Proverbs",
    "slug": "proverbs",
    "chapters": 31,
    "lastChapterVerses": 31
  },
  {
    "usfm": "ECC",
    "ordinal": 21,
    "name": "Ecclesiastes",
    "slug": "ecclesiastes",
    "chapters": 12,
    "lastChapterVerses": 14
  },
  {
    "usfm": "SNG",
    "ordinal": 22,
    "name": "Song of Solomon",
    "slug": "songofsolomon",
    "chapters": 8,
    "lastChapterVerses": 14
  },
  {
    "usfm": "ISA",
    "ordinal": 23,
    "name": "Isaiah",
    "slug": "isaiah",
    "chapters": 66,
    "lastChapterVerses": 24
  },
  {
    "usfm": "JER",
    "ordinal": 24,
    "name": "Jeremiah",
    "slug": "jeremiah",
    "chapters": 52,
    "lastChapterVerses": 34
  },
  {
    "usfm": "LAM",
    "ordinal": 25,
    "name": "Lamentations",
    "slug": "lamentations",
    "chapters": 5,
    "lastChapterVerses": 22
  },
  {
    "usfm": "EZK",
    "ordinal": 26,
    "name": "Ezekiel",
    "slug": "ezekiel",
    "chapters": 48,
    "lastChapterVerses": 35
  },
  {
    "usfm": "DAN",
    "ordinal": 27,
    "name": "Daniel",
    "slug": "daniel",
    "chapters": 12,
    "lastChapterVerses": 13
  },
  {
    "usfm": "HOS",
    "ordinal": 28,
    "name": "Hosea",
    "slug": "hosea",
    "chapters": 14,
    "lastChapterVerses": 9
  },
  {
    "usfm": "JOL",
    "ordinal": 29,
    "name": "Joel",
    "slug": "joel",
    "chapters": 3,
    "lastChapterVerses": 21
  },
  {
    "usfm": "AMO",
    "ordinal": 30,
    "name": "Amos",
    "slug": "amos",
    "chapters": 9,
    "lastChapterVerses": 15
  },
  {
    "usfm": "OBA",
    "ordinal": 31,
    "name": "Obadiah",
    "slug": "obadiah",
    "chapters": 1,
    "lastChapterVerses": 21
  },
  {
    "usfm": "JON",
    "ordinal": 32,
    "name": "Jonah",
    "slug": "jonah",
    "chapters": 4,
    "lastChapterVerses": 11
  },
  {
    "usfm": "MIC",
    "ordinal": 33,
    "name": "Micah",
    "slug": "micah",
    "chapters": 7,
    "lastChapterVerses": 20
  },
  {
    "usfm": "NAM",
    "ordinal": 34,
    "name": "Nahum",
    "slug": "nahum",
    "chapters": 3,
    "lastChapterVerses": 19
  },
  {
    "usfm": "HAB",
    "ordinal": 35,
    "name": "Habakkuk",
    "slug": "habakkuk",
    "chapters": 3,
    "lastChapterVerses": 19
  },
  {
    "usfm": "ZEP",
    "ordinal": 36,
    "name": "Zephaniah",
    "slug": "zephaniah",
    "chapters": 3,
    "lastChapterVerses": 20
  },
  {
    "usfm": "HAG",
    "ordinal": 37,
    "name": "Haggai",
    "slug": "haggai",
    "chapters": 2,
    "lastChapterVerses": 23
  },
  {
    "usfm": "ZEC",
    "ordinal": 38,
    "name": "Zechariah",
    "slug": "zechariah",
    "chapters": 14,
    "lastChapterVerses": 21
  },
  {
    "usfm": "MAL",
    "ordinal": 39,
    "name": "Malachi",
    "slug": "malachi",
    "chapters": 4,
    "lastChapterVerses": 6
  },
  {
    "usfm": "MAT",
    "ordinal": 40,
    "name": "Matthew",
    "slug": "matthew",
    "chapters": 28,
    "lastChapterVerses": 20
  },
  {
    "usfm": "MRK",
    "ordinal": 41,
    "name": "Mark",
    "slug": "mark",
    "chapters": 16,
    "lastChapterVerses": 20
  },
  {
    "usfm": "LUK",
    "ordinal": 42,
    "name": "Luke",
    "slug": "luke",
    "chapters": 24,
    "lastChapterVerses": 53
  },
  {
    "usfm": "JHN",
    "ordinal": 43,
    "name": "John",
    "slug": "john",
    "chapters": 21,
    "lastChapterVerses": 25
  },
  {
    "usfm": "ACT",
    "ordinal": 44,
    "name": "Acts",
    "slug": "acts",
    "chapters": 28,
    "lastChapterVerses": 31
  },
  {
    "usfm": "ROM",
    "ordinal": 45,
    "name": "Romans",
    "slug": "romans",
    "chapters": 16,
    "lastChapterVerses": 27
  },
  {
    "usfm": "1CO",
    "ordinal": 46,
    "name": "1 Corinthians",
    "slug": "1corinthians",
    "chapters": 16,
    "lastChapterVerses": 24
  },
  {
    "usfm": "2CO",
    "ordinal": 47,
    "name": "2 Corinthians",
    "slug": "2corinthians",
    "chapters": 13,
    "lastChapterVerses": 14
  },
  {
    "usfm": "GAL",
    "ordinal": 48,
    "name": "Galatians",
    "slug": "galatians",
    "chapters": 6,
    "lastChapterVerses": 18
  },
  {
    "usfm": "EPH",
    "ordinal": 49,
    "name": "Ephesians",
    "slug": "ephesians",
    "chapters": 6,
    "lastChapterVerses": 24
  },
  {
    "usfm": "PHP",
    "ordinal": 50,
    "name": "Philippians",
    "slug": "philippians",
    "chapters": 4,
    "lastChapterVerses": 23
  },
  {
    "usfm": "COL",
    "ordinal": 51,
    "name": "Colossians",
    "slug": "colossians",
    "chapters": 4,
    "lastChapterVerses": 18
  },
  {
    "usfm": "1TH",
    "ordinal": 52,
    "name": "1 Thessalonians",
    "slug": "1thessalonians",
    "chapters": 5,
    "lastChapterVerses": 28
  },
  {
    "usfm": "2TH",
    "ordinal": 53,
    "name": "2 Thessalonians",
    "slug": "2thessalonians",
    "chapters": 3,
    "lastChapterVerses": 18
  },
  {
    "usfm": "1TI",
    "ordinal": 54,
    "name": "1 Timothy",
    "slug": "1timothy",
    "chapters": 6,
    "lastChapterVerses": 21
  },
  {
    "usfm": "2TI",
    "ordinal": 55,
    "name": "2 Timothy",
    "slug": "2timothy",
    "chapters": 4,
    "lastChapterVerses": 22
  },
  {
    "usfm": "TIT",
    "ordinal": 56,
    "name": "Titus",
    "slug": "titus",
    "chapters": 3,
    "lastChapterVerses": 15
  },
  {
    "usfm": "PHM",
    "ordinal": 57,
    "name": "Philemon",
    "slug": "philemon",
    "chapters": 1,
    "lastChapterVerses": 25
  },
  {
    "usfm": "HEB",
    "ordinal": 58,
    "name": "Hebrews",
    "slug": "hebrews",
    "chapters": 13,
    "lastChapterVerses": 25
  },
  {
    "usfm": "JAS",
    "ordinal": 59,
    "name": "James",
    "slug": "james",
    "chapters": 5,
    "lastChapterVerses": 20
  },
  {
    "usfm": "1PE",
    "ordinal": 60,
    "name": "1 Peter",
    "slug": "1peter",
    "chapters": 5,
    "lastChapterVerses": 14
  },
  {
    "usfm": "2PE",
    "ordinal": 61,
    "name": "2 Peter",
    "slug": "2peter",
    "chapters": 3,
    "lastChapterVerses": 18
  },
  {
    "usfm": "1JN",
    "ordinal": 62,
    "name": "1 John",
    "slug": "1john",
    "chapters": 5,
    "lastChapterVerses": 21
  },
  {
    "usfm": "2JN",
    "ordinal": 63,
    "name": "2 John",
    "slug": "2john",
    "chapters": 1,
    "lastChapterVerses": 13
  },
  {
    "usfm": "3JN",
    "ordinal": 64,
    "name": "3 John",
    "slug": "3john",
    "chapters": 1,
    "lastChapterVerses": 14
  },
  {
    "usfm": "JUD",
    "ordinal": 65,
    "name": "Jude",
    "slug": "jude",
    "chapters": 1,
    "lastChapterVerses": 25
  },
  {
    "usfm": "REV",
    "ordinal": 66,
    "name": "Revelation",
    "slug": "revelation",
    "chapters": 22,
    "lastChapterVerses": 21
  }
];

const BY_USFM = new Map(BOOKS.map((book) => [book.usfm, book]));

export function book(usfm: string): BookRow {
  const found = BY_USFM.get(usfm);
  if (found === undefined) throw new Error(`No book ${usfm} in the conformance table`);
  return found;
}
