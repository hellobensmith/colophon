/**
 * USFM ingest, producing the same document shape as `src/usfx.ts`.
 *
 * USFX is XML that eBible generates *from* USFM. USFM is what translation teams
 * and publishers actually work in, and what a publisher hands over when asked
 * for their text — so a project whose whole premise is that a copyright holder
 * can run this with their own edition has to read it.
 *
 * The two formats carry the same concepts in different clothes. A marker here
 * plays one of the same roles an element does there, and the same rule applies:
 * **every marker must be classified, or the build stops.** An unclassified
 * marker is how a future edition that wraps the divine name or the words of
 * Jesus would quietly become plain text with every count still correct.
 *
 * Two shapes make USFM harder to read than its XML cousin:
 *
 * - **Verses are milestones with no terminator.** `\v 1` opens a verse and it
 *   runs until the next `\v`, `\c`, `\d` or end of book. Paragraph markers
 *   appear *inside* a verse and do not end it, so a reader that treats every
 *   marker as a boundary loses the second half of most poetry.
 * - **`\d` is both a superscription and a subscription**, exactly as `<d>` is in
 *   USFX, and only position separates them. Habakkuk 3 is the one subscription
 *   in the ASV, printed below verse 19.
 */

import { closeSelahBracket } from "./usfx.ts";
import type { ScriptureDocument, Verse } from "./document.ts";

/** What a marker does with the text that follows it. */
export type MarkerRole =
  /** Wrapper whose text belongs to the surrounding context: `\w`, `\add`. */
  | "transparent"
  /** Structural marker carrying no text of its own: `\v`, `\c`, `\d`. */
  | "milestone"
  /** Paragraph or poetry marker: no text of its own, and does not end a verse. */
  | "paragraph"
  /** Text routed to a verse's note rather than its body. */
  | "footnote"
  /** Footnote caller or reference: apparatus rather than prose, so dropped. */
  | "footnote-reference"
  /** Document-level information dropped from the text: book names, TOC entries. */
  | "metadata"
  /**
   * Inline apparatus with its own `*` closer — `\x`, `\va`, `\vp`, `\fig` —
   * dropped like `"metadata"`, but the sink resumes where it was once the
   * closer is seen, because these can appear *mid-verse*. `"metadata"`
   * markers only ever appear between verses, so finishing the verse there
   * is correct; doing the same here truncated everything after an inline
   * cross-reference.
   */
  | "discard";

