import { describe, expect, test } from "bun:test";
import { PROBES } from "./probes.ts";
import { BOOKS, book } from "./books.ts";
import type { Adapter, Capability, NormalizedVerse, Outcome } from "./types.ts";

/* ------------------------------------------------------------------ *
 * Synthetic adapters. No network: these exist to prove the probes
 * classify behaviour correctly, including behaviour no real API exhibits.
 * ------------------------------------------------------------------ */

function outcome(status: number, verses: NormalizedVerse[], raw: unknown = null): Outcome {
  return { status, verses, raw: raw ?? { verses }, transportError: null, fromCache: true };
}

function verse(book: string, chapter: number, verseNumber: number, text: string): NormalizedVerse {
  return { book, chapter, verse: verseNumber, text };
}

interface FakeOptions {
  readonly capabilities?: Capability[];
  readonly resolve?: (reference: string) => Outcome;
  readonly verse?: (book: string, chapter: number, verse: number) => Outcome;
  readonly chapter?: (book: string, chapter: number) => Outcome;
  readonly describe?: () => Outcome;
  readonly edition?: string;
}

function fake(options: FakeOptions): Adapter {
  return {
    id: "fake",
    name: "fake",
    homepage: "https://example.test",
    edition: options.edition ?? "asv",
    capabilities: new Set(options.capabilities ?? ["freeform-reference", "structured-verse"]),
    ...(options.resolve ? { resolve: async (r: string) => options.resolve!(r) } : {}),
    ...(options.verse ? { verse: async (b: string, c: number, v: number) => options.verse!(b, c, v) } : {}),
    ...(options.chapter ? { chapter: async (b: string, c: number) => options.chapter!(b, c) } : {}),
    ...(options.describe ? { describe: async () => options.describe!() } : {}),
  };
}

const probe = (id: string) => {
  const found = PROBES.find((p) => p.id === id);
  if (found === undefined) throw new Error(`no probe ${id}`);
  return found;
};

describe("the book table is derived, not typed", () => {
  test("covers the Protestant canon in canonical order", () => {
    expect(BOOKS).toHaveLength(66);
    expect(BOOKS[0]!.usfm).toBe("GEN");
    expect(BOOKS[65]!.usfm).toBe("REV");
    expect(BOOKS.every((b, index) => b.ordinal === index + 1)).toBe(true);
  });

  test("ordinals match the numbering the structured APIs use", () => {
    // Confirmed against bolls.life, rkeplin and getbible, which all address
    // John as book 43.
    expect(book("JHN").ordinal).toBe(43);
    expect(book("PSA").ordinal).toBe(19);
    expect(book("MAT").ordinal).toBe(40);
  });
});

describe("probes distinguish refusal from a wrong answer", () => {
  test("an ambiguous reference refused is safe", async () => {
    const adapter = fake({
      resolve: () => outcome(400, [], { detail: 'Ambiguous "Jo": Job, Joel, John, Jonah, Joshua' }),
    });
    const result = await probe("ambiguous-abbreviation").run(adapter);
    expect(result.verdict).toBe("safe");
    expect(result.summary).toContain("candidates");
  });

  test("an ambiguous reference silently resolved is unsafe", async () => {
    const adapter = fake({
      resolve: () => outcome(200, [verse("JHN", 3, 16, "For God so loved…")]),
    });
    const result = await probe("ambiguous-abbreviation").run(adapter);
    expect(result.verdict).toBe("unsafe");
    expect(result.summary).toContain("JHN");
  });

  /** The finding that motivated the whole suite. */
  test("substituting a different verse under 200 is unsafe", async () => {
    const adapter = fake({
      resolve: () => outcome(200, [verse("JHN", 3, 1, "Now there was a man of the Pharisees…")]),
    });
    const result = await probe("verse-out-of-range").run(adapter);
    expect(result.verdict).toBe("unsafe");
    expect(result.summary).toContain("returned verse 1");
  });

  test("refusing an out-of-range verse is safe, and stating the length is noted", async () => {
    const adapter = fake({ resolve: () => outcome(404, [], { detail: "John 3 only has 36 verses" }) });
    const result = await probe("verse-out-of-range").run(adapter);
    expect(result.verdict).toBe("safe");
    expect(result.summary).toContain("real length");
  });

  test("an empty 200 is divergent, not unsafe — nothing wrong was asserted", async () => {
    const adapter = fake({ resolve: () => outcome(200, []) });
    expect((await probe("verse-out-of-range").run(adapter)).verdict).toBe("divergent");
  });
});

describe("probes do not overstate a finding", () => {
  /**
   * labs.bible.org answers `Jude 5` with the whole book. That is a different
   * fault from returning a different single verse, and an earlier version of
   * this probe conflated the two.
   */
  test("returning a whole book is divergent, not unsafe", async () => {
    const wholeBook = Array.from({ length: 25 }, (_, i) => verse("JUD", 1, i + 1, `verse ${i + 1}`));
    const adapter = fake({
      resolve: (reference) =>
        reference === "Jude 5" ? outcome(200, wholeBook) : outcome(200, [verse("JUD", 1, 5, "verse 5")]),
    });
    const result = await probe("single-chapter-book").run(adapter);
    expect(result.verdict).toBe("divergent");
    expect(result.summary).toContain("whole book");
  });

  test("two forms returning genuinely different single verses is unsafe", async () => {
    const adapter = fake({
      resolve: (reference) =>
        reference === "Jude 5"
          ? outcome(200, [verse("JUD", 1, 1, "first verse")])
          : outcome(200, [verse("JUD", 1, 5, "fifth verse")]),
    });
    expect((await probe("single-chapter-book").run(adapter)).verdict).toBe("unsafe");
  });

  test("an adapter that cannot be asked records not-applicable, never a defect", async () => {
    const adapter = fake({ capabilities: ["structured-verse"], verse: () => outcome(200, []) });
    const result = await probe("ambiguous-abbreviation").run(adapter);
    expect(result.verdict).toBe("not-applicable");
  });
});

