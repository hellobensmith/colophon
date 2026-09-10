/**
 * USX ingest, producing the same document shape as `src/usfm.ts` and
 * `src/usfx.ts`.
 *
 * USX is the XML the Digital Bible Library ships, and what a publisher exports
 * when packaging a text for distribution rather than for editing. It carries
 * the USFM marker name in a `style` attribute, so `<para style="q1">` is `\q1`
 * and `<char style="w">` is `\w` — which means the classification problem is
 * the same one, and `src/usx-styles.ts` answers it from the schema.
 *
 * It is in one way easier than either cousin: USX 3 closes verses and chapters
 * explicitly, with `<verse eid="GEN 1:1"/>`, so a reader does not have to infer
 * where a verse ends. Both are still milestones — `<verse sid=…/>` marks a
 * start and the text follows as a sibling, exactly the trap CLAUDE.md records
 * for USFX, where a DOM reading of `<v>` returns empty strings for all 31,102
 * verses.
 *
 * **Confidence.** The USFM reader was validated against a corpus this project
 * already serves: parse the ASV's USFM and it reproduces the USFX-derived text
 * character for character. No such reference exists for USX — eBible publishes
 * none, and the schema repository ships no samples — so this reader is tested
 * structurally, against fixtures built from the schema, and not yet against a
 * real bundle. The first publisher bundle that arrives should be diffed the way
 * the USFM one was before anything built from it is published.
 */

import { closeSelahBracket } from "./usfx.ts";
import { UnknownMarkerError, type UsfmDocument, type UsfmVerse } from "./usfm.ts";
import { USX_STYLE_ROLES } from "./usx-styles.ts";

/** Where a run of text is routed. */
type Sink = "verse" | "title" | "note" | "drop";

interface Tag {
  readonly name: string;
  readonly attrs: string;
  readonly closing: boolean;
  readonly selfClosing: boolean;
}

/** Elements USX defines. Anything else stops the build, as an unknown style would. */
const ELEMENTS: ReadonlySet<string> = new Set([
  "usx", "book", "chapter", "verse", "para", "char", "note", "table", "row",
  "cell", "sidebar", "periph", "figure", "optbreak", "ms", "ref",
]);

/** Book codes that are front or back matter rather than scripture. */
const NON_SCRIPTURE: ReadonlySet<string> = new Set([
  "FRT", "INT", "BAK", "GLO", "CNC", "TDX", "NDX", "OTH",
]);