const MARKER_ROLES: ReadonlyMap<string, MarkerRole> = new Map([
  // Structure.
  ["id", "metadata"], ["c", "milestone"], ["v", "milestone"], ["d", "milestone"],

  // Paragraph and poetry. These sit inside verses and must not close them.
  ["p", "paragraph"], ["m", "paragraph"], ["nb", "paragraph"], ["b", "paragraph"],
  ["q", "paragraph"], ["q1", "paragraph"], ["q2", "paragraph"], ["q3", "paragraph"],
  ["q4", "paragraph"], ["qr", "paragraph"],
  ["pi", "paragraph"], ["pi1", "paragraph"], ["pi2", "paragraph"],
  ["pc", "paragraph"], ["pm", "paragraph"], ["po", "paragraph"],
  ["li", "paragraph"], ["li1", "paragraph"], ["li2", "paragraph"],
  ["cls", "paragraph"], ["ib", "paragraph"],

  // Text-bearing wrappers. `\w` carries a Strong's number this edition does not
  // otherwise expose; the word itself is ordinary scripture and must survive.
  ["w", "transparent"], ["add", "transparent"], ["qs", "transparent"],
  ["sc", "transparent"], ["it", "transparent"], ["bd", "transparent"],
  ["bdit", "transparent"], ["em", "transparent"], ["no", "transparent"],
  ["nd", "transparent"], ["wj", "transparent"], ["tl", "transparent"],
  ["bk", "transparent"], ["pn", "transparent"], ["qt", "transparent"],
  ["sls", "transparent"], ["ord", "transparent"], ["sup", "transparent"],

  // Footnotes.
  ["f", "footnote"], ["ft", "footnote"], ["fq", "footnote"], ["fqa", "footnote"],
  ["fr", "footnote-reference"], ["fk", "footnote-reference"],
  ["fv", "footnote-reference"], ["fl", "footnote-reference"],

  // Headings and front matter: not scripture, dropped with a ledger entry.
  ["h", "metadata"], ["toc", "metadata"], ["toc1", "metadata"],
  ["toc2", "metadata"], ["toc3", "metadata"], ["toca1", "metadata"],
  ["toca2", "metadata"], ["toca3", "metadata"],
  // \\qc is a centred poetic line. The ASV uses it for the twenty-two Hebrew
  // letter headings of Psalm 119 — "ב BETH." — which are apparatus rather than
  // scripture, and eBible’s own USFX converter emits them outside any verse so
  // they fall out of the text there too. Classified as heading to match, and
  // the characters are recorded in the dropped ledger rather than vanishing.
  //
  // The risk is worth naming: an edition that used \\qc for a genuinely centred
  // line *inside* a verse would lose it. Nothing in the ASV or the DRA does,
  // and the ledger would show the loss, but a third edition should be checked.
  ["qc", "metadata"],
  ["mt", "metadata"], ["mt1", "metadata"], ["mt2", "metadata"],
  ["mt3", "metadata"], ["mt4", "metadata"],
  ["ms", "metadata"], ["ms1", "metadata"], ["ms2", "metadata"],
  ["mr", "metadata"], ["sr", "metadata"], ["r", "metadata"],
  ["s", "metadata"], ["s1", "metadata"], ["s2", "metadata"], ["s3", "metadata"],
  ["is", "metadata"], ["is1", "metadata"], ["is2", "metadata"],
  ["ip", "metadata"], ["im", "metadata"], ["iot", "metadata"],
  ["io", "metadata"], ["io1", "metadata"], ["io2", "metadata"],
  ["ie", "metadata"], ["imt", "metadata"], ["imt1", "metadata"],
  ["ide", "metadata"], ["rem", "metadata"], ["sts", "metadata"],
  ["cl", "metadata"], ["cp", "metadata"], ["ca", "metadata"],
  ["va", "discard"], ["vp", "discard"], ["periph", "metadata"],
  // xo/xt/xk have no closer of their own — they only ever appear already
  // nested inside an open \x...\x*, which has already parked the sink at
  // "drop", so a no-op is correct and needs no state of its own.
  ["x", "discard"], ["xo", "transparent"], ["xt", "transparent"], ["xk", "transparent"],
  ["fig", "discard"], ["ndx", "metadata"],
]);

export class UnknownMarkerError extends Error {
  constructor(readonly marker: string, readonly book: string) {
    super(
      `Unclassified USFM marker \\${marker} in ${book}. Every marker must have a ` +
        `role in MARKER_ROLES: an unclassified one would flatten whatever it ` +
        `wraps into plain text with every count still correct. Decide what it ` +
        `is and record it.`,
    );
    this.name = "UnknownMarkerError";
  }
}

/** Books USFM bundles carry that are not scripture. */
const NON_SCRIPTURE: ReadonlySet<string> = new Set(["FRT", "INT", "BAK", "GLO", "CNC", "TDX", "NDX", "OTH"]);

interface Token {
  readonly marker: string | null;
  readonly text: string;
}

/**
 * Splits a USFM stream into markers and the text following each.
 *
 * Character markers close with a `*` form (`\w ... \w*`); the closer carries no
 * text and only ends the wrapper. Attributes after `|` inside `\w` are metadata
 * about the word, not the word: "In|strong=H8064" is the word "In".
 */
interface Tokenized {
  readonly tokens: readonly Token[];
  /**
   * Count of the one-space marker/content separators consumed by
   * {@link pushText} below (see its own comment). Each is a real source
   * character, but stripping it can leave nothing to push a token for — an
   * opener immediately followed by another marker (`\p \q1`) strips its
   * whole one-character run down to `""`, and no token means nowhere on a
   * token to record it. Counted here instead and added to the ledger's
   * `unattributed` total once, by the caller, rather than per-token.
   */
  readonly strippedSeparators: number;
}

