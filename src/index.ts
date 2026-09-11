/**
 * Canon-aware Bible API for the American Standard Version (1901).
 *
 * The whole corpus is embedded in the Worker, so no request performs I/O.
 * openapi.yaml is the source of truth for every response shape below.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import {
  BOOKS,
  CANON_ORDER,
  canonPositions,
  isTradition,
  type Tradition,
} from "./canon.ts";
import {
  ParseError,
  parseReference,
  chapterCount,
  verseCount,
  dataAvailabilityOf,
  type ParseErrorKind,
} from "./parser.ts";
import {
  descriptiveTitle,
  subscription,
  verseAt,
  verseByReference,
  totalVersesOf,
  identityOf,
  type CorpusVerse,
} from "./corpus.ts";
import {
  search,
  countQueryTerms,
  MAX_QUERY_TERMS,
  SEARCHABLE_TRANSLATIONS,
} from "./search.ts";
import { apparatusFor, APPARATUS_TRANSLATIONS } from "./apparatus.ts";
import { DEMO_HTML } from "./demo.ts";
import {
  DEFAULT_TRANSLATION,
  resolveTranslation,
  TRANSLATIONS,
  TRANSLATION_IDS,
  UnknownTranslationError,
} from "./translations.ts";
import { TITLED_PSALMS } from "./data/asv/meta.ts";
import { OPENAPI } from "./openapi.ts";



/** Longest passage served in one response. */
const MAX_PASSAGE_VERSES = 500;
const MAX_SEARCH_LIMIT = 100;
/**
 * Longest apparatus response, counted in notes rather than verses: a legal
 * verse range that stays well under MAX_PASSAGE_VERSES can still carry far
 * more notes than verses (a busy chapter can average several notes per
 * verse), so the two limits guard different things and neither substitutes
 * for the other.
 */
const MAX_APPARATUS_NOTES = 2000;

/**
 * Longest input accepted for a reference or a query.
 *
 * Defence in depth rather than a limit anyone will meet: the parser and the
 * search path bound their own work, and this simply stops the pathological
 * cases before either is entered. The longest real citation is well under this.
 */
const MAX_INPUT_LENGTH = 512;
const DEFAULT_SEARCH_LIMIT = 20;
const MIN_QUERY_LENGTH = 2;

/**
 * Verse data changes only when the corpus is rebuilt, so it *wants* to be
 * immutable — but a year of `immutable` was justified by a mechanism that does
 * not exist.
 *
 * README and docs/STATE.md both claimed a deploy invalidates the platform
 * cache, "which is what makes the immutable header safe". Measured 7 September
 * 2026: it does not. A response cached before a deploy was still being served
 * afterwards, from a Worker version no longer deployed, while a cache-busted
 * request to the same path returned the new answer. With `immutable` and a year
 * of `max-age`, a corrected verse or a fixed footnote could stay masked for
 * that year, and the caller would have no reason to revalidate.
 *
 * A day is the compromise: still cheap — one invocation per URL per day, and
 * the measured hit rate was 7 of 8 within seconds — but a correction now
 * propagates on its own. Every response still carries `x-generation-id`, so a
 * caller holding a stale copy can always tell which build it came from.
 *
 * Raising this again means first making a deploy actually purge, which
 * workers.dev has no zone to do, or moving the generation id into the URL.
 */
const VERSE_DATA = "public, max-age=86400";
const DAILY = "public, max-age=86400";
const BRIEF = "public, max-age=60";

/**
 * The translation this request is about.
 *
 * Every endpoint that returns text or metadata resolves this from
 * `?translation=`, defaulting to the ASV so existing callers are unaffected.
 * An unknown id is a 404, not a silent fallback: a caller asking for a text
 * this deployment does not hold must be told, not handed a different Bible.
 */
function translationOf(context: { req: { query: (name: string) => string | undefined } }) {
  try {
    return resolveTranslation(context.req.query("translation"));
  } catch (error) {
    if (error instanceof UnknownTranslationError) {
      throw new HttpError(404, "not_found", error.message);
    }
    throw error;
  }
}

