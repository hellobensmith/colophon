/**
 * One adapter per API under test.
 *
 * An adapter's only job is to translate a probe's intent into that API's own
 * dialect and normalize what comes back. It must not paper over behaviour: if
 * an API returns markup inside verse text, or a different verse than was asked
 * for, the adapter passes that through unchanged. Smoothing it here would hide
 * exactly what the suite exists to find.
 *
 * Each adapter declares its capabilities. A probe needing something an adapter
 * does not claim records `not-applicable` rather than a defect — several of
 * these APIs address verses by number and leave reference parsing to the
 * client, which is a design choice and not a failure.
 */

import { asJson, request, type FetchOptions } from "../fetcher.ts";
import { book } from "../books.ts";
import type { Adapter, Capability, NormalizedVerse, Outcome } from "../types.ts";

function outcome(
  status: number,
  verses: readonly NormalizedVerse[],
  raw: unknown,
  transportError: string | null,
  fromCache: boolean,
): Outcome {
  return { status, verses, raw, transportError, fromCache };
}

/** Verse text as the API sent it, with only whitespace collapsed. */
function clean(text: unknown): string {
  return typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
}

const caps = (...items: Capability[]): ReadonlySet<Capability> => new Set(items);

/* ------------------------------------------------------------------ *
 * bible-api.com — human reference strings, several translations.
 * ------------------------------------------------------------------ */

export function bibleApiCom(options: FetchOptions): Adapter {
  const fetchIt = async (url: string): Promise<Outcome> => {
    const response = await request(url, options);
    const body = asJson(response.body);
    const verses = Array.isArray((body as { verses?: unknown })?.verses)
      ? ((body as { verses: Record<string, unknown>[] }).verses).map((v) => ({
          book: typeof v["book_id"] === "string" ? v["book_id"] : null,
          chapter: typeof v["chapter"] === "number" ? v["chapter"] : null,
          verse: typeof v["verse"] === "number" ? v["verse"] : null,
          text: clean(v["text"]),
        }))
      : [];
    return outcome(response.status, verses, body ?? response.body, response.transportError, response.fromCache);
  };

  return {
    id: "bible-api.com",
    name: "bible-api.com",
    homepage: "https://bible-api.com",
    edition: "asv",
    capabilities: caps("freeform-reference", "range", "self-description"),
    resolve: (reference) =>
      fetchIt(`https://bible-api.com/${encodeURIComponent(reference)}?translation=asv`),
    verse: (usfm, chapter, verse) => {
      const row = book(usfm);
      return fetchIt(
        `https://bible-api.com/${encodeURIComponent(`${row.name} ${chapter}:${verse}`)}?translation=asv`,
      );
    },
    chapter: (usfm, chapter) => {
      const row = book(usfm);
      return fetchIt(
        `https://bible-api.com/${encodeURIComponent(`${row.name} ${chapter}`)}?translation=asv`,
      );
    },
    describe: () => fetchIt("https://bible-api.com/john+3:16?translation=asv"),
  };
}

/* ------------------------------------------------------------------ *
 * labs.bible.org — human reference strings, NET Bible only.
 * ------------------------------------------------------------------ */

export function labsBibleOrg(options: FetchOptions): Adapter {
  const fetchIt = async (url: string): Promise<Outcome> => {
    const response = await request(url, options);
    const body = asJson(response.body);
    const verses = Array.isArray(body)
      ? (body as Record<string, unknown>[]).map((v) => ({
          book: typeof v["bookname"] === "string" ? v["bookname"] : null,
          chapter: Number(v["chapter"]) || null,
          verse: Number(v["verse"]) || null,
          text: clean(v["text"]),
        }))
      : [];
    return outcome(response.status, verses, body ?? response.body, response.transportError, response.fromCache);
  };

  return {
    id: "labs.bible.org",
    name: "labs.bible.org (NET)",
    homepage: "https://labs.bible.org/api_web_service",
    edition: "net",
    capabilities: caps("freeform-reference", "range"),
    resolve: (reference) =>
      fetchIt(`https://labs.bible.org/api/?passage=${encodeURIComponent(reference)}&type=json`),
    verse: (usfm, chapter, verse) => {
      const row = book(usfm);
      return fetchIt(
        `https://labs.bible.org/api/?passage=${encodeURIComponent(`${row.name} ${chapter}:${verse}`)}&type=json`,
      );
    },
  };
}

/* ------------------------------------------------------------------ *
 * bolls.life — numeric book ordinals. Verse text carries Strong's markup.
 * ------------------------------------------------------------------ */

