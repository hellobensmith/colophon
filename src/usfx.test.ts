import { describe, expect, test } from "bun:test";
import { parseUsfx, UnknownElementError } from "./usfx.ts";
import { EXPECTED_DROPPED } from "./expectations/asv.ts";

/**
 * A minimal document in the shape the real archive uses: milestone verses, text
 * as following siblings, words wrapped in Strong's elements.
 */
function document(body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?><usfx><languageCode>eng</languageCode>${body}</usfx>`;
}

const SIMPLE = document(
  `<book id="GEN"><id id="GEN">- Test</id><h>Genesis</h><toc level="1">Genesis</toc>` +
    `<c id="1" /><p style="p"><v id="1" bcv="GEN.1.1" /><w s="H1">In</w> the <w s="H2">beginning</w>.` +
    `<ve /></p></book>`,
);

describe("unknown elements stop the build", () => {
  test("an unclassified element throws rather than being absorbed", () => {
    const withNovelty = document(
      `<book id="GEN"><c id="1" /><p style="p"><v id="1" bcv="GEN.1.1" />` +
        `<wj>spoken</wj><ve /></p></book>`,
    ).replace("<wj>", "<sparkline>").replace("</wj>", "</sparkline>");
    expect(() => parseUsfx(withNovelty)).toThrow(UnknownElementError);
  });

  test("the error names the element and where it appeared", () => {
    const withNovelty = document(
      `<book id="JHN"><c id="3" /><p style="p"><v id="16" bcv="JHN.3.16" />` +
        `<redletter>loved</redletter><ve /></p></book>`,
    );
    try {
      parseUsfx(withNovelty);
      throw new Error("expected a failure");
    } catch (error) {
      expect(error).toBeInstanceOf(UnknownElementError);
      const unknown = error as UnknownElementError;
      expect(unknown.element).toBe("redletter");
      expect(unknown.location).toContain("JHN");
      expect(unknown.sample).toContain("redletter");
      // The message has to say what to do, not merely what happened.
      expect(unknown.message).toContain("ELEMENT_ROLES");
    }
  });

  /**
   * The failure this guards against is silent absorption: a future edition that
   * wrapped the divine name or the words of Jesus would otherwise flow through
   * as plain text with every count still correct and every test still green.
   */
  test("a wrapper around existing text cannot pass unnoticed", () => {
    const wrapped = SIMPLE.replace("<w s=\"H2\">beginning</w>", "<nd2>beginning</nd2>");
    expect(() => parseUsfx(wrapped)).toThrow(/nd2/);
  });

  test("the known corpus shape parses cleanly", () => {
    expect(parseUsfx(SIMPLE).verses).toHaveLength(1);
  });
});

describe("the coverage ledger", () => {
  const doc = parseUsfx(SIMPLE);
  const sum = (bucket: ReadonlyMap<string, number>): number =>
    [...bucket.values()].reduce((total, n) => total + n, 0);

  test("every source character is accounted for", () => {
    const { ledger } = doc;
    const accounted =
      sum(ledger.toVerses) +
      sum(ledger.toTitles) +
      sum(ledger.toSubscriptions) +
      sum(ledger.toNotes) +
      sum(ledger.dropped) +
      ledger.unattributed;
    expect(accounted).toBe(ledger.sourceCharacters);
  });

  test("document furniture is dropped rather than silently kept", () => {
    // The book id line, the running header and the TOC entry are not scripture.
    expect(doc.ledger.dropped.get("id")).toBeGreaterThan(0);
    expect(doc.ledger.dropped.get("h")).toBeGreaterThan(0);
    expect(doc.ledger.dropped.get("toc")).toBeGreaterThan(0);
    expect(doc.verses[0]!.text).not.toContain("Genesis");
  });

  test("it names the element that carried each run", () => {
    // "In" and "beginning" arrive inside <w>; " the " arrives bare inside <p>.
    expect(doc.ledger.toVerses.get("w")).toBeGreaterThan(0);
    expect(doc.ledger.toVerses.get("p")).toBeGreaterThan(0);
  });

  test("moving text to the wrong destination would shift two buckets", () => {
    // A superscription reached before any verse heads its chapter; one reached
    // afterwards closes it. The ledger distinguishes them, so a routing change
    // is visible as arithmetic rather than as a silently different artifact.
    const heading = parseUsfx(
      document(
        `<book id="PSA"><c id="3" /><d style="d">A Psalm of David.</d>` +
          `<p style="p"><v id="1" bcv="PSA.3.1" />Jehovah.<ve /></p></book>`,
      ),
    );
    expect(sum(heading.ledger.toTitles)).toBeGreaterThan(0);
    expect(sum(heading.ledger.toSubscriptions)).toBe(0);

    const closing = parseUsfx(
      document(
        `<book id="HAB"><c id="3" /><p style="p"><v id="1" bcv="HAB.3.1" />A prayer.<ve /></p>` +
          `<d style="d">For the Chief Musician.</d></book>`,
      ),
    );
    expect(sum(closing.ledger.toTitles)).toBe(0);
    expect(sum(closing.ledger.toSubscriptions)).toBeGreaterThan(0);
  });
});

describe("the lossy inventory is a fixed expectation", () => {
  test("every dropped element has a declared character count", () => {
    for (const [element, count] of EXPECTED_DROPPED) {
      expect(typeof element).toBe("string");
      expect(count).toBeGreaterThan(0);
    }
  });
});