const TITLED_PSALM_SET: ReadonlySet<number> = new Set(TITLED_PSALMS);

/** A request that should become a specific HTTP status rather than a 500. */
class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const notFound = (detail: string): HttpError => new HttpError(404, "not_found", detail);

/** Reference failures that describe a missing resource rather than bad syntax. */
const NOT_FOUND_KINDS: ReadonlySet<ParseErrorKind> = new Set<ParseErrorKind>([
  "unknown_book",
  "unavailable",
  "out_of_range",
]);

const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "OPTIONS"],
    // Without this a browser client cannot read the identity headers at all —
    // only the CORS-safelisted set is exposed by default, so the two headers
    // that exist for callers to use would be invisible to the callers who most
    // need them.
    exposeHeaders: ["x-generation-id", "x-revision-id"],
  }),
);

/**
 * Both identities travel on every response. A client caching by `x-generation-id`
 * retires its entries whenever anything published changes; a client that has
 * stored a coordinate into the text checks `x-revision-id`, which moves only
 * when the text itself does.
 */
app.use("*", async (context, next) => {
  await next();
  const identity = identityOf(translationOf(context).meta.id);
  context.header("x-generation-id", identity.generationId);
  context.header("x-revision-id", identity.revisionId);
});

/*
 * Caching is handled by the platform, not here. `[cache] enabled` in
 * wrangler.toml puts a cache in front of the Worker, so a hit is served without
 * running it at all — no CPU, where an in-Worker Cache API lookup still had to
 * boot the isolate and execute. Measured at 1 MISS and 7 HITs across 8
 * identical requests.
 *
 * Deploying does *not* invalidate it. This comment used to say the opposite,
 * and called that what made an `immutable` Cache-Control safe on verse data.
 * Since it is false, verse responses are capped at a day instead — see the
 * comment on VERSE_DATA. Responses set their own Cache-Control below, and that
 * is what decides what gets stored.
 */

/* ------------------------------------------------------------------ *
 * Serializers
 * ------------------------------------------------------------------ */

function hebrewNumbering(verse: CorpusVerse): number {
  return verse.book === "PSA" && TITLED_PSALM_SET.has(verse.chapter)
    ? verse.verse + 1
    : verse.verse;
}

function serializeBook(bookId: string, translation: string = DEFAULT_TRANSLATION) {
  const meta = BOOKS.get(bookId);
  if (meta === undefined) throw notFound(`No book with id "${bookId}"`);
  return {
    id: meta.id,
    name: meta.name,
    testament: meta.testament,
    is_deuterocanon: meta.isDeuterocanon,
    chapters_count: chapterCount(meta.id, translation),
    author: meta.author,
    genre: meta.genre,
    approximate_date: meta.approximateDate,
    data_availability: dataAvailabilityOf(meta.id, translation),
    canons: canonPositions(meta.id),
  };
}

function serializePassageVerse(verse: CorpusVerse, translation: string) {
  attest(translation, verse);
  return {
    id: verse.id,
    book: verse.book,
    chapter: verse.chapter,
    verse: verse.verse,
    text: verse.text,
    note: verse.note,
  };
}

/* ------------------------------------------------------------------ *
 * Endpoints
 * ------------------------------------------------------------------ */

/**
 * The demo page. Cached only briefly: the platform cache is invalidated by a
 * deploy, but a browser's own cache is not, so a long max-age here would leave
 * someone looking at a stale page after an update.
 */
app.get("/", (context) => {
  context.header("Cache-Control", "public, max-age=300");
  return context.html(DEMO_HTML);
});

/**
 * The contract, served next to the thing it describes.
 *
 * A spec a caller cannot fetch is a spec that quietly goes stale; this one is
 * bundled with the Worker, so the running code and its published description
 * ship together.
 */