export function bollsLife(options: FetchOptions): Adapter {
  const fetchIt = async (url: string, chapterNumber: number, usfm: string): Promise<Outcome> => {
    const response = await request(url, options);
    const body = asJson(response.body);
    const rows = Array.isArray(body) ? body : body === null ? [] : [body];
    const verses = (rows as Record<string, unknown>[])
      .filter((v) => typeof v["text"] === "string")
      .map((v) => ({
        book: usfm,
        chapter: chapterNumber,
        verse: Number(v["verse"]) || null,
        // Passed through verbatim: the embedded <S>…</S> Strong's tags are a
        // finding, not something for the adapter to tidy away.
        text: clean(v["text"]),
      }));
    return outcome(response.status, verses, body ?? response.body, response.transportError, response.fromCache);
  };

  return {
    id: "bolls.life",
    name: "bolls.life",
    homepage: "https://bolls.life",
    edition: "asv",
    capabilities: caps("structured-verse", "range", "self-description"),
    verse: (usfm, chapter, verse) =>
      fetchIt(`https://bolls.life/get-verse/ASV/${book(usfm).ordinal}/${chapter}/${verse}/`, chapter, usfm),
    chapter: (usfm, chapter) =>
      fetchIt(`https://bolls.life/get-text/ASV/${book(usfm).ordinal}/${chapter}/`, chapter, usfm),
    describe: () =>
      fetchIt("https://bolls.life/static/bolls/app/views/languages.json", 0, "GEN"),
  };
}

/* ------------------------------------------------------------------ *
 * rkeplin — numeric ordinals, composite verse ids, translation param.
 * ------------------------------------------------------------------ */

export function rkeplin(options: FetchOptions): Adapter {
  const fetchIt = async (url: string): Promise<Outcome> => {
    const response = await request(url, options);
    const body = asJson(response.body);
    const rows = Array.isArray(body) ? body : body === null ? [] : [body];
    const verses = (rows as Record<string, unknown>[])
      .filter((v) => typeof v["verse"] === "string")
      .map((v) => ({
        book: typeof (v["book"] as { name?: unknown })?.name === "string"
          ? String((v["book"] as { name: string }).name)
          : null,
        chapter: Number(v["chapterId"]) || null,
        verse: Number(v["verseId"]) || null,
        text: clean(v["verse"]),
      }));
    return outcome(response.status, verses, body ?? response.body, response.transportError, response.fromCache);
  };

  return {
    id: "rkeplin",
    name: "bible-go-api.rkeplin.com",
    homepage: "https://github.com/rkeplin/bible-go-api",
    edition: "asv",
    capabilities: caps("structured-verse", "range", "book-list", "self-description"),
    verse: (usfm, chapter, verse) => {
      const ordinal = book(usfm).ordinal;
      const id = ordinal * 1_000_000 + chapter * 1_000 + verse;
      return fetchIt(
        `https://bible-go-api.rkeplin.com/v1/books/${ordinal}/chapters/${chapter}/${id}?translation=ASV`,
      );
    },
    chapter: (usfm, chapter) =>
      fetchIt(
        `https://bible-go-api.rkeplin.com/v1/books/${book(usfm).ordinal}/chapters/${chapter}?translation=ASV`,
      ),
    books: () => fetchIt("https://bible-go-api.rkeplin.com/v1/books"),
    describe: () => fetchIt("https://bible-go-api.rkeplin.com/v1/translations"),
  };
}

/* ------------------------------------------------------------------ *
 * getbible.net — numeric ordinals, whole chapters only.
 * ------------------------------------------------------------------ */

export function getBible(options: FetchOptions): Adapter {
  const fetchIt = async (url: string, usfm: string, only?: number): Promise<Outcome> => {
    const response = await request(url, options);
    const body = asJson(response.body) as { chapter?: number; verses?: Record<string, unknown>[] } | null;
    let verses: NormalizedVerse[] = Array.isArray(body?.verses)
      ? body.verses.map((v) => ({
          book: usfm,
          chapter: Number(body?.chapter) || null,
          verse: Number(v["verse"]) || null,
          text: clean(v["text"]),
        }))
      : [];
    if (only !== undefined) verses = verses.filter((v) => v.verse === only);
    return outcome(response.status, verses, body ?? response.body, response.transportError, response.fromCache);
  };

  return {
    id: "getbible.net",
    name: "api.getbible.net",
    homepage: "https://getbible.net",
    edition: "asv",
    capabilities: caps("structured-verse", "range", "self-description"),
    verse: (usfm, chapter, verse) =>
      fetchIt(`https://api.getbible.net/v2/asv/${book(usfm).ordinal}/${chapter}.json`, usfm, verse),
    chapter: (usfm, chapter) =>
      fetchIt(`https://api.getbible.net/v2/asv/${book(usfm).ordinal}/${chapter}.json`, usfm),
    describe: () => fetchIt("https://api.getbible.net/v2/translations.json", "GEN"),
  };
}

