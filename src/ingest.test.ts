/**
 * Format dispatch: the same short passage, expressed in all three formats,
 * must parse to the same document regardless of which one it's written in.
 *
 * This is the direct proof of "one validated pipeline" — `scripts/build-data.ts`
 * has file I/O and calls `process.exit`, so it isn't unit-testable directly;
 * `parseSource` is the pure seam that carries the actual claim.
 *
 * Deliberately kept to one verse per paragraph in every fixture: USFM/USX
 * synthesize a joining space when a single verse's text spans a paragraph
 * break, while USFX never does (its whitespace lives in the source text
 * nodes). Comparing across formats with a verse split like that would fail
 * for a reason that has nothing to do with dispatch — that case is already
 * covered per-parser, in usfm.test.ts and usx.test.ts.
 */
import { describe, expect, test } from "bun:test";
import { parseSource } from "./ingest.ts";

const USFX =
  `<?xml version="1.0" encoding="utf-8"?><usfx><book id="PSA"><c id="3" />` +
  `<d style="d">A Psalm of David.</d>` +
  `<p style="p"><v id="1" bcv="PSA.3.1" />Jehovah, how are mine adversaries increased!<ve /></p>` +
  `<p style="p"><v id="2" bcv="PSA.3.2" />Many there are that rise up against me.<ve /></p>` +
  `</book></usfx>`;

const USFM =
  `\\id PSA - Test\n\\c 3\n\\d A Psalm of David.\n` +
  `\\p\n\\v 1 Jehovah, how are mine adversaries increased!\n` +
  `\\p\n\\v 2 Many there are that rise up against me.`;

const USX =
  `<usx version="3.0"><book code="PSA" style="id">Test</book>` +
  `<chapter number="3" style="c" sid="PSA 3"/>` +
  `<para style="d">A Psalm of David.</para>` +
  `<para style="p"><verse number="1" style="v" sid="PSA 3:1"/>Jehovah, how are mine adversaries increased!<verse eid="PSA 3:1"/></para>` +
  `<para style="p"><verse number="2" style="v" sid="PSA 3:2"/>Many there are that rise up against me.<verse eid="PSA 3:2"/></para>` +
  `<chapter eid="PSA 3"/></usx>`;

describe("the same passage, three formats", () => {
  test("detects each format from content alone", () => {
    expect(parseSource(USFX).books).toEqual(["PSA"]);
    expect(parseSource(USFM).books).toEqual(["PSA"]);
    expect(parseSource(USX).books).toEqual(["PSA"]);
  });

  test("an explicit format skips detection and still parses", () => {
    expect(parseSource(USFX, "usfx").books).toEqual(["PSA"]);
    expect(parseSource(USFM, "usfm").books).toEqual(["PSA"]);
    expect(parseSource(USX, "usx").books).toEqual(["PSA"]);
  });

  test("produces the same verses regardless of format", () => {
    const strip = (verse: { bcv: string; book: string; chapter: number; verse: number; text: string; note: string | null }) => ({
      bcv: verse.bcv,
      book: verse.book,
      chapter: verse.chapter,
      verse: verse.verse,
      text: verse.text,
      note: verse.note,
    });
    const usfx = parseSource(USFX).verses.map(strip);
    const usfm = parseSource(USFM).verses.map(strip);
    const usx = parseSource(USX).verses.map(strip);
    expect(usfm).toEqual(usfx);
    expect(usx).toEqual(usfx);
  });

  test("produces the same title, subscriptions and books regardless of format", () => {
    const usfx = parseSource(USFX);
    const usfm = parseSource(USFM);
    const usx = parseSource(USX);

    for (const doc of [usfm, usx]) {
      expect([...doc.titles.entries()]).toEqual([...usfx.titles.entries()]);
      expect([...doc.subscriptions.entries()]).toEqual([...usfx.subscriptions.entries()]);
      expect(doc.books).toEqual(usfx.books);
    }
  });
});