/**
 * The colophon promise, checked rather than asserted.
 *
 * Every response names the translation it came from. This checks the verses in
 * it actually did — that none was read from one edition and served under
 * another's name.
 *
 * It exists because that exact mistake happened three times while this API grew
 * a second edition: Esther 14:1 came back as Job 3:5, a psalm request returned
 * an empty success, and a search answered from the wrong index. Every one was
 * HTTP 200 carrying a real, well-formed, correctly numbered verse from the
 * wrong Bible. A status code cannot see that. A schema cannot see it. Only
 * provenance can, so verses carry theirs and this is where it is read.
 *
 * A failure here is a fault in this file rather than bad input, so it raises
 * instead of blaming the caller.
 */
export function attest<T extends CorpusVerse>(translation: string, verse: T): T {
  if (verse.translation !== translation) {
    throw new Error(
      `Provenance mismatch on ${verse.id}: the response names ${translation} ` +
        `but this verse was read from ${verse.translation}. Refusing to serve ` +
        `one edition's words under another's name.`,
    );
  }
  return verse;
}
app.get("/openapi.yaml", (context) => {
  context.header("Content-Type", "application/yaml; charset=utf-8");
  context.header("Cache-Control", DAILY);
  return context.body(OPENAPI);
});

app.get("/health", (context) => {
  const translation = translationOf(context);
  context.header("Cache-Control", "no-store");
  return context.json({
    status: "ok",
    database: "embedded",
    ...(() => {
      const identity = identityOf(translation.meta.id);
      return {
        edition_id: identity.editionId,
        revision_id: identity.revisionId,
        generation_id: identity.generationId,
      };
    })(),
    verse_count: totalVersesOf(translation.meta.id),
    // Stated here, not only in the README: a consumer should be able to learn
    // its obligations from the API rather than from prose it may never read.
    translation: translation.meta,
    source: translation.source,
    timestamp: new Date().toISOString(),
  });
});

/**
 * What each registered edition can actually do — the thing a generic client
 * cannot discover any other way once editions genuinely differ in
 * capability, which SBLGNT is the first one to do (Greek, New Testament
 * only, no search, apparatus only here). Every field below is derived from
 * the same registries the routes themselves gate on, never hand-maintained,
 * so it can't drift the way an unmonitored flag would.
 */
app.get("/translations", (context) => {
  context.header("Cache-Control", DAILY);
  return context.json({
    default: DEFAULT_TRANSLATION,
    translations: TRANSLATION_IDS.map((id) => {
      const translation = TRANSLATIONS.get(id)!;
      const testaments = new Set(
        Object.keys(translation.verseCounts)
          .map((bookId) => BOOKS.get(bookId)?.testament)
          .filter((t): t is "OT" | "NT" => t !== undefined),
      );
      return {
        ...translation.meta,
        source: translation.source,
        capabilities: {
          search: SEARCHABLE_TRANSLATIONS.includes(id),
          apparatus: APPARATUS_TRANSLATIONS.includes(id),
          psalm_numbering: translation.psalmSchemes,
          testaments: [...testaments].sort(),
        },
      };
    }),
  });
});

app.get("/books", (context) => {
  const translation = translationOf(context);
  const requested = context.req.query("tradition") ?? "protestant";
  if (!isTradition(requested)) {
    throw new HttpError(
      400,
      "bad_request",
      `Unknown tradition "${requested}". Use protestant, catholic, or orthodox_greek.`,
    );
  }
  const tradition: Tradition = requested;
  context.header("Cache-Control", DAILY);
  return context.json({
    tradition,
    translation: translation.meta,
    books: CANON_ORDER[tradition].map((bookId) => serializeBook(bookId, translation.meta.id)),
  });
});

app.get("/books/:id", (context) => {
  const translation = translationOf(context);
  const id = context.req.param("id").toUpperCase();
  if (!BOOKS.has(id)) throw notFound(`No book with id "${context.req.param("id")}"`);
  context.header("Cache-Control", DAILY);
  return context.json(serializeBook(id, translation.meta.id));
});

