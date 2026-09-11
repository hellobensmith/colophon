/**
 * The full-corpus reconstruction check (7,939 verses against the source's
 * own `data/sblgnt/text/*.txt`) lives outside this suite — it depends on
 * `/Users/ben/Downloads/SBLGNT-src/`, a local download, not a repo fixture,
 * so it isn't portable to another clone or CI. Run it by hand before
 * trusting a change to the join algorithm; these tests cover the same
 * mechanics with small, self-contained fixtures instead.
 */
import { describe, expect, test } from "bun:test";
import { parseSblgnt, UnknownSblgntElementError, UnclosedInterpolationError } from "./sblgnt.ts";
import { sumLedger } from "./document.ts";

const BOM = "﻿";

function book(id: string, body: string): string {
  return `${BOM}<book id="${id}">${body}</book>`;
}

describe("the join algorithm", () => {
  test("empty suffixes don't collapse word boundaries, and prefix glue is exact", () => {
    const xml = book(
      "Jud",
      `<title>ΙΟΥΔΑ</title><p>` +
        `<verse-number id="Jude 1:1">1:1</verse-number>` +
        `<w>Ἰούδας</w><suffix></suffix>` +
        `<w>Ἰησοῦ</w><suffix>, </suffix>` +
        `<prefix> ⸀</prefix><w>δοῦλος</w><suffix>. </suffix>` +
        `</p>`,
    );
    const doc = parseSblgnt(xml);
    expect(doc.verses[0]?.text).toBe("Ἰούδας Ἰησοῦ, δοῦλος.");
  });

  test("a mid-verse paragraph break contributes exactly one joining space", () => {
    const xml = book(
      "Mk",
      `<p><verse-number id="Mark 1:1">1:1</verse-number>` +
        `<w>ἀρχὴ</w><suffix></suffix></p>` +
        `<p><w>εὐαγγελίου</w><suffix>.</suffix></p>`,
    );
    const doc = parseSblgnt(xml);
    expect(doc.verses[0]?.text).toBe("ἀρχὴ εὐαγγελίου.");
  });

  test("trailing whitespace is trimmed from the served verse", () => {
    const xml = book(
      "Lu",
      `<p><verse-number id="Luke 1:8">8</verse-number>` +
        `<w>θεοῦ</w><suffix></suffix></p><p></p>` +
        `<verse-number id="Luke 1:9">9</verse-number><w>ἔλαχεν</w><suffix>.</suffix>`,
    );
    const doc = parseSblgnt(xml);
    expect(doc.verses[0]?.text).toBe("θεοῦ");
    expect(doc.verses[1]?.text).toBe("ἔλαχεν.");
  });
});

describe("critical-apparatus markers", () => {
  test("Unicode variant glyphs are dropped, ledger-accounted, not just hidden", () => {
    const xml = book(
      "Jud",
      `<p><verse-number id="Jude 1:1">1:1</verse-number>` +
        `<prefix> ⸀</prefix><w>ἠγαπημένοις</w><suffix>, </suffix>` +
        `<prefix> ⸂</prefix><w>καὶ</w><suffix>⸃ </suffix>` +
        `<w>Χριστῷ</w><suffix>.</suffix></p>`,
    );
    const doc = parseSblgnt(xml);
    expect(doc.verses[0]?.text).toBe("ἠγαπημένοις, καὶ Χριστῷ.");
    expect(doc.ledger.dropped.get("apparatus-marker")).toBe(3); // ⸀ ⸂ ⸃
  });

  test("ASCII brackets and parens are real printed text, not stripped", () => {
    const xml = book(
      "Lu",
      `<p><verse-number id="Luke 22:19">19</verse-number>` +
        `<w>σῶμά</w><suffix></suffix>` +
        `<prefix> [</prefix><w>μου</w><suffix>.</suffix></p>`,
    );
    const doc = parseSblgnt(xml);
    expect(doc.verses[0]?.text).toBe("σῶμά [μου.");
  });

  test("the coverage ledger balances exactly on a realistic fixture", () => {
    const xml = book(
      "Jud",
      `<title>ΙΟΥΔΑ</title><p>` +
        `<verse-number id="Jude 1:1">1:1</verse-number>` +
        `<prefix> ⸀</prefix><w>ἠγαπημένοις</w><suffix>· </suffix>` +
        `<verse-number id="Jude 1:2">2</verse-number>` +
        `<w>ἔλεος</w><suffix>.</suffix></p>`,
    );
    const doc = parseSblgnt(xml);
    const accounted = sumLedger(doc.ledger);
    expect(accounted).toBe(doc.ledger.sourceCharacters);
  });
});