/* ------------------------------------------------------------------ *
 * wldeh — a static CDN dataset addressed by lowercase book slug.
 * ------------------------------------------------------------------ */

export function wldeh(options: FetchOptions): Adapter {
  const base = "https://cdn.jsdelivr.net/gh/wldeh/bible-api/bibles/en-asv";
  const fetchIt = async (url: string, usfm: string, chapter: number): Promise<Outcome> => {
    const response = await request(url, options);
    const body = asJson(response.body) as
      | { verse?: string; text?: string; data?: Record<string, unknown>[] }
      | null;
    const rows = Array.isArray(body?.data) ? body.data : body === null ? [] : [body as Record<string, unknown>];
    const verses = rows
      .filter((v) => typeof v["text"] === "string")
      .map((v) => ({
        book: usfm,
        chapter,
        verse: Number(v["verse"]) || null,
        text: clean(v["text"]),
      }));
    return outcome(response.status, verses, body ?? response.body, response.transportError, response.fromCache);
  };

  return {
    id: "wldeh",
    name: "wldeh/bible-api (CDN)",
    homepage: "https://github.com/wldeh/bible-api",
    edition: "asv",
    capabilities: caps("structured-verse", "range", "self-description"),
    verse: (usfm, chapter, verse) =>
      fetchIt(`${base}/books/${book(usfm).slug}/chapters/${chapter}/verses/${verse}.json`, usfm, chapter),
    chapter: (usfm, chapter) =>
      fetchIt(`${base}/books/${book(usfm).slug}/chapters/${chapter}.json`, usfm, chapter),
    describe: () =>
      fetchIt("https://cdn.jsdelivr.net/gh/wldeh/bible-api/bibles/bibles.json", "GEN", 0),
  };
}

/* ------------------------------------------------------------------ *
 * This project. A subject like any other, not the judge.
 * ------------------------------------------------------------------ */

export function ours(options: FetchOptions, base: string): Adapter {
  const fetchIt = async (url: string): Promise<Outcome> => {
    const response = await request(url, options);
    const body = asJson(response.body) as
      | { verses?: Record<string, unknown>[]; books?: unknown }
      | null;
    const verses = Array.isArray(body?.verses)
      ? body.verses.map((v) => ({
          book: typeof v["book"] === "string" ? v["book"] : null,
          chapter: Number(v["chapter"]) || null,
          verse: typeof v["verse"] === "number" ? v["verse"] : null,
          text: clean(v["text"]),
        }))
      : [];
    return outcome(response.status, verses, body ?? response.body, response.transportError, response.fromCache);
  };

  return {
    id: "ours",
    name: "bible-api (this project)",
    homepage: "https://github.com/hellobensmith/bible-api",
    edition: "asv",
    capabilities: caps(
      "freeform-reference",
      "structured-verse",
      "range",
      "book-list",
      "self-description",
    ),
    resolve: (reference) => fetchIt(`${base}/passages?ref=${encodeURIComponent(reference)}`),
    verse: (usfm, chapter, verse) =>
      fetchIt(`${base}/passages?ref=${encodeURIComponent(`${usfm} ${chapter}:${verse}`)}`),
    chapter: async (usfm, chapter) => {
      const response = await request(`${base}/books/${usfm}/chapters/${chapter}`, options);
      const body = asJson(response.body) as { verses?: Record<string, unknown>[] } | null;
      const verses = Array.isArray(body?.verses)
        ? body.verses.map((v) => ({
            book: usfm,
            chapter,
            verse: Number(v["number"]) || null,
            text: clean(v["text"]),
          }))
        : [];
      return outcome(response.status, verses, body ?? response.body, response.transportError, response.fromCache);
    },
    books: () => fetchIt(`${base}/books`),
    describe: () => fetchIt(`${base}/health`),
  };
}

export function allAdapters(options: FetchOptions, ourBase: string): readonly Adapter[] {
  return [
    ours(options, ourBase),
    bibleApiCom(options),
    labsBibleOrg(options),
    bollsLife(options),
    rkeplin(options),
    getBible(options),
    wldeh(options),
  ];
}