function tokenize(usfm: string): Tokenized {
  const tokens: Token[] = [];
  let strippedSeparators = 0;
  // A marker nested inside another character marker carries a "+" prefix:
  // "[\\+w Selah\\+w*]" is the word Selah inside a bracket run. The prefix says
  // where the marker sits, not what it is, so it is stripped and the marker
  // classified normally.
  const pattern = /\\(\+?)([a-z]+[0-9]*)(\*?)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  /** Whether the previous token was an opening marker, whose space is a separator. */
  let afterOpener = false;

  const pushText = (raw: string) => {
    // USFM separates a marker from its content with a single space. That space
    // is syntax, not text: `\w the|strong="H5892"` is the word "the", and
    // keeping the separator turns `Calah (the same` into `Calah ( the same`.
    // Closing markers take no separator, so this applies to openers only.
    const stripSeparator = afterOpener && raw.startsWith(" ");
    const text = stripSeparator ? raw.slice(1) : raw;
    if (stripSeparator) strippedSeparators += 1;
    afterOpener = false;
    if (text !== "") tokens.push({ marker: null, text });
  };

  while ((match = pattern.exec(usfm)) !== null) {
    if (match.index > cursor) pushText(usfm.slice(cursor, match.index));
    const closing = match[3] === "*";
    const name = match[2]!;
    tokens.push({ marker: closing ? `${name}*` : name, text: "" });
    afterOpener = !closing;
    cursor = pattern.lastIndex;
  }
  if (cursor < usfm.length) pushText(usfm.slice(cursor));
  return { tokens, strippedSeparators };
}

/** Strips a `\w` attribute tail: the word is everything before the first `|`. */
function wordText(raw: string): string {
  const bar = raw.indexOf("|");
  return bar === -1 ? raw : raw.slice(0, bar);
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ");
}

/**
 * `UsfmDocument`/`UsfmVerse` are the same shape every reader produces — see
 * `src/document.ts`. Kept as named aliases because "a USFM verse" is still
 * the clearer thing to say at most of this file's own call sites.
 */
export type UsfmVerse = Verse;
export type UsfmDocument = ScriptureDocument;

interface Mutable {
  bcv: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
  note: string;
}

/**
 * Parses one or more USFM books.
 *
 * Accepts a whole bundle concatenated together, which is what
 * `scripts/sources.ts` produces from a directory of per-book files.
 *
 * Book ids, chapter numbers and verse numbers all arrive as the *text* after
 * their milestone — `\\id GEN - American Standard Version`, `\\v 1 In the
 * beginning` — so the reader carries an `expecting` state rather than peeking
 * forward at every marker.
 */
