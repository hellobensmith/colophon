/**
 * The USX reader, tested structurally.
 *
 * This is weaker evidence than `src/usfm.test.ts` carries, and the difference
 * matters. The USFM reader has a gold standard: eBible publishes the ASV in
 * both USFM and USFX, so parsing one must reproduce the other character for
 * character, and it does. No such reference exists for USX — eBible publishes
 * none and the schema repository ships no samples — so these fixtures are built
 * from the schema's own shapes instead.
 *
 * What that does and does not buy: it proves the reader handles milestones,
 * the routing of every role class, and the cases that made the other two
 * parsers hard. It does not prove the reader against a real publisher bundle.
 * The first one that arrives should be diffed the way the USFM one was.
 */
import { describe, expect, test } from "bun:test";
import { parseUsx } from "./usx.ts";
import { UnknownMarkerError } from "./usfm.ts";
import { USX_STYLE_ROLES, USX_SCHEMA_VERSION } from "./usx-styles.ts";

function usx(body: string, code = "GEN"): string {
  return `<usx version="3.0"><book code="${code}" style="id">Test Edition</book>${body}</usx>`;
}

function chapter(number: number, body: string, code = "GEN"): string {
  return usx(
    `<chapter number="${number}" style="c" sid="${code} ${number}"/>${body}` +
      `<chapter eid="${code} ${number}"/>`,
    code,
  );
}

describe("the style table is complete for the schema it was generated from", () => {
  test("it covers the vocabulary and knows its version", () => {
    expect(USX_SCHEMA_VERSION).toBe("3.0.8");
    expect(USX_STYLE_ROLES.size).toBeGreaterThan(200);
    // Spot-check one member of each role, drawn from a different schema group.
    expect(USX_STYLE_ROLES.get("p")).toBe("paragraph");
    expect(USX_STYLE_ROLES.get("q1")).toBe("paragraph");
    expect(USX_STYLE_ROLES.get("w")).toBe("transparent");
    expect(USX_STYLE_ROLES.get("nd")).toBe("transparent");
    expect(USX_STYLE_ROLES.get("ft")).toBe("footnote");
    expect(USX_STYLE_ROLES.get("toc1")).toBe("metadata");
    expect(USX_STYLE_ROLES.get("xt")).toBe("metadata");
    // Headings inside Para, which the schema does not separate.
    expect(USX_STYLE_ROLES.get("s1")).toBe("metadata");
    expect(USX_STYLE_ROLES.get("qa")).toBe("metadata");
  });
});