describe("textual-integrity probes", () => {
  test("a superscription folded into verse 1 is unsafe", async () => {
    const adapter = fake({
      verse: () => outcome(200, [verse("PSA", 23, 1, "A Psalm of David. Jehovah is my shepherd")]),
    });
    const result = await probe("psalm-superscription").run(adapter);
    expect(result.verdict).toBe("unsafe");
  });

  test("a heading served separately earns credit", async () => {
    const adapter = fake({
      verse: () => outcome(200, [verse("PSA", 23, 1, "Jehovah is my shepherd; I shall not want.")]),
      chapter: () => outcome(200, [], { descriptive_title: "A Psalm of David.", verses: [] }),
    });
    const result = await probe("psalm-superscription").run(adapter);
    expect(result.verdict).toBe("safe");
    expect(result.summary).toContain("separately");
  });

  test("a heading neither folded in nor offered is divergent", async () => {
    const adapter = fake({
      verse: () => outcome(200, [verse("PSA", 23, 1, "Jehovah is my shepherd; I shall not want.")]),
    });
    expect((await probe("psalm-superscription").run(adapter)).verdict).toBe("divergent");
  });

  test("markup inside verse text is unsafe when the edition does not declare it", async () => {
    const adapter = fake({
      verse: () => outcome(200, [verse("JHN", 3, 16, "For<S>1063</S> God<S>2316</S> so loved")]),
    });
    const result = await probe("markup-leakage").run(adapter);
    expect(result.verdict).toBe("unsafe");
    expect(result.summary).toContain("markup");
  });

  /**
   * bolls.life offers the ASV only as "American Standard Version 1901 (with
   * Strong's numbers)". An earlier run reported its markup as leakage, which
   * would have meant emailing a maintainer to complain that the feature they
   * advertise is present. An edition that declares markup is not judged on it.
   */
  test("a declared markup edition is not judged for containing markup", async () => {
    const adapter = fake({
      verse: () => outcome(200, [verse("JHN", 3, 16, "For<S>1063</S> God<S>2316</S> so loved")]),
    });
    const declared: Adapter = { ...adapter, textCarriesMarkup: true };
    const result = await probe("markup-leakage").run(declared);
    expect(result.verdict).toBe("not-applicable");
    expect(result.summary).toContain("declares");
  });

  test("a superscription delimited by markup is divergent, not unsafe", async () => {
    const adapter = fake({
      verse: () =>
        outcome(200, [verse("PSA", 23, 1, "<sup>A Psalm of David.</sup> Jehovah is my shepherd")]),
    });
    const result = await probe("psalm-superscription").run(adapter);
    expect(result.verdict).toBe("divergent");
    expect(result.summary).toContain("delimited");
  });

  test("losing the ASV's divine name is unsafe", async () => {
    const adapter = fake({ verse: () => outcome(200, [verse("EXO", 6, 3, "I am the LORD")]) });
    expect((await probe("divine-name").run(adapter)).verdict).toBe("unsafe");
  });

  test("the divine-name probe does not judge a different edition", async () => {
    const adapter = fake({
      edition: "net",
      verse: () => outcome(200, [verse("EXO", 6, 3, "I am the LORD")]),
    });
    expect((await probe("divine-name").run(adapter)).verdict).toBe("not-applicable");
  });

  /**
   * No agreed convention exists for a verse the translation omits, so every
   * implementation records divergent — including this project's. A suite whose
   * author scores best on an unsettled question is worthless.
   */
  test("every treatment of an omitted verse is divergent", async () => {
    const bracketed = fake({ verse: () => outcome(200, [verse("MAT", 17, 21, "[But this kind…]")]) });
    const empty = fake({ verse: () => outcome(200, [verse("MAT", 17, 21, "")]) });
    const refused = fake({ verse: () => outcome(404, []) });
    for (const adapter of [bracketed, empty, refused]) {
      expect((await probe("omitted-verse").run(adapter)).verdict).toBe("divergent");
    }
  });
});

describe("suite integrity", () => {
  test("every probe declares a rationale and at least one capability", () => {
    for (const p of PROBES) {
      expect(p.rationale.length).toBeGreaterThan(40);
      expect(p.requires.length).toBeGreaterThan(0);
      expect(p.title.length).toBeGreaterThan(0);
    }
  });

  test("probe ids are unique", () => {
    expect(new Set(PROBES.map((p) => p.id)).size).toBe(PROBES.length);
  });

  test("a transport failure never becomes a finding", async () => {
    const adapter = fake({
      resolve: () => ({ status: 0, verses: [], raw: null, transportError: "ECONNRESET", fromCache: false }),
    });
    const result = await probe("ambiguous-abbreviation").run(adapter);
    expect(result.verdict).toBe("unreachable");
  });

  test("an adapter that throws is a suite bug, not an API finding", async () => {
    const thrower: Adapter = {
      id: "thrower",
      name: "thrower",
      homepage: "https://example.test",
      edition: "asv",
      capabilities: new Set<Capability>(["freeform-reference"]),
      resolve: () => {
        throw new Error("adapter is broken");
      },
    };
    await expect(probe("ambiguous-abbreviation").run(thrower)).rejects.toThrow("adapter is broken");
    // run.ts catches this and records `unreachable`; the probe itself must not
    // swallow it, or a broken adapter would masquerade as a clean result.
  });
});