app.get("/books/:id/chapters/:num", (context) => {
  const translation = translationOf(context);
  const id = context.req.param("id").toUpperCase();
  const meta = BOOKS.get(id);
  if (meta === undefined) throw notFound(`No book with id "${context.req.param("id")}"`);
  if (dataAvailabilityOf(id, translation.meta.id) === "metadata_only") {
    throw notFound(
      `${meta.name} is not present in the ${translation.meta.name}; only its canon metadata is available`,
    );
  }

  const raw = context.req.param("num");
  if (!/^\d+$/.test(raw)) {
    throw new HttpError(400, "bad_request", `Chapter must be a number, got "${raw}"`);
  }
  const chapter = Number.parseInt(raw, 10);
  const total = chapterCount(id, translation.meta.id);
  if (chapter < 1 || chapter > total) {
    throw notFound(`${meta.name} has ${total} chapter${total === 1 ? "" : "s"}, so there is no chapter ${chapter}`);
  }

  const verses = [];
  const count = verseCount(id, chapter, translation.meta.id);
  for (let number = 1; number <= count; number += 1) {
    const verse = attest(
      translation.meta.id,
      verseByReference(id, chapter, number, translation.meta.id),
    );
    verses.push({
      id: verse.id,
      number: verse.verse,
      text: verse.text,
      hebrew_numbering: hebrewNumbering(verse),
      note: verse.note,
    });
  }

  context.header("Cache-Control", VERSE_DATA);
  return context.json({
    id: `${id}.${chapter}`,
    book_id: id,
    chapter,
    descriptive_title: descriptiveTitle(id, chapter, translation.meta.id),
    subscription: subscription(id, chapter, translation.meta.id),
    verses,
  });
});

app.get("/passages", (context) => {
  const translation = translationOf(context);
  const reference = context.req.query("ref");
  if (reference === undefined || reference.trim() === "") {
    throw new HttpError(400, "bad_request", 'The "ref" query parameter is required, for example ?ref=John 3:16');
  }
  if (reference.length > MAX_INPUT_LENGTH) {
    throw new HttpError(
      400,
      "bad_request",
      `A reference may be at most ${MAX_INPUT_LENGTH} characters; this one is ${reference.length}.`,
    );
  }

  const numberingParam = context.req.query("numbering") ?? "english";
  if (
    numberingParam !== "english" &&
    numberingParam !== "hebrew" &&
    numberingParam !== "greek"
  ) {
    throw new HttpError(
      400,
      "bad_request",
      `Unknown numbering "${numberingParam}". Use english, hebrew, or greek.`,
    );
  }

  // Converting between psalm numbering schemes uses one edition's relationship
  // between them. Applying the ASV's to a text that already prints the Greek
  // division produced a 200 carrying no verses, which a caller cannot tell
  // apart from a psalm that genuinely has none.
  if (numberingParam !== "english" && !translation.psalmSchemes.includes(numberingParam)) {
    const alternatives = TRANSLATION_IDS.filter(
      (id) => id !== translation.meta.id && resolveTranslation(id).psalmSchemes.includes(numberingParam),
    );
    throw new HttpError(
      501,
      "not_implemented",
      `${translation.meta.name} cannot be addressed in ${numberingParam} numbering. ` +
        `It prints its own division of the Psalter and the conversion onto it is ` +
        `not implemented. Request it without ?numbering` +
        (alternatives.length > 0 ? `, or use ${alternatives.join(", ")}.` : "."),
    );
  }

  const parsed = parseReference(reference, {
    numbering: numberingParam,
    translation: translation.meta.id,
  });

  if (parsed.verseCount > MAX_PASSAGE_VERSES) {
    throw new HttpError(
      413,
      "payload_too_large",
      `That reference covers ${parsed.verseCount} verses; the limit is ${MAX_PASSAGE_VERSES}. Request a smaller range.`,
    );
  }

  const verses = [];
  if (parsed.includeTitle) {
    const chapter = parsed.titleChapter ?? parsed.segments[0]?.start.chapter ?? 1;
    const title = descriptiveTitle(parsed.book, chapter, translation.meta.id);
    if (title !== null) {
      verses.push({
        id: `${parsed.book}.${chapter}.0`,
        book: parsed.book,
        chapter,
        verse: 0,
        text: title,
        note: null,
      });
    }
  }
  for (const segment of parsed.segments) {
    for (let sequence = segment.start.sequence; sequence <= segment.end.sequence; sequence += 1) {
      verses.push(
        serializePassageVerse(verseAt(sequence, translation.meta.id), translation.meta.id),
      );
    }
  }

  context.header("Cache-Control", VERSE_DATA);
  return context.json({
    reference: parsed.reference,
    translation: translation.meta,
    numbering: parsed.numbering,
    verses,
  });
});

