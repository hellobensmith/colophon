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

/**
 * How each source element is treated. Every element the parser meets must appear
 * here; anything else stops the build (see {@link UnknownElementError}).
 *
 * The point is not documentation. eBible republishes this archive periodically,
 * and an edition that introduced `<wj>` or `<nd>` would otherwise be absorbed in
 * silence — the words of Jesus or the divine name quietly becoming plain text,
 * with every count still correct and every test still green. Failing loudly is
 * the only way that change is visible.
 */
export type ElementRole =
  /** Wrapper whose text belongs to the surrounding context: `<w>`, `<q>`, `<p>`. */
  | "transparent"
  /** Structural marker carrying no text of its own: `<v>`, `<ve>`, `<c>`. */
  | "milestone"
  /** Text routed to a verse's note rather than its body. */
  | "footnote"
  /** Footnote caller or reference: dropped, being apparatus rather than prose. */
  | "footnote-reference"
  /** Element whose entire subtree is dropped. */
  | "discard"
  /** Document-level information dropped from the text: book names, TOC entries. */
  | "metadata";

const ELEMENT_ROLES: ReadonlyMap<string, ElementRole> = new Map([
  // Document structure.
  ["usfx", "milestone"], ["book", "milestone"], ["c", "milestone"],
  ["v", "milestone"], ["ve", "milestone"], ["d", "milestone"],
  ["b", "milestone"],

  // Text-bearing wrappers. `<w>` carries a Strong's number this edition does not
  // otherwise expose; its text is ordinary scripture and must survive.
  ["w", "transparent"], ["q", "transparent"], ["p", "transparent"],
  ["add", "transparent"], ["qs", "transparent"], ["sc", "transparent"],
  ["it", "transparent"], ["bd", "transparent"], ["bdit", "transparent"],
  ["em", "transparent"], ["no", "transparent"], ["ord", "transparent"],
  ["sup", "transparent"], ["pn", "transparent"], ["k", "transparent"],
  ["tl", "transparent"], ["bk", "transparent"], ["sls", "transparent"],
  ["qt", "transparent"], ["nd", "transparent"], ["wj", "transparent"],

  // Footnotes.
  ["f", "footnote"], ["ft", "footnote"], ["fqa", "footnote"], ["fq", "footnote"],
  ["fr", "footnote-reference"], ["fk", "footnote-reference"],
  ["fv", "footnote-reference"], ["fl", "footnote-reference"],

  // Cross-references: captured nowhere in v1, so dropped with their subtree.
  ["x", "discard"], ["xo", "discard"], ["xt", "discard"],
  ["xk", "discard"], ["xq", "discard"],

  // Document metadata that is not scripture.
  ["id", "metadata"], ["ide", "metadata"], ["h", "metadata"],
  ["toc", "metadata"], ["rem", "metadata"], ["languageCode", "metadata"],
  ["cl", "metadata"], ["cp", "metadata"], ["ca", "metadata"],
  ["va", "metadata"], ["vp", "metadata"], ["periph", "metadata"],
  ["generated", "metadata"], ["s", "metadata"], ["ms", "metadata"],
  ["mt", "metadata"], ["fig", "metadata"], ["ndx", "metadata"],
]);

/** Elements whose entire subtree is discarded. */
const DISCARD: ReadonlySet<string> = new Set(
  [...ELEMENT_ROLES].filter(([, role]) => role === "discard").map(([name]) => name),
);

/** Elements inside a footnote whose text is the caller/reference, not prose. */
const FOOTNOTE_REF: ReadonlySet<string> = new Set(
  [...ELEMENT_ROLES].filter(([, role]) => role === "footnote-reference").map(([name]) => name),
);

/** Elements whose text is dropped as document metadata. */
const METADATA: ReadonlySet<string> = new Set(
  [...ELEMENT_ROLES].filter(([, role]) => role === "metadata").map(([name]) => name),
);

/**
 * Raised when the source contains an element with no declared role. Carries
 * enough context to classify it rather than merely reporting that it exists.
 */
export class UnknownElementError extends Error {
  constructor(
    readonly element: string,
    readonly location: string,
    readonly sample: string,
  ) {
    super(
      `Unclassified source element <${element}> near ${location}. ` +
        `Add it to ELEMENT_ROLES in src/usfx.ts with an explicit role before ingesting. ` +
        `Sample: ${sample}`,
    );
    this.name = "UnknownElementError";
  }
}

