/**
 * The full-corpus check (6,934 notes against the real download, verse
 * references cross-checked against the real parsed text) lives outside this
 * suite — see the note at the top of `src/sblgnt.test.ts`. These cover the
 * same mechanics with small, self-contained fixtures.
 */
import { describe, expect, test } from "bun:test";
import { parseApparatusBook, mergeApparatus, UnknownApparatusNoteError } from "./sblgnt-apparatus.ts";

function book(name: string, body: string): string {
  return `<book>\n<book-name>${name}</book-name>\n${body}\n</book>`;
}

describe("the universal split: one lemma, N readings, on the one ']'", () => {
  test("a single-reading note", () => {
    const xml = book(
      "ΙΟΥΔΑ",
      `<verse>Jude 1:3</verse>\n<note>3 ἡμῶν WH Treg NA28 ] – RP</note>`,
    );
    const notes = parseApparatusBook(xml);
    expect(notes.get("JUD.1.3")).toEqual([
      { raw: "ἡμῶν WH Treg NA28 ] – RP", lemma: "ἡμῶν WH Treg NA28", readings: ["– RP"], range: null },
    ]);
  });

  test("multiple notes on one verse, the bullet-continuation form", () => {
    const xml = book(
      "ΙΟΥΔΑ",
      `<verse>Jude 1:5</verse>\n` +
        `<note>5 ὑμᾶς ἅπαξ NA28 RP ] ἅπαξ ὑμᾶς NIV</note>\n` +
        `<note>• πάντα WH Treg NA28 ] τοῦτο RP</note>`,
    );
    const notes = parseApparatusBook(xml);
    expect(notes.get("JUD.1.5")?.length).toBe(2);
    expect(notes.get("JUD.1.5")?.[0]?.lemma).toBe("ὑμᾶς ἅπαξ NA28 RP");
    expect(notes.get("JUD.1.5")?.[1]?.lemma).toBe("πάντα WH Treg NA28");
  });

  test("a note with no ']' refuses rather than guessing", () => {
    const xml = book("ΙΟΥΔΑ", `<verse>Jude 1:1</verse>\n<note>1 stray text with no bracket</note>`);
    expect(() => parseApparatusBook(xml)).toThrow(UnknownApparatusNoteError);
  });
});

describe("book-name resolution", () => {
  test("a full spelled-out book name maps to the 3-letter code", () => {
    const xml = book("ΙΟΥΔΑ", `<verse>Jude 1:1</verse>\n<note>1 a WH ] b RP</note>`);
    const notes = parseApparatusBook(xml);
    expect([...notes.keys()]).toEqual(["JUD.1.1"]);
  });

  test("a numbered book name (containing its own leading digit) resolves correctly", () => {
    const xml = book("ΙΩΑΝΟΥ Γ", `<verse>3 John 1:1</verse>\n<note>1 a WH ] b RP</note>`);
    const notes = parseApparatusBook(xml);
    expect([...notes.keys()]).toEqual(["3JN.1.1"]);
  });
});

describe("a range label is recorded, not silently narrowed to one verse", () => {
  test("Jude's real 22-23 case", () => {
    const xml = book(
      "ΙΟΥΔΑ",
      `<verse>Jude 1:22</verse>\n` +
        `<note>22–23 ἐλεᾶτε WH NA28 ] ἐλεεῖτε RP; ἐλέγχετε Treg</note>`,
    );
    const notes = parseApparatusBook(xml);
    expect(notes.get("JUD.1.22")?.[0]?.range).toBe("22–23");
  });

  test("a plain leading verse number is not mistaken for a range", () => {
    const xml = book("ΙΟΥΔΑ", `<verse>Jude 1:1</verse>\n<note>1 a WH ] b RP</note>`);
    const notes = parseApparatusBook(xml);
    expect(notes.get("JUD.1.1")?.[0]?.range).toBeNull();
  });
});

describe("mergeApparatus", () => {
  test("combines independent books without collision", () => {
    const jude = parseApparatusBook(book("ΙΟΥΔΑ", `<verse>Jude 1:1</verse>\n<note>1 a WH ] b RP</note>`));
    const john3 = parseApparatusBook(book("Γ ΙΩΑΝΟΥ", `<verse>3 John 1:1</verse>\n<note>1 c WH ] d RP</note>`));
    const merged = mergeApparatus([jude, john3]);
    expect([...merged.keys()].sort()).toEqual(["3JN.1.1", "JUD.1.1"]);
  });
});