/**
 * The critical apparatus for a reference — textual variants the edition's
 * own text doesn't carry inline (see src/sblgnt.ts's module doc comment for
 * why apparatus glyphs are dropped from served verse text). A collation of
 * printed editions, not manuscripts: no papyri, uncials, minuscules or
 * patristic citations anywhere in it. See src/sblgnt-apparatus.ts.
 */
app.get("/apparatus", (context) => {
  const translation = translationOf(context);
  // Parallel to /search's gate: an edition with no apparatus data refuses
  // rather than silently answering empty, which a caller could not tell
  // apart from "this reference genuinely has no variants."
  if (!APPARATUS_TRANSLATIONS.includes(translation.meta.id)) {
    throw new HttpError(
      501,
      "not_implemented",
      `A critical apparatus is not available for ${translation.meta.name}; none is embedded for it. ` +
        `Editions with an apparatus: ${APPARATUS_TRANSLATIONS.join(", ")}. Passages and ` +
        `books work for every translation this deployment serves.`,
    );
  }

  const reference = context.req.query("ref");
  if (reference === undefined || reference.trim() === "") {
    throw new HttpError(400, "bad_request", 'The "ref" query parameter is required, for example ?ref=Jude 1:5');
  }
  if (reference.length > MAX_INPUT_LENGTH) {
    throw new HttpError(
      400,
      "bad_request",
      `A reference may be at most ${MAX_INPUT_LENGTH} characters; this one is ${reference.length}.`,
    );
  }

  const parsed = parseReference(reference, { numbering: "english", translation: translation.meta.id });
  if (parsed.verseCount > MAX_PASSAGE_VERSES) {
    throw new HttpError(
      413,
      "payload_too_large",
      `That reference covers ${parsed.verseCount} verses; the limit is ${MAX_PASSAGE_VERSES}. Request a smaller range.`,
    );
  }

  const notes: {
    id: string;
    book: string;
    chapter: number;
    verse: number;
    index: number;
    lemma: string;
    readings: readonly string[];
    range: string | null;
    raw: string;
  }[] = [];
  for (const segment of parsed.segments) {
    for (let sequence = segment.start.sequence; sequence <= segment.end.sequence; sequence += 1) {
      const verse = verseAt(sequence, translation.meta.id);
      const forVerse = apparatusFor(translation.meta.id, verse.id);
      forVerse.forEach((note, i) => {
        notes.push({
          id: `${verse.id}!${i + 1}`,
          book: verse.book,
          chapter: verse.chapter,
          verse: verse.verse,
          index: i + 1,
          lemma: note.lemma,
          readings: note.readings,
          range: note.range,
          raw: note.raw,
        });
      });
    }
  }

  if (notes.length > MAX_APPARATUS_NOTES) {
    throw new HttpError(
      413,
      "payload_too_large",
      `That reference carries ${notes.length} apparatus notes; the limit is ${MAX_APPARATUS_NOTES}. Request a smaller range.`,
    );
  }

  context.header("Cache-Control", VERSE_DATA);
  return context.json({
    reference: parsed.reference,
    translation: translation.meta,
    notes,
  });
});