/**
 * Closes a bracket this edition opens and never shuts.
 *
 * Every `<qs>` marker in the file reads `[Selah` — 78 opening brackets against
 * four closing ones, and none of those four belong to a Selah. Left alone the
 * text renders "...no help for him in God. [Selah", which reads as a defect.
 *
 * The repair is confined to `<qs>` on purpose. The ASV also brackets the
 * passage at John 7:53-8:11 to mark its disputed manuscript standing, and that
 * bracket legitimately opens in one verse and closes thirteen verses later. A
 * parser that balanced brackets per verse would corrupt real textual apparatus
 * to fix a markup artifact.
 */
export function closeSelahBracket(text: string): string {
  const opens = (text.match(/\[/g) ?? []).length;
  const closes = (text.match(/\]/g) ?? []).length;
  return opens > closes ? `${text}${"]".repeat(opens - closes)}` : text;
}

import type { ScriptureDocument } from "./document.ts";

export type { Verse, CoverageLedger } from "./document.ts";

/**
 * `UsfxDocument` is the same shape every reader produces — see
 * `src/document.ts`. Kept as a named alias here because "a USFX document" is
 * still the clearer thing to say at most of this file's own call sites.
 */
export type UsfxDocument = ScriptureDocument;

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
  let selahBuffer: string | null = null;
  let metadataDepth = 0;

  // Ledger counters. `elementStack` names the element that actually carried a
  // run of text, so a leak reports its source rather than merely its size.
  const elementStack: string[] = [];
  const toVerses = new Map<string, number>();
  const toTitles = new Map<string, number>();
  const toSubscriptions = new Map<string, number>();
  const toNotes = new Map<string, number>();
  const dropped = new Map<string, number>();
  let unattributed = 0;
  let sourceCharacters = 0;

  const record = (bucket: Map<string, number>, length: number): void => {
    const element = elementStack[elementStack.length - 1] ?? "(root)";
    bucket.set(element, (bucket.get(element) ?? 0) + length);
  };

  const tokenizer =
    /<\/?([A-Za-z0-9]+)((?:\s+[A-Za-z0-9:_.-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g;

  let match: RegExpExecArray | null;
  while ((match = tokenizer.exec(source)) !== null) {
    const textRun = match[4];
    if (textRun !== undefined) {
      sourceCharacters += textRun.length;
      if (discardDepth > 0 || footnoteRefDepth > 0 || metadataDepth > 0) {
        record(dropped, textRun.length);
        continue;
      }
      const decoded = decodeEntities(textRun);
      if (footnoteDepth > 0) {
        if (current !== null) {
          current.note += decoded;
          record(toNotes, textRun.length);
        } else {
          record(dropped, textRun.length);
        }
      } else if (selahBuffer !== null) {
        selahBuffer += decoded;
        record(toVerses, textRun.length);
      } else if (titleBuffer !== null) {
        titleBuffer += decoded;
        record(titleOpenedAfterVerses ? toSubscriptions : toTitles, textRun.length);
      } else if (current !== null) {
        current.text += decoded;
        record(toVerses, textRun.length);
      } else {
        // Whitespace between books and chapters, and the newline after every
        // closing tag. Counted so the arithmetic still balances.
        unattributed += textRun.length;
      }
      continue;
    }

    const name = match[1];
    if (name === undefined) continue;
    const attrs = match[2] ?? "";
    const isClosing = match[0].startsWith("</");
    const isSelfClosing = match[3] === "/";

    if (!ELEMENT_ROLES.has(name)) {
      const at = book === "" ? "the document preamble" : `${book} ${chapter}`;
      throw new UnknownElementError(name, at, source.slice(match.index, match.index + 120));
    }

    if (isClosing) elementStack.pop();
    else if (!isSelfClosing) elementStack.push(name);

    if (METADATA.has(name)) {
      if (isClosing) metadataDepth = Math.max(0, metadataDepth - 1);
      else if (!isSelfClosing) metadataDepth += 1;
      continue;
    }

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
      case "qs": {
        if (isClosing) {
          if (selahBuffer !== null) {
            const marker = closeSelahBracket(collapse(selahBuffer));
            if (current !== null) current.text += marker;
            selahBuffer = null;
          }
        } else if (!isSelfClosing) {
          selahBuffer = "";
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
    interpolations: new Map(),
    format: "usfx",
    ledger: {
      toVerses,
      toTitles,
      toSubscriptions,
      toNotes,
      dropped,
      unattributed,
      sourceCharacters,
    },
  };
}