function attr(attrs: string, name: string): string | null {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`));
  return match === null ? null : match[1]!;
}

const ENTITIES: ReadonlyMap<string, string> = new Map([
  ["lt", "<"], ["gt", ">"], ["quot", '"'], ["apos", "'"], ["amp", "&"],
]);

function decode(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    }
    if (body.startsWith("#")) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    return ENTITIES.get(body) ?? whole;
  });
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ");
}

/**
 * Parses a USX document, or several concatenated together.
 *
 * `scripts/sources.ts` joins a directory of per-book files into one stream, so
 * multiple `<usx>` roots in sequence are normal and not an error.
 */
export function parseUsx(xml: string): UsfmDocument {
  const verses: UsfmVerse[] = [];
  const titles = new Map<string, string>();
  const subscriptions = new Map<string, string>();
  const books: string[] = [];
  const dropped = new Map<string, number>();

  // Ledger counters, matching usfx.ts's rigor: every source character is
  // either emitted somewhere or dropped somewhere, and the totals must
  // agree. Keyed by the innermost open element's style (or tag name where a
  // style attribute doesn't apply), the same idea as usfx.ts's elementStack
  // — usx.ts already tracks that as `stack` for role bookkeeping, so this
  // reuses it rather than adding new state.
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
  let skipBook = false;

  let current: { bcv: string; book: string; chapter: number; verse: number; text: string; note: string } | null = null;
  let pending: { chapter: number; text: string; length: number } | null = null;
  let selah: string | null = null;
  let dropKey = "outside-verse";

  /*
   * Routing is computed from state rather than saved and restored per element.
   *
   * Saving the sink on every open and restoring it on every close looks tidy
   * and is wrong: a verse runs *across* paragraph boundaries, so restoring at
   * </para> ends a verse that is still open and the second half of every poetry
   * line disappears. Depth counters say what is currently true instead, which
   * is the same shape usfx.ts uses.
   */
  let noteDepth = 0;
  let metadataDepth = 0;
  const stack: { name: string; style: string; role: string }[] = [];

  /** The innermost open element's style (or tag name, absent a style) — how a ledger leak reports its source. */
  const currentKey = (): string => {
    const top = stack[stack.length - 1];
    return top === undefined ? "(root)" : top.style || top.name;
  };

  const sinkNow = (): Sink => {
    if (noteDepth > 0) return current === null ? "drop" : "note";
    if (pending !== null) return "title";
    if (metadataDepth > 0) return "drop";
    return current === null ? "drop" : "verse";
  };

  const drop = (key: string, length: number) => {
    if (length > 0) dropped.set(key, (dropped.get(key) ?? 0) + length);
  };

  const finish = () => {
    if (current === null) return;
    const text = collapse(current.text).trim();
    const note = collapse(current.note).trim();
    verses.push({
      bcv: current.bcv,
      book: current.book,
      chapter: current.chapter,
      verse: current.verse,
      text,
      note: note === "" ? null : note,
    });
    current = null;
  };

  /** A `<para style="d">` is a superscription if a verse follows, else a subscription. */
  const settlePending = (followedByVerse: boolean) => {
    if (pending === null) return;
    // Which map this text belongs to is only known now, exactly as in
    // usfm.ts's settlePending — recorded here even if the trimmed text below
    // turns out empty, since the ledger tracks where text was semantically
    // routed, not only what ended up in a populated map.
    if (followedByVerse) record(toTitles, currentKey(), pending.length);
    else record(toSubscriptions, currentKey(), pending.length);
    const text = collapse(pending.text).trim();
    if (text !== "" && !skipBook) {
      const key = `${book}.${pending.chapter}`;
      if (followedByVerse) titles.set(key, text);
      else subscriptions.set(key, text);
    }
    pending = null;
  };

  const emit = (raw: string) => {
    // Counted once, unconditionally, before any routing decision — every
    // source run lands in exactly one bucket, so the balance invariant holds
    // by construction. Raw, pre-decode length: an entity like `&amp;` is 5
    // source characters even though the decoded text stored below is 1 —
    // matching usfx.ts's own convention of counting what was consumed from
    // source, not what ended up stored.
    sourceCharacters += raw.length;
    const text = decode(raw);
    if (skipBook) {
      drop("front-matter", raw.length);
      return;
    }
    switch (sinkNow()) {
      case "verse":
        if (selah !== null) {
          selah += text;
          record(toVerses, currentKey(), raw.length);
        } else if (current !== null) {
          current.text += text;
          record(toVerses, currentKey(), raw.length);
        } else {
          drop("outside-verse", raw.length);
        }
        break;
      case "title":
        if (pending !== null) {
          pending.text += text;
          pending.length += raw.length;
        } else {
          // Unreachable in well-formed input — sinkNow() only returns
          // "title" while `pending` is open — but kept as a defensive,
          // ledger-honest fallback rather than a silent loss.
          drop("stray-title", raw.length);
        }
        break;
      case "note":
        if (current !== null) {
          current.note += text;
          record(toNotes, currentKey(), raw.length);
        } else {
          drop("stray-note", raw.length);
        }
        break;
      case "drop":
        drop(dropKey, raw.length);
        break;
    }
  };

  const pattern = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s[^>]*?)?)(\/?)>/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(xml)) !== null) {
    if (match.index > cursor) emit(xml.slice(cursor, match.index));
    cursor = pattern.lastIndex;

    const tag: Tag = {
      closing: match[1] === "/",
      name: match[2]!,
      attrs: match[3] ?? "",
      selfClosing: match[4] === "/",
    };

    if (tag.name === "usx" || tag.name === "optbreak" || tag.name === "ms" || tag.name === "ref") {
      continue;
    }
    if (!ELEMENTS.has(tag.name)) {
      throw new UnknownMarkerError(tag.name, book);
    }

    if (tag.name === "book") {
      if (tag.closing) continue;
      settlePending(false);
      finish();
      chapter = 0;
      book = attr(tag.attrs, "code") ?? "";
      skipBook = NON_SCRIPTURE.has(book);
      if (!skipBook && book !== "" && !books.includes(book)) books.push(book);
      dropKey = "id";
      continue;
    }

    if (tag.name === "chapter") {
      // A chapter end carries only an eid.
      if (attr(tag.attrs, "eid") !== null) {
        settlePending(false);
        finish();
        continue;
      }
      settlePending(false);
      finish();
      const number = Number.parseInt(attr(tag.attrs, "number") ?? "", 10);
      if (Number.isNaN(number)) throw new Error(`Malformed chapter in ${book}: ${tag.attrs}`);
      chapter = number;
      dropKey = "chapter-number";
      continue;
    }

    if (tag.name === "verse") {
      if (attr(tag.attrs, "eid") !== null) {
        finish();
        dropKey = "between-verses";
        continue;
      }
      settlePending(true);
      finish();
      const raw = attr(tag.attrs, "number") ?? "";
      const number = Number.parseInt(raw, 10);
      if (Number.isNaN(number)) throw new Error(`Malformed verse in ${book} ${chapter}: ${raw}`);
      current = {
        bcv: `${book}.${chapter}.${number}`,
        book,
        chapter,
        verse: number,
        text: "",
        note: "",
      };
      continue;
    }

    const style = attr(tag.attrs, "style") ?? "";

    if (tag.closing) {
      const opened = stack.pop();
      if (opened === undefined) continue;
      if (opened.name === "char" && opened.style === "qs" && selah !== null) {
        const balanced = closeSelahBracket(collapse(selah));
        if (current !== null) current.text += balanced;
        selah = null;
      }
      if (opened.name === "note" || opened.role === "footnote") noteDepth -= 1;
      else if (opened.role === "metadata" || opened.role === "footnote-reference") {
        metadataDepth -= 1;
      }
      // A descriptive title stays unsettled here on purpose: whether it is a
      // superscription or a subscription depends on whether a verse follows,
      // which is only known at the next <verse> or at the end of the chapter.
      continue;
    }

    const role = USX_STYLE_ROLES.get(style);
    if (role === undefined) throw new UnknownMarkerError(style || tag.name, book);

    if (tag.name === "para" && style === "d") {
      settlePending(false);
      finish();
      pending = { chapter, text: "", length: 0 };
    } else if (tag.name === "note") {
      noteDepth += 1;
      dropKey = "note";
    } else if (tag.name === "char" && style === "qs" && sinkNow() === "verse") {
      selah = "";
    } else {
      switch (role) {
        case "metadata":
          settlePending(false);
          metadataDepth += 1;
          dropKey = style || tag.name;
          break;
        case "footnote":
          noteDepth += 1;
          break;
        case "footnote-reference":
          metadataDepth += 1;
          dropKey = style;
          break;
        case "paragraph":
          // A paragraph break inside a verse is a line break, not a boundary.
          if (sinkNow() === "verse" && current !== null) current.text += " ";
          break;
        case "transparent":
        case "milestone":
          break;
      }
    }

    if (!tag.selfClosing) {
      stack.push({ name: tag.name, style, role });
    } else if (tag.name === "note" || role === "footnote") {
      noteDepth -= 1;
    } else if (role === "metadata" || role === "footnote-reference") {
      metadataDepth -= 1;
    }
  }
  if (cursor < xml.length) emit(xml.slice(cursor));

  finish();
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
