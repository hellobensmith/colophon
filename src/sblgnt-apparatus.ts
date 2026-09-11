/**
 * Parser for the SBLGNT's companion critical apparatus — a separate dataset
 * from the text itself (`src/sblgnt.ts`), not a `ScriptureFormat`: its root
 * `<book>` carries no `id` attribute and no BOM, and it isn't Scripture text
 * at all, it's a collation of *printed editions* (WH, Tregelles, NA27/NA28,
 * RP, occasionally NIV, Holmes, TR, SBL, and a handful of named individual
 * conjectures) — no papyri, uncials, minuscules or patristic citations
 * anywhere in it. Say so wherever this is served: a reader who assumes
 * manuscript support and doesn't find it will conclude wrongly that this
 * project doesn't know what an apparatus is.
 *
 * **Structuring, scoped to what's actually verified.** Every one of the
 * 6,934 notes in the real corpus has exactly one `]` — a lemma (what SBLGNT
 * prints) on the left, one or more alternate readings on the right,
 * separated by `;` — and that split is genuinely universal, checked
 * directly against every note. Decomposing each side further into
 * `{text, witnesses}` was attempted and abandoned: real, verified
 * exceptions exist — Matt 11:9/19:17 and John 18:21 are multi-part word-
 * order transpositions sharing one trailing witness list across `;`-joined
 * clauses, Mark 9:38's note cites "Greeven" (a named conjecture not on any
 * previously-catalogued siglum list), Mark 16:8's carries a witness with
 * trailing punctuation (`NIV.`), and John 7:52's note embeds the entire
 * Pericope Adulterae as a quoted reading with no trailing siglum of its own.
 * Shipping a `witnesses: string[]` field that silently mis-splits any of
 * these would misrepresent a scholar's own apparatus entry — exactly what
 * this project's "never guess" rule exists to prevent. `lemma`/`readings`
 * below are therefore plain strings, not further decomposed; `raw` is kept
 * alongside regardless, verbatim.
 */

export interface ApparatusNote {
  /** The note's own text, verbatim, with only its leading verse-number/bullet stripped. */
  readonly raw: string;
  /** Text before the note's one `]` — what SBLGNT actually prints, with its witnesses. */
  readonly lemma: string;
  /** Text after the `]`, split on `;` — the alternate readings, each with its own witnesses. */
  readonly readings: readonly string[];
  /**
   * Set when the note's own leading label names a verse range (e.g. Jude's
   * "22–23", filed only under verse 22) rather than a single verse — 7 in
   * the real corpus. The note is still returned only under the verse it's
   * filed under; this records that it isn't the whole story.
   */
  readonly range: string | null;
}

export class UnknownApparatusNoteError extends Error {
  constructor(readonly note: string) {
    super(`SBLGNT apparatus note has no "]" separator: ${JSON.stringify(note)}`);
    this.name = "UnknownApparatusNoteError";
  }
}

/** Apparatus `<verse>` tags spell out the book name in full, not `<book id>`'s abbreviation. */
const BOOK_NAME_TO_CANON: ReadonlyMap<string, string> = new Map([
  ["Matthew", "MAT"], ["Mark", "MRK"], ["Luke", "LUK"], ["John", "JHN"], ["Acts", "ACT"],
  ["Romans", "ROM"], ["1 Corinthians", "1CO"], ["2 Corinthians", "2CO"], ["Galatians", "GAL"],
  ["Ephesians", "EPH"], ["Philippians", "PHP"], ["Colossians", "COL"], ["1 Thessalonians", "1TH"],
  ["2 Thessalonians", "2TH"], ["1 Timothy", "1TI"], ["2 Timothy", "2TI"], ["Titus", "TIT"],
  ["Philemon", "PHM"], ["Hebrews", "HEB"], ["James", "JAS"], ["1 Peter", "1PE"],
  ["2 Peter", "2PE"], ["1 John", "1JN"], ["2 John", "2JN"], ["3 John", "3JN"], ["Jude", "JUD"],
  ["Revelation", "REV"],
]);

function parseNoteText(text: string): { raw: string; range: string | null } {
  let stripped = text.trim();
  let range: string | null = null;
  if (stripped.startsWith("•")) {
    stripped = stripped.slice(1).trim();
  } else {
    const label = /^([\d–-]+)\s+/.exec(stripped);
    if (label !== null) {
      stripped = stripped.slice(label[0].length);
      if (/[–-]/.test(label[1]!)) range = label[1]!;
    }
  }
  return { raw: stripped, range };
}

function splitNote(raw: string): { lemma: string; readings: readonly string[] } {
  const bracket = raw.indexOf("]");
  if (bracket === -1) throw new UnknownApparatusNoteError(raw);
  const lemma = raw.slice(0, bracket).trim();
  const readings = raw
    .slice(bracket + 1)
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return { lemma, readings };
}

/**
 * Parses one apparatus book file into verse-keyed notes. Pure — the caller
 * supplies the text; nothing here reads a file.
 */
export function parseApparatusBook(xml: string): ReadonlyMap<string, readonly ApparatusNote[]> {
  const notesByVerse = new Map<string, ApparatusNote[]>();
  const tokenRe = /<verse>([^<]*)<\/verse>|<note>([^<]*)<\/note>/g;
  let match: RegExpExecArray | null;
  let currentBcv: string | null = null;

  while ((match = tokenRe.exec(xml)) !== null) {
    const [, verseText, noteText] = match;
    if (verseText !== undefined) {
      const coords = /^(.*?)\s+(\d+):(\d+)$/.exec(verseText.trim());
      if (coords === null) {
        throw new UnknownApparatusNoteError(`unparseable <verse>: ${verseText}`);
      }
      const canon = BOOK_NAME_TO_CANON.get(coords[1]!);
      if (canon === undefined) {
        throw new UnknownApparatusNoteError(`unknown book name in <verse>: ${verseText}`);
      }
      currentBcv = `${canon}.${coords[2]}.${coords[3]}`;
    } else if (noteText !== undefined) {
      if (currentBcv === null) {
        throw new UnknownApparatusNoteError(`<note> before any <verse>: ${noteText}`);
      }
      const { raw, range } = parseNoteText(noteText);
      const { lemma, readings } = splitNote(raw);
      const list = notesByVerse.get(currentBcv) ?? [];
      list.push({ raw, lemma, readings, range });
      notesByVerse.set(currentBcv, list);
    }
  }
  return notesByVerse;
}

/** Merges several books' worth of parsed notes into one lookup — one per corpus, not per book. */
export function mergeApparatus(
  books: readonly ReadonlyMap<string, readonly ApparatusNote[]>[],
): ReadonlyMap<string, readonly ApparatusNote[]> {
  const merged = new Map<string, readonly ApparatusNote[]>();
  for (const book of books) {
    for (const [bcv, notes] of book) {
      if (merged.has(bcv)) {
        throw new Error(`duplicate apparatus verse across books: ${bcv}`);
      }
      merged.set(bcv, notes);
    }
  }
  return merged;
}