describe("book identity and canonical order", () => {
  test("real <book id> values map to Colophon's 3-letter codes", () => {
    const xml =
      book("1Co", `<p><verse-number id="1 Corinthians 1:1">1:1</verse-number><w>Παῦλος</w><suffix>.</suffix></p>`) +
      book("Mt", `<p><verse-number id="Matthew 1:1">1:1</verse-number><w>Βίβλος</w><suffix>.</suffix></p>`);
    const doc = parseSblgnt(xml);
    expect(doc.verses.map((v) => v.book)).toEqual(["MAT", "1CO"]);
  });

  test("input order is reordered into canonical NT order, not filename/concatenation order", () => {
    // 1Co sorts before Mt alphabetically, but Matthew is canonically first.
    const xml =
      book("1Co", `<p><verse-number id="1 Corinthians 1:1">1:1</verse-number><w>Παῦλος</w><suffix>.</suffix></p>`) +
      book("Mt", `<p><verse-number id="Matthew 1:1">1:1</verse-number><w>Βίβλος</w><suffix>.</suffix></p>`);
    const doc = parseSblgnt(xml);
    expect(doc.books).toEqual(["MAT", "1CO"]);
  });

  test("an unrecognised <book id> refuses rather than guessing", () => {
    const xml = book("Xyz", `<p><verse-number id="Xyz 1:1">1:1</verse-number><w>a</w><suffix>.</suffix></p>`);
    expect(() => parseSblgnt(xml)).toThrow(UnknownSblgntElementError);
  });

  test("a book name containing a space in verse-number id parses correctly", () => {
    // 13 of 27 real book names contain a space ("1 Corinthians", "3 John", ...) —
    // the id must be parsed by anchoring on the trailing chapter:verse, not by
    // splitting on the first space.
    const xml = book(
      "2Th",
      `<p><verse-number id="2 Thessalonians 3:18">18</verse-number><w>χάρις</w><suffix>.</suffix></p>`,
    );
    const doc = parseSblgnt(xml);
    expect(doc.verses[0]?.bcv).toBe("2TH.3.18");
  });
});

describe("Mark's Shorter Ending — an interpolation, not a continuation", () => {
  test("text after a verse already has content, bracketed and unnumbered, is routed out", () => {
    const xml = book(
      "Mk",
      `<p><verse-number id="Mark 16:8">8</verse-number>` +
        `<w>ἐφοβοῦντο</w><suffix>. </suffix>` +
        `<prefix> ⟦</prefix><w>Πάντα</w><suffix></suffix>` +
        `<w>ἐξήγγειλαν</w><suffix>.⟧ </suffix>` +
        `<verse-number id="Mark 16:9">9</verse-number>` +
        `<w>Ἀναστὰς</w><suffix>.</suffix></p>`,
    );
    const doc = parseSblgnt(xml);
    expect(doc.verses[0]?.text).toBe("ἐφοβοῦντο.");
    expect(doc.verses[1]?.text).toBe("Ἀναστὰς.");
    expect(doc.interpolations.get("MRK.16.8")).toBe("Πάντα ἐξήγγειλαν.");
  });

  test("a ⟦ opening as a verse's first content is an ordinary marker, not an interpolation", () => {
    // Distinguishes John 7:53 / Mark 16:9's own ⟦ (first content of their verse)
    // from the Shorter Ending (opens only after content already accumulated).
    const xml = book(
      "Jn",
      `<p><verse-number id="John 7:53">53</verse-number>` +
        `<prefix> ⟦</prefix><w>Καὶ</w><suffix>⟧ </suffix></p>`,
    );
    const doc = parseSblgnt(xml);
    expect(doc.verses[0]?.text).toBe("Καὶ");
    expect(doc.interpolations.size).toBe(0);
  });

  test("an interpolation that never closes refuses rather than guessing", () => {
    const xml = book(
      "Mk",
      `<p><verse-number id="Mark 16:8">8</verse-number>` +
        `<w>ἐφοβοῦντο</w><suffix>. </suffix>` +
        `<prefix> ⟦</prefix><w>Πάντα</w><suffix></suffix>` +
        `<verse-number id="Mark 16:9">9</verse-number>` +
        `<w>Ἀναστὰς</w><suffix>.</suffix></p>`,
    );
    expect(() => parseSblgnt(xml)).toThrow(UnclosedInterpolationError);
  });
});

describe("it refuses what it cannot classify", () => {
  test("an unrecognised element halts the build", () => {
    const xml = book("Jud", `<footnote>stray</footnote>`);
    expect(() => parseSblgnt(xml)).toThrow(UnknownSblgntElementError);
  });
});
