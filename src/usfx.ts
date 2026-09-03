/**
 * USFX (Unified Scripture Format XML) extractor for the ASV.
 *
 * The format is milestone-based, not container-based: a verse begins at a
 * self-closing `<v id="1" bcv="GEN.1.1" />` and runs until `<ve />`, the next
 * `<v>`, a chapter break, or the end of the book. Every word is additionally
 * wrapped in a `<w s="H8064">` Strong's-number element that must be unwrapped
 * to recover the sentence.
 *
 * Whitespace lives in the source text nodes (`<w>In</w> <w>the</w>`), so element
 * boundaries inject nothing — doing so would put spaces before punctuation.
 */

/** Elements whose entire subtree is discarded. */
const DISCARD = new Set(["x", "xo", "xt", "xk", "xq"]);

/** Elements inside a footnote whose text is the caller/reference, not prose. */
const FOOTNOTE_REF = new Set(["fr", "fk", "fv"]);

export interface Verse {
  readonly bcv: string;
  readonly book: string;
  readonly chapter: number;
  readonly verse: number;
  readonly text: string;
  /** Footnote prose, present on the 16 verses the ASV omits. */
  readonly note: string | null;
}

export interface UsfxDocument {
  readonly verses: readonly Verse[];
  /**
   * `<d>` titles printed *above* a chapter, keyed by "BOOK.CHAPTER" — the
   * superscriptions of the Psalms ("A Psalm of David.").
   */
  readonly titles: ReadonlyMap<string, string>;
  /**
   * `<d>` lines printed *below* a chapter's last verse. USFX marks these with
   * the same element as a superscription, so position is the only thing that
   * separates them: Habakkuk 3 closes with "For the Chief Musician, on my
   * stringed instruments", which belongs after verse 19, not above verse 1.
   */
  readonly subscriptions: ReadonlyMap<string, string>;
  /** Canonical book ids in document order, excluding front/back matter. */
  readonly books: readonly string[];
}

const ENTITIES: ReadonlyMap<string, string> = new Map([
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["amp", "&"],
]);

function decodeEntities(raw: string): string {
  return raw.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return ENTITIES.get(body) ?? match;
  });
}

function attr(attrs: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`).exec(attrs);
  return match === null ? null : match[1] ?? null;
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Non-front-matter books carry a three-letter id in the standard USFM set. */
const NON_SCRIPTURE = new Set(["FRT", "INT", "BAK", "CNC", "GLO", "TDX", "NDX", "OTH"]);

interface MutableVerse {
  bcv: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
  note: string;
}

/**
 * Parses a USFX document into verses and descriptive titles.
 * Throws on structurally invalid verse identifiers rather than skipping them.
 */
export function parseUsfx(xml: string): UsfxDocument {
  const source = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml;

  const verses: MutableVerse[] = [];
  const titles = new Map<string, string>();
  const subscriptions = new Map<string, string>();
  const books: string[] = [];

  let book = "";
  let chapter = 0;
  let versesInChapter = 0;
  let current: MutableVerse | null = null;

  let discardDepth = 0;
  let footnoteDepth = 0;
  let footnoteRefDepth = 0;
  let titleBuffer: string | null = null;
  let titleOpenedAfterVerses = false;

  const tokenizer =
    /<\/?([A-Za-z0-9]+)((?:\s+[A-Za-z0-9:_.-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g;

  let match: RegExpExecArray | null;
  while ((match = tokenizer.exec(source)) !== null) {
    const textRun = match[4];
    if (textRun !== undefined) {
      if (discardDepth > 0 || footnoteRefDepth > 0) continue;
      const decoded = decodeEntities(textRun);
      if (footnoteDepth > 0) {
        if (current !== null) current.note += decoded;
      } else if (titleBuffer !== null) {
        titleBuffer += decoded;
      } else if (current !== null) {
        current.text += decoded;
      }
      continue;
    }

    const name = match[1];
    if (name === undefined) continue;
    const attrs = match[2] ?? "";
    const isClosing = match[0].startsWith("</");
    const isSelfClosing = match[3] === "/";

    if (DISCARD.has(name)) {
      if (isClosing) discardDepth = Math.max(0, discardDepth - 1);
      else if (!isSelfClosing) discardDepth += 1;
      continue;
    }
    if (discardDepth > 0) continue;

    if (name === "f") {
      if (isClosing) footnoteDepth = Math.max(0, footnoteDepth - 1);
      else if (!isSelfClosing) footnoteDepth += 1;
      continue;
    }
    if (FOOTNOTE_REF.has(name)) {
      if (isClosing) footnoteRefDepth = Math.max(0, footnoteRefDepth - 1);
      else if (!isSelfClosing) footnoteRefDepth += 1;
      continue;
    }

    switch (name) {
      case "book": {
        if (!isClosing) {
          const id = attr(attrs, "id");
          book = id ?? "";
          chapter = 0;
          versesInChapter = 0;
          if (book !== "" && !NON_SCRIPTURE.has(book) && !books.includes(book)) {
            books.push(book);
          }
        }
        current = null;
        titleBuffer = null;
        continue;
      }
      case "c": {
        if (!isClosing) {
          const id = attr(attrs, "id");
          const parsed = id === null ? Number.NaN : Number.parseInt(id, 10);
          if (Number.isNaN(parsed)) {
            throw new Error(`Chapter milestone without a numeric id in ${book}`);
          }
          chapter = parsed;
          versesInChapter = 0;
        }
        current = null;
        continue;
      }
      case "d": {
        if (isClosing || isSelfClosing) {
          if (titleBuffer !== null) {
            const title = collapse(titleBuffer);
            if (title !== "") {
              // Position, not markup, decides which it is: a <d> reached before
              // the chapter's first verse heads it; one reached afterwards
              // closes it.
              const target = titleOpenedAfterVerses ? subscriptions : titles;
              target.set(`${book}.${chapter}`, title);
            }
            titleBuffer = null;
          }
        } else {
          current = null;
          titleBuffer = "";
          titleOpenedAfterVerses = versesInChapter > 0;
        }
        continue;
      }
      case "v": {
        if (isClosing) continue;
        const bcv = attr(attrs, "bcv");
        if (bcv === null) continue;
        const parts = bcv.split(".");
        if (parts.length !== 3) {
          throw new Error(`Malformed verse identifier: ${bcv}`);
        }
        const [bookId, chapterText, verseText] = parts as [string, string, string];
        const chapterNumber = Number.parseInt(chapterText, 10);
        const verseNumber = Number.parseInt(verseText, 10);
        if (Number.isNaN(chapterNumber) || Number.isNaN(verseNumber)) {
          throw new Error(`Non-numeric chapter or verse in identifier: ${bcv}`);
        }
        versesInChapter += 1;
        current = {
          bcv,
          book: bookId,
          chapter: chapterNumber,
          verse: verseNumber,
          text: "",
          note: "",
        };
        verses.push(current);
        continue;
      }
      case "ve": {
        current = null;
        continue;
      }
      default:
        // Every other element (w, q, p, add, it, bd, sc, qs, b, ft, fqa …) is
        // transparent: its text belongs to whichever buffer is currently open.
        continue;
    }
  }

  return {
    verses: verses.map((verse) => ({
      bcv: verse.bcv,
      book: verse.book,
      chapter: verse.chapter,
      verse: verse.verse,
      text: collapse(verse.text),
      note: collapse(verse.note) === "" ? null : collapse(verse.note),
    })),
    titles,
    subscriptions,
    books,
  };
}
