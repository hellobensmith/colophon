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
  type ParseErrorKind,
} from "./parser.ts";
import {
  descriptiveTitle,
  subscription,
  verseAt,
  verseByReference,
  TOTAL_VERSES,
  type CorpusVerse,
} from "./corpus.ts";
import { search } from "./search.ts";
import { DEMO_HTML } from "./demo.ts";
import { TITLED_PSALMS, REVISION_ID, GENERATION_ID, EDITION_ID } from "./data/meta.ts";

/** Longest passage served in one response. */
const MAX_PASSAGE_VERSES = 500;
const MAX_SEARCH_LIMIT = 100;
const DEFAULT_SEARCH_LIMIT = 20;
const MIN_QUERY_LENGTH = 2;

const IMMUTABLE = "public, max-age=31536000, immutable";
const DAILY = "public, max-age=86400";
const BRIEF = "public, max-age=60";

const TRANSLATION = {
  id: "asv",
  name: "American Standard Version",
  language: "en",
  license: "Public Domain",
  year: 1901,
} as const;

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

app.use("*", cors({ origin: "*", allowMethods: ["GET", "OPTIONS"] }));

/**
 * Both identities travel on every response. A client caching by `x-generation-id`
 * retires its entries whenever anything published changes; a client that has
 * stored a coordinate into the text checks `x-revision-id`, which moves only
 * when the text itself does.
 */
app.use("*", async (context, next) => {
  await next();
  context.header("x-generation-id", GENERATION_ID);
  context.header("x-revision-id", REVISION_ID);
});

/*
 * Caching is handled by the platform, not here. `[cache] enabled` in
 * wrangler.toml puts a cache in front of the Worker, so a hit is served without
 * running it at all — no CPU, where an in-Worker Cache API lookup still had to
 * boot the isolate and execute. Deploying invalidates it automatically, which is
 * what makes the `immutable` Cache-Control on verse data safe: new data cannot
 * be masked by a stale entry. Responses set their own Cache-Control below, and
 * that is what decides what gets stored.
 */

/* ------------------------------------------------------------------ *
 * Serializers
 * ------------------------------------------------------------------ */

function hebrewNumbering(verse: CorpusVerse): number {
  return verse.book === "PSA" && TITLED_PSALM_SET.has(verse.chapter)
    ? verse.verse + 1
    : verse.verse;
}

function serializeBook(bookId: string) {
  const meta = BOOKS.get(bookId);
  if (meta === undefined) throw notFound(`No book with id "${bookId}"`);
  return {
    id: meta.id,
    name: meta.name,
    testament: meta.testament,
    is_deuterocanon: meta.isDeuterocanon,
    chapters_count: chapterCount(meta.id),
    author: meta.author,
    genre: meta.genre,
    approximate_date: meta.approximateDate,
    data_availability: meta.dataAvailability,
    canons: canonPositions(meta.id),
  };
}

function serializePassageVerse(verse: CorpusVerse) {
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

app.get("/health", (context) => {
  context.header("Cache-Control", "no-store");
  return context.json({
    status: "ok",
    database: "embedded",
    edition_id: EDITION_ID,
    revision_id: REVISION_ID,
    generation_id: GENERATION_ID,
    verse_count: TOTAL_VERSES,
    timestamp: new Date().toISOString(),
  });
});

app.get("/books", (context) => {
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
    translation: TRANSLATION,
    books: CANON_ORDER[tradition].map((bookId) => serializeBook(bookId)),
  });
});

app.get("/books/:id", (context) => {
  const id = context.req.param("id").toUpperCase();
  if (!BOOKS.has(id)) throw notFound(`No book with id "${context.req.param("id")}"`);
  context.header("Cache-Control", DAILY);
  return context.json(serializeBook(id));
});

app.get("/books/:id/chapters/:num", (context) => {
  const id = context.req.param("id").toUpperCase();
  const meta = BOOKS.get(id);
  if (meta === undefined) throw notFound(`No book with id "${context.req.param("id")}"`);
  if (meta.dataAvailability === "metadata_only") {
    throw notFound(
      `${meta.name} is not present in the American Standard Version; only its canon metadata is available`,
    );
  }

  const raw = context.req.param("num");
  if (!/^\d+$/.test(raw)) {
    throw new HttpError(400, "bad_request", `Chapter must be a number, got "${raw}"`);
  }
  const chapter = Number.parseInt(raw, 10);
  const total = chapterCount(id);
  if (chapter < 1 || chapter > total) {
    throw notFound(`${meta.name} has ${total} chapter${total === 1 ? "" : "s"}, so there is no chapter ${chapter}`);
  }

  const verses = [];
  const count = verseCount(id, chapter);
  for (let number = 1; number <= count; number += 1) {
    const verse = verseByReference(id, chapter, number);
    verses.push({
      id: verse.id,
      number: verse.verse,
      text: verse.text,
      hebrew_numbering: hebrewNumbering(verse),
      note: verse.note,
    });
  }

  context.header("Cache-Control", IMMUTABLE);
  return context.json({
    id: `${id}.${chapter}`,
    book_id: id,
    chapter,
    descriptive_title: descriptiveTitle(id, chapter),
    subscription: subscription(id, chapter),
    verses,
  });
});

app.get("/passages", (context) => {
  const reference = context.req.query("ref");
  if (reference === undefined || reference.trim() === "") {
    throw new HttpError(400, "bad_request", 'The "ref" query parameter is required, for example ?ref=John 3:16');
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

  const parsed = parseReference(reference, { numbering: numberingParam });

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
    const title = descriptiveTitle(parsed.book, chapter);
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
      verses.push(serializePassageVerse(verseAt(sequence)));
    }
  }

  context.header("Cache-Control", IMMUTABLE);
  return context.json({
    reference: parsed.reference,
    translation: TRANSLATION,
    numbering: parsed.numbering,
    verses,
  });
});

app.get("/search", (context) => {
  const query = context.req.query("q") ?? "";
  if (query.trim().length < MIN_QUERY_LENGTH) {
    throw new HttpError(
      400,
      "bad_request",
      `Search queries must be at least ${MIN_QUERY_LENGTH} characters.`,
    );
  }

  const limit = parseBounded(context.req.query("limit"), DEFAULT_SEARCH_LIMIT, 1, MAX_SEARCH_LIMIT, "limit");
  const offset = parseBounded(context.req.query("offset"), 0, 0, Number.MAX_SAFE_INTEGER, "offset");

  const outcome = search(query, limit, offset);

  context.header("Cache-Control", BRIEF);
  return context.json({
    query,
    total: outcome.total,
    limit,
    offset,
    truncated: outcome.truncated,
    translation: TRANSLATION,
    results: outcome.hits.map((hit) => ({
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
        "Unknown endpoint. Available: /health, /books, /books/:id, /books/:id/chapters/:num, /passages, /search",
    },
    404,
  ),
);

app.onError((error, context) => {
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