app.get("/search", (context) => {
  const translation = translationOf(context);
  // An edition without an index cannot be searched, and answering from
  // another edition's index while labelling the response with this one would
  // be the silent wrong answer the conformance suite records elsewhere.
  if (!SEARCHABLE_TRANSLATIONS.includes(translation.meta.id)) {
    throw new HttpError(
      501,
      "not_implemented",
      `Search is not available for ${translation.meta.name}; no index is embedded for it. ` +
        `Indexed editions: ${SEARCHABLE_TRANSLATIONS.join(", ")}. Passages and ` +
        `books work for every translation this deployment serves.`,
    );
  }
  const query = context.req.query("q") ?? "";
  if (query.trim().length < MIN_QUERY_LENGTH) {
    throw new HttpError(
      400,
      "bad_request",
      `Search queries must be at least ${MIN_QUERY_LENGTH} characters.`,
    );
  }
  if (query.length > MAX_INPUT_LENGTH) {
    throw new HttpError(
      400,
      "bad_request",
      `A search query may be at most ${MAX_INPUT_LENGTH} characters; this one is ${query.length}.`,
    );
  }
  // Cost scales with the number of distinct terms, so it is bounded and the
  // caller is told rather than being silently truncated.
  const termCount = countQueryTerms(query);
  if (termCount > MAX_QUERY_TERMS) {
    throw new HttpError(
      400,
      "bad_request",
      `A search may use at most ${MAX_QUERY_TERMS} distinct words; this one has ${termCount}.`,
    );
  }

  const limit = parseBounded(context.req.query("limit"), DEFAULT_SEARCH_LIMIT, 1, MAX_SEARCH_LIMIT, "limit");
  const offset = parseBounded(context.req.query("offset"), 0, 0, Number.MAX_SAFE_INTEGER, "offset");

  const outcome = search(query, limit, offset, translation.meta.id);

  context.header("Cache-Control", BRIEF);
  return context.json({
    query,
    total: outcome.total,
    limit,
    offset,
    truncated: outcome.truncated,
    translation: translation.meta,
    results: outcome.hits.map((hit) => attest(translation.meta.id, hit)).map((hit) => ({
      id: hit.id,
      book: hit.book,
      chapter: hit.chapter,
      verse: hit.verse,
      text: hit.text,
      score: hit.score,
    })),
  });
});

function parseBounded(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new HttpError(400, "bad_request", `The ${label} must be a whole number, got "${raw}"`);
  }
  const value = Number.parseInt(raw, 10);
  if (value < minimum || value > maximum) {
    throw new HttpError(
      400,
      "bad_request",
      `The ${label} must be between ${minimum} and ${maximum}, got ${value}`,
    );
  }
  return value;
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

app.notFound((context) =>
  context.json(
    {
      error: "not_found",
      detail:
        "Unknown endpoint. Available: /openapi.yaml, /health, /translations, /books, " +
        "/books/:id, /books/:id/chapters/:num, /passages, /search, /apparatus",
    },
    404,
  ),
);

app.onError((error, context) => {
  // Every error path, not just 501: this platform's cache does not purge on
  // deploy (see the comment on VERSE_DATA above), so a cached failure could
  // otherwise outlive the build that fixes it — e.g. a 501 for an edition
  // that gains real support in the next deploy, still served from cache.
  context.header("Cache-Control", "no-store");

  if (error instanceof HttpError) {
    return context.json({ error: error.code, detail: error.message }, error.status);
  }
  if (error instanceof ParseError) {
    // A well-formed reference to something that is not there is a 404, matching
    // what /books/:id and /books/:id/chapters/:num already return for the same
    // condition. Malformed or ambiguous input stays a 400.
    if (NOT_FOUND_KINDS.has(error.kind)) {
      return context.json({ error: "not_found", detail: error.message }, 404);
    }
    return context.json({ error: "bad_request", detail: error.message }, 400);
  }
  // Log the real cause, return a generic message.
  console.error("Unhandled error", { path: context.req.path, error });
  return context.json(
    { error: "internal_error", detail: "An unexpected error occurred." },
    500,
  );
});

export default app;
