/**
 * Proves the translation parameter is consumed, not ignored.
 *
 * Byte-identical ASV output cannot prove this: with every parameter defaulting
 * to the ASV, identical responses are guaranteed by construction whether the
 * argument is threaded or dropped on the floor. These tests lean on the one
 * observable difference available while a single edition is registered —
 * `versificationOf` throws `UnknownTranslationError` for an id the registry
 * does not hold. If a call site failed to forward its translation, the bogus id
 * would never reach the registry and the call would quietly succeed.
 *
 * When a second edition lands these become weaker than a real fixture
 * comparison, and should be replaced by one.
 */
import { describe, expect, test } from "bun:test";
import {
  chapterCount,
  verseCount,
  sequenceOf,
  locate,
  parseReference,
  ParseError,
} from "./parser.ts";
import { UnknownTranslationError, versificationOf, DEFAULT_TRANSLATION } from "./translations.ts";
import app from "./index.ts";

const BOGUS = "not-a-registered-edition";

describe("the registry refuses unknown editions", () => {
  test("versificationOf throws rather than falling back", () => {
    expect(() => versificationOf(BOGUS)).toThrow(UnknownTranslationError);
  });

  test("the ASV resolves and carries the whole corpus", () => {
    const asv = versificationOf(DEFAULT_TRANSLATION);
    expect(asv.totalVerses).toBe(31102);
    expect(asv.order.length).toBe(66);
  });
});

describe("parser entry points forward their translation", () => {
  // Each of these would return a value instead of throwing if the argument
  // were accepted and then ignored.
  test("chapterCount", () => {
    expect(() => chapterCount("GEN", BOGUS)).toThrow(UnknownTranslationError);
    expect(chapterCount("GEN", "asv")).toBe(50);
  });

  test("verseCount", () => {
    expect(() => verseCount("GEN", 1, BOGUS)).toThrow(UnknownTranslationError);
    expect(verseCount("GEN", 1, "asv")).toBe(31);
  });

  test("sequenceOf", () => {
    expect(() => sequenceOf("GEN", 1, 1, BOGUS)).toThrow(UnknownTranslationError);
    expect(sequenceOf("GEN", 1, 1, "asv")).toBe(1);
  });

  test("locate", () => {
    expect(() => locate(1, BOGUS)).toThrow(UnknownTranslationError);
    expect(locate(31102, "asv")).toEqual({ book: "REV", chapter: 22, verse: 21 });
  });
});

describe("parseReference forwards through its whole call graph", () => {
  /**
   * resolveBook -> ensureAvailable, isolated.
   *
   * Asserting that `parseReference("John 3:16", {translation: BOGUS})` throws
   * proves nothing about resolveBook: if the forwarding were removed,
   * chapterCount would reach the registry a moment later and throw anyway.
   * A metadata-only book discriminates, because ensureAvailable throws there
   * *before* chapterCount is ever called — and the two failures have different
   * types. Threaded: UnknownTranslationError. Unthreaded: a ParseError naming
   * the ASV.
   */
  test("book resolution reaches the registry, not merely the call after it", () => {
    expect(() => parseReference("Tobit 1:1", { translation: BOGUS })).toThrow(
      UnknownTranslationError,
    );
    // and the ASV path still gives the ordinary unavailable message
    expect(() => parseReference("Tobit 1:1")).toThrow(ParseError);
    expect(() => parseReference("Tobit 1:1")).toThrow(
      /not present in the American Standard Version/,
    );
  });

  // validateChapter -> chapterCount, validateVerse -> verseCount, sequenceOf
  test("a multi-chapter range reaches it too", () => {
    expect(() =>
      parseReference("Genesis 1:29-2:3", { translation: BOGUS }),
    ).toThrow(UnknownTranslationError);
  });

  test("an open-ended range, which resolves its end verse from the tables", () => {
    expect(() => parseReference("Genesis 1", { translation: BOGUS })).toThrow(
      UnknownTranslationError,
    );
  });

  test("omitting the option still parses as the ASV", () => {
    expect(parseReference("John 3:16").book).toBe("JHN");
    expect(parseReference("Genesis 1:1", { translation: "asv" }).book).toBe("GEN");
  });
});

describe("every read route refuses an unknown translation", () => {
  // /books/:id and /books/:id/chapters/:num previously ignored the parameter
  // and answered from the ASV under HTTP 200 — the silent wrong answer the
  // conformance suite records against other APIs.
  const routes = [
    "/books",
    "/books/GEN",
    "/books/GEN/chapters/1",
    "/passages?ref=John+3:16",
    "/search?q=beginning",
  ];

  for (const route of routes) {
    test(route, async () => {
      const join = route.includes("?") ? "&" : "?";
      const response = await app.fetch(
        new Request(`https://colophon.test${route}${join}translation=${BOGUS}`),
      );
      expect(response.status).toBe(404);
      const body = (await response.json()) as { error: string; detail: string };
      expect(body.error).toBe("not_found");
      expect(body.detail).toContain(BOGUS);
    });
  }

  test("and still serves the ASV when asked explicitly", async () => {
    const response = await app.fetch(
      new Request("https://colophon.test/books/GEN?translation=asv"),
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as { chapters_count: number }).chapters_count).toBe(50);
  });
});