export function parseUsfm(usfm: string): UsfmDocument {
  const verses: UsfmVerse[] = [];
  const titles = new Map<string, string>();
  const subscriptions = new Map<string, string>();
  const books: string[] = [];
  const dropped = new Map<string, number>();

  const drop = (key: string, length: number) => {
    if (length > 0) dropped.set(key, (dropped.get(key) ?? 0) + length);
  };

  // Ledger counters, matching usfx.ts's rigor: every source character is
  // either emitted somewhere or dropped somewhere, and the totals must
  // agree. USFM has no nested-element stack the way XML does — a marker's
  // text isn't wrapped inside it the way `<w>text</w>` is — so buckets are
  // keyed by destination rather than by carrying element; `dropped` keeps
  // its existing, more specific keys unchanged.
  const toVerses = new Map<string, number>();
  const toTitles = new Map<string, number>();
  const toSubscriptions = new Map<string, number>();
  const toNotes = new Map<string, number>();
  let unattributed = 0;
  let sourceCharacters = 0;

  const record = (bucket: Map<string, number>, key: string, length: number): void => {
    if (length > 0) bucket.set(key, (bucket.get(key) ?? 0) + length);
  };

  let book = "";
  let chapter = 0;
  let current: Mutable | null = null;
  let sink: "verse" | "title" | "note" | "drop" = "drop";
  let dropKey = "front-matter";
  /** What to restore `sink` to when a `"discard"` span closes. */
  let savedSink: "verse" | "title" | "note" | "drop" | null = null;
  let pending: { chapter: number; text: string; length: number } | null = null;
  let expecting: "book-id" | "chapter-number" | "verse-number" | null = null;
  let skipBook = false;
  /*
   * The ASV writes Selah as "\qs [Selah\qs*" — an opening bracket the source
   * never closes. Buffering the run lets the same repair usfx.ts applies run
   * here, and sharing that function keeps the rule in one place: it is confined
   * to \qs on purpose, because the brackets around John 7:53-8:11 legitimately
   * span thirteen verses and must not be "fixed".
   */
  let selah: string | null = null;

  const finish = (verse: Mutable | null) => {
    if (verse === null) return;
    const text = collapse(verse.text).trim();
    const note = collapse(verse.note).trim();
    verses.push({
      bcv: verse.bcv,
      book: verse.book,
      chapter: verse.chapter,
      verse: verse.verse,
      text,
      note: note === "" ? null : note,
    });
  };

  const settlePending = (followedByVerse: boolean) => {
    if (pending === null) return;
    // Which map this text belongs to is only known now — whether a verse
    // follows the \d decides title vs. subscription — so the characters
    // accumulated while pending was open are recorded here, at close time,
    // rather than in the case "title" branch where they were consumed. This
    // still records them even if the trimmed text below turns out empty:
    // the ledger tracks where text was semantically routed, not only what
    // ended up in a populated map, matching usfx.ts's own convention.
    if (followedByVerse) record(toTitles, "(title)", pending.length);
    else record(toSubscriptions, "(subscription)", pending.length);
    const text = collapse(pending.text).trim();
    if (text !== "" && !skipBook) {
      const key = `${book}.${pending.chapter}`;
      if (followedByVerse) titles.set(key, text);
      else subscriptions.set(key, text);
    }
    pending = null;
  };

  const { tokens, strippedSeparators } = tokenize(usfm);
  // The marker/content separator space tokenize() strips is real source text
  // with no token to attach a count to (see Tokenized's own comment) — a
  // structural syntax character, not carried by any marker, so it joins
  // usfx.ts's own "whitespace between elements" bucket.
  sourceCharacters += strippedSeparators;
  unattributed += strippedSeparators;

  for (const token of tokens) {
    if (token.marker === null) {
      // Counted once, unconditionally, before any routing decision below —
      // so every text token lands in exactly one bucket and the balance
      // invariant holds by construction rather than by later reconciliation.
      sourceCharacters += token.text.length;

      if (expecting === "book-id") {
        const id = token.text.trim().split(/\s+/)[0] ?? "";
        book = id;
        skipBook = NON_SCRIPTURE.has(id);
        if (!skipBook && id !== "" && !books.includes(id)) books.push(id);
        chapter = 0;
        expecting = null;
        // The whole \id line — the id itself, its surrounding whitespace,
        // and any trailing furniture — is bookkeeping only, never stored as
        // output text, so the full token is dropped rather than just the
        // reconstructed remainder after the id.
        drop("id", token.text.length);
        continue;
      }
      if (expecting === "chapter-number") {
        const trimmed = token.text.trim();
        const number = Number.parseInt(trimmed, 10);
        if (Number.isNaN(number)) throw new Error(`Malformed chapter marker in ${book}: "${trimmed}"`);
        chapter = number;
        expecting = null;
        // Same reasoning as \id above: the chapter number is bookkeeping
        // only, so the whole token — number, whitespace, and any trailing
        // newline — is dropped as one span rather than reconstructed piece
        // by piece.
        drop("chapter-number", token.text.length);
        continue;
      }
      if (expecting === "verse-number") {
        const match = token.text.match(/^\s*([0-9]+[a-z]?(?:-[0-9]+[a-z]?)?)\s?/);
        if (match === null) throw new Error(`Malformed verse marker in ${book} ${chapter}`);
        const number = Number.parseInt(match[1]!, 10);
        finish(current);
        current = {
          bcv: `${book}.${chapter}.${number}`,
          book,
          chapter,
          verse: number,
          text: "",
          note: "",
        };
        drop("verse-number", match[0].length);
        expecting = null;
        sink = "verse";
        // The remainder of this token is real verse text — everything from
        // "1 In the beginning" after the "1 " above — so it gets the same
        // word/attribute split as ordinary verse-sink text.
        const tail = token.text.slice(match[0].length);
        const word = wordTextAware(tail);
        current.text += word;
        record(toVerses, "(verse)", word.length);
        drop("word-attribute", tail.length - word.length);
        continue;
      }

      if (skipBook) {
        drop("front-matter", token.text.length);
        continue;
      }
      switch (sink) {
        case "verse": {
          // `\w the|strong="H5892"` is the word "the": the `|strong=...` tail
          // is consumed from source but never stored, so it is accounted
          // here rather than silently vanishing from the ledger.
          const word = wordTextAware(token.text);
          if (selah !== null) {
            selah += word;
            record(toVerses, "(verse)", word.length);
          } else if (current !== null) {
            current.text += word;
            record(toVerses, "(verse)", word.length);
          } else {
            drop("stray", token.text.length);
            break;
          }
          drop("word-attribute", token.text.length - word.length);
          break;
        }
        case "title": {
          if (pending !== null) {
            const word = wordTextAware(token.text);
            pending.text += word;
            pending.length += word.length;
            drop("word-attribute", token.text.length - word.length);
          } else {
            // Unreachable in well-formed input — sink is only ever set to
            // "title" in the same statement that opens `pending` (the \d
            // handling below) — but kept as a defensive, ledger-honest
            // fallback rather than a silent loss if that ever changes.
            drop("stray-title", token.text.length);
          }
          break;
        }
        case "note":
          // No wordTextAware split here, deliberately: a \w inside a
          // footnote would leak its |strong=... tail into stored note text
          // today, unlike the verse/title cases above. Pre-existing, not
          // introduced by this ledger work — noted, not silently fixed,
          // since fixing it changes footnote content rather than accounting
          // for it.
          if (current !== null) {
            current.note += token.text;
            record(toNotes, "(note)", token.text.length);
          } else {
            drop("stray-note", token.text.length);
          }
          break;
        case "drop":
          drop(dropKey, token.text.length);
          break;
      }
      continue;
    }

    if (token.marker.endsWith("*")) {
      const opener = token.marker.slice(0, -1);
      const openerRole = MARKER_ROLES.get(opener);
      if (openerRole === undefined) throw new UnknownMarkerError(opener, book);
      if (opener === "f") sink = current === null ? "drop" : "verse";
      if (openerRole === "discard") {
        // Falls back to the same formula \f* uses, for the case a discard
        // marker somehow opens with no prior sink recorded — defensive,
        // not expected to fire since every "discard" opener sets savedSink.
        sink = savedSink ?? (current === null ? "drop" : "verse");
        savedSink = null;
      }
      if (opener === "qs" && selah !== null) {
        const balanced = closeSelahBracket(collapse(selah));
        if (current !== null) current.text += balanced;
        selah = null;
      }
      continue;
    }

    const role = MARKER_ROLES.get(token.marker);
    if (role === undefined) throw new UnknownMarkerError(token.marker, book);

    if (token.marker === "id") {
      settlePending(false);
      finish(current);
      current = null;
      expecting = "book-id";
      sink = "drop";
      dropKey = "id";
      continue;
    }
    if (token.marker === "c") {
      settlePending(false);
      finish(current);
      current = null;
      expecting = "chapter-number";
      sink = "drop";
      dropKey = "chapter-number";
      continue;
    }
    if (token.marker === "v") {
      settlePending(true);
      expecting = "verse-number";
      continue;
    }
    if (token.marker === "d") {
      settlePending(false);
      finish(current);
      current = null;
      pending = { chapter, text: "", length: 0 };
      sink = "title";
      continue;
    }

    if (token.marker === "qs" && sink === "verse" && current !== null) {
      selah = "";
      continue;
    }

    switch (role) {
      case "transparent":
        break;
      case "paragraph":
        if (sink === "verse" && current !== null) current.text += " ";
        else if (sink === "title" && pending !== null) pending.text += " ";
        break;
      case "footnote":
        if (token.marker === "f") {
          // "\\f + \\ft ..." — the text between \\f and the first content marker
          // is the caller, "+" meaning auto-generate. It is apparatus, not
          // prose, and usfx.ts drops it too.
          sink = "drop";
          dropKey = "footnote-caller";
        } else {
          sink = current === null ? "drop" : "note";
        }
        break;
      case "footnote-reference":
        sink = "drop";
        dropKey = token.marker;
        break;
      case "metadata":
        settlePending(false);
        finish(current);
        current = null;
        sink = "drop";
        dropKey = token.marker;
        break;
      case "discard":
        // Unlike "metadata", these can appear mid-verse — \x, \va, \vp,
        // \fig each close with their own \*, so the verse being built is
        // left alone rather than finished, and the sink resumes on close.
        savedSink = sink;
        sink = "drop";
        dropKey = token.marker;
        break;
      case "milestone":
        break;
    }
  }
  finish(current);
  settlePending(false);

  return {
    verses,
    titles,
    subscriptions,
    books,
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

/** `\w` attributes travel in the text node; the word is everything before `|`. */
function wordTextAware(text: string): string {
  return text.includes("|") ? wordText(text) : text;
}