describe("verses are milestones", () => {
  // The trap CLAUDE.md records for USFX: a DOM reading of the verse element
  // returns empty strings, because the text is a *sibling* of the marker.
  test("text after the marker belongs to the verse it opened", () => {
    const doc = parseUsx(
      chapter(1, `<para style="p"><verse number="1" style="v" sid="GEN 1:1"/>In the beginning.<verse eid="GEN 1:1"/></para>`),
    );
    expect(doc.verses).toHaveLength(1);
    expect(doc.verses[0]!.bcv).toBe("GEN.1.1");
    expect(doc.verses[0]!.text).toBe("In the beginning.");
  });

  test("a verse spanning paragraphs keeps both halves", () => {
    const doc = parseUsx(
      chapter(1, `<para style="q1"><verse number="1" style="v" sid="GEN 1:1"/>First line,</para>` +
        `<para style="q1">second line.<verse eid="GEN 1:1"/></para>`),
    );
    expect(doc.verses).toHaveLength(1);
    expect(doc.verses[0]!.text).toBe("First line, second line.");
  });

  test("text outside any verse is dropped and recorded, not attached", () => {
    const doc = parseUsx(
      chapter(1, `<para style="s1">A section heading</para>` +
        `<para style="p"><verse number="1" style="v" sid="GEN 1:1"/>Real text.<verse eid="GEN 1:1"/></para>`),
    );
    expect(doc.verses[0]!.text).toBe("Real text.");
    expect([...doc.dropped.values()].reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });
});

describe("each role class routes its text somewhere", () => {
  test("transparent markup keeps its words in the verse", () => {
    const doc = parseUsx(
      chapter(1, `<para style="p"><verse number="1" style="v" sid="GEN 1:1"/>` +
        `<char style="w" strong="H1254">created</char> the <char style="nd">Lord</char>.` +
        `<verse eid="GEN 1:1"/></para>`),
    );
    expect(doc.verses[0]!.text).toBe("created the Lord.");
  });

  test("a note goes to the note, not the body", () => {
    const doc = parseUsx(
      chapter(1, `<para style="p"><verse number="1" style="v" sid="GEN 1:1"/>Text` +
        `<note caller="+" style="f"><char style="fr">1.1</char><char style="ft">Some authorities omit.</char></note>` +
        `.<verse eid="GEN 1:1"/></para>`),
    );
    expect(doc.verses[0]!.text).toBe("Text.");
    expect(doc.verses[0]!.note).toContain("Some authorities omit.");
  });

  test("an unclosed Selah bracket is repaired, as in both cousins", () => {
    const doc = parseUsx(
      chapter(3, `<para style="q1"><verse number="1" style="v" sid="PSA 3:1"/>Done. ` +
        `<char style="qs">[Selah</char><verse eid="PSA 3:1"/></para>`, "PSA"),
    );
    expect(doc.verses[0]!.text).toBe("Done. [Selah]");
  });
});

describe("a descriptive title is a superscription above and a subscription below", () => {
  test("before a verse", () => {
    const doc = parseUsx(
      chapter(3, `<para style="d">A Psalm of David.</para>` +
        `<para style="q1"><verse number="1" style="v" sid="PSA 3:1"/>Jehovah.<verse eid="PSA 3:1"/></para>`, "PSA"),
    );
    expect(doc.titles.get("PSA.3")).toBe("A Psalm of David.");
    expect(doc.subscriptions.size).toBe(0);
  });

  test("after the last verse", () => {
    const doc = parseUsx(
      chapter(3, `<para style="q1"><verse number="19" style="v" sid="HAB 3:19"/>Jehovah.<verse eid="HAB 3:19"/></para>` +
        `<para style="d">For the Chief Musician.</para>`, "HAB"),
    );
    expect(doc.subscriptions.get("HAB.3")).toBe("For the Chief Musician.");
    expect(doc.titles.size).toBe(0);
  });
});

describe("it refuses what it cannot classify", () => {
  test("an element outside the schema stops the parse", () => {
    expect(() => parseUsx(usx(`<nonsense/>`))).toThrow(UnknownMarkerError);
  });

  test("a style outside the schema stops the parse", () => {
    expect(() =>
      parseUsx(chapter(1, `<para style="zzz">Text</para>`)),
    ).toThrow(UnknownMarkerError);
  });
});

describe("front matter is read but contributes nothing", () => {
  test("an FRT book yields no verses and no book entry", () => {
    const doc = parseUsx(
      `<usx version="3.0"><book code="FRT" style="id">Front</book>` +
        `<para style="p">A preface.</para></usx>` +
        chapter(1, `<para style="p"><verse number="1" style="v" sid="GEN 1:1"/>Real.<verse eid="GEN 1:1"/></para>`),
    );
    expect(doc.books).toEqual(["GEN"]);
    expect(doc.verses).toHaveLength(1);
  });
});

describe("entities decode", () => {
  test("named and numeric", () => {
    const doc = parseUsx(
      chapter(1, `<para style="p"><verse number="1" style="v" sid="GEN 1:1"/>` +
        `A &amp; B &#8212; C&#x2019;s.<verse eid="GEN 1:1"/></para>`),
    );
    expect(doc.verses[0]!.text).toBe("A & B — C’s.");
  });
});
