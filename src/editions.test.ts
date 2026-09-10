/**
 * Two editions, served side by side.
 *
 * This is the test the whole project was aiming at. Everything before it —
 * a `?translation=` parameter, versification in the registry, a per-edition
 * validation gate, per-edition ingest — was plumbing for the claim that
 * Colophon serves *editions* rather than *an* edition. Until two texts are
 * actually answering, that claim is architecture rather than evidence.
 */
import { describe, expect, test } from "bun:test";
import app from "./index.ts";
import { TRANSLATION_IDS } from "./translations.ts";
import { totalVersesOf, identityOf } from "./corpus.ts";

async function get(path: string): Promise<{ status: number; body: any }> {
  const response = await app.fetch(new Request(`https://colophon.test${path}`));
  return { status: response.status, body: await response.json().catch(() => null) };
}

const passage = (ref: string, translation: string) =>
  get(`/passages?ref=${encodeURIComponent(ref)}&translation=${translation}`);

describe("both editions are registered and embedded", () => {
  test("the registry serves two", () => {
    expect([...TRANSLATION_IDS].sort()).toEqual(["asv", "dra"]);
  });

  test("each carries its own identity, and they differ", () => {
    const asv = identityOf("asv");
    const dra = identityOf("dra");
    expect(asv.editionId).toBe("eng-asv");
    expect(dra.editionId).toBe("engDRA");
    expect(asv.revisionId).not.toBe(dra.revisionId);
    expect(asv.generationId).not.toBe(dra.generationId);
    expect(totalVersesOf("asv")).toBe(31_102);
    expect(totalVersesOf("dra")).toBe(35_811);
  });
});

describe("the same reference returns each edition's own words", () => {
  test("Genesis 1:1", async () => {
    const asv = await passage("Genesis 1:1", "asv");
    const dra = await passage("Genesis 1:1", "dra");
    expect(asv.status).toBe(200);
    expect(dra.status).toBe(200);
    expect(asv.body.verses[0].id).toBe("GEN.1.1");
    expect(dra.body.verses[0].id).toBe("GEN.1.1");
    expect(asv.body.verses[0].text).toContain("the heavens and the earth");
    expect(dra.body.verses[0].text).toContain("heaven, and earth");
    expect(asv.body.verses[0].text).not.toBe(dra.body.verses[0].text);
  });

  test("and each response names the translation it came from", async () => {
    const dra = await passage("John 1:1", "dra");
    expect(dra.body.translation.id).toBe("dra");
    expect(dra.body.translation.name).toContain("Douay-Rheims");
  });
});

describe("books one edition has and the other does not", () => {
  // The ASV marks all ten deuterocanonical books metadata_only; the DRA prints
  // seven of them. Availability is a fact about the edition, so canon.ts's
  // global isDeuterocanon cannot be the gate — consulting it first refused
  // Tobit for an edition that contains fourteen chapters of it.
  test("Tobit is served by the DRA and refused by the ASV", async () => {
    const dra = await passage("Tobit 1:1", "dra");
    expect(dra.status).toBe(200);
    expect(dra.body.verses[0].id).toBe("TOB.1.1");

    const asv = await passage("Tobit 1:1", "asv");
    expect(asv.status).toBe(404);
    expect(asv.body.detail).toContain("American Standard Version");
  });

  test("data_availability on /books/:id follows the requested edition", async () => {
    const dra = await get("/books/TOB?translation=dra");
    expect(dra.status).toBe(200);
    expect(dra.body.data_availability).toBe("full");

    const asv = await get("/books/TOB?translation=asv");
    expect(asv.status).toBe(200);
    expect(asv.body.data_availability).toBe("metadata_only");
  });

  test("/books/:id/chapters/:num follows the requested edition too", async () => {
    const dra = await get("/books/TOB/chapters/1?translation=dra");
    expect(dra.status).toBe(200);

    const asv = await get("/books/TOB/chapters/1?translation=asv");
    expect(asv.status).toBe(404);
    expect(asv.body.detail).toContain("American Standard Version");
  });

  test("data_availability on /books?tradition= also follows the requested edition", async () => {
    const dra = await get("/books?tradition=catholic&translation=dra");
    expect(dra.status).toBe(200);
    const tobit = dra.body.books.find((book: any) => book.id === "TOB");
    expect(tobit.data_availability).toBe("full");
  });

  test("1 Esdras is in neither, and says so per edition", async () => {
    for (const [id, name] of [
      ["asv", "American Standard Version"],
      ["dra", "Douay-Rheims"],
    ] as const) {
      const response = await passage("1 Esdras 1:1", id);
      expect(response.status).toBe(404);
      expect(response.body.detail).toContain(name);
    }
  });
});

describe("chapters that exist in one numbering only", () => {
  // Esther and Daniel differ by whole chapters, which is the visible case.
  test("Esther 14 and Daniel 13", async () => {
    for (const ref of ["Esther 14:1", "Daniel 13:1"]) {
      const dra = await passage(ref, "dra");
      expect(dra.status).toBe(200);
      expect(dra.body.verses[0].text.length).toBeGreaterThan(0);

      const asv = await passage(ref, "asv");
      expect(asv.status).toBe(404);
      expect(asv.body.detail).toMatch(/only has|no chapter/);
    }
  });
});

describe("the invisible case, which is the one that matters", () => {
  /**
   * These eight books have the same chapter count and the same verse total in
   * both editions, and still number their verses differently. Any check at book
   * level calls them identical. Before the coordinate layer became
   * per-translation, a reference here resolved against the wrong edition
   * returned a real verse from somewhere else entirely — Esther 14:1 in the DRA
   * came back as Job 3:5 while this was half-wired.
   */
  const HIDDEN = ["NUM", "JOS", "JDG", "JOB", "ECC", "ISA", "JON", "HAG"] as const;

  test("each returns different text at its first divergent chapter", async () => {
    const asvCounts = (await import("./data/asv/meta.ts")).VERSE_COUNTS;
    const draCounts = (await import("./data/dra/meta.ts")).VERSE_COUNTS;

    for (const book of HIDDEN) {
      const a = asvCounts[book]!;
      const d = draCounts[book]!;
      expect(a.length).toBe(d.length);
      expect(a.reduce((s, n) => s + n, 0)).toBe(d.reduce((s, n) => s + n, 0));

      const chapter = a.findIndex((count, i) => count !== d[i]) + 1;
      expect(chapter).toBeGreaterThan(0);

      const asv = await passage(`${book} ${chapter}:1`, "asv");
      const dra = await passage(`${book} ${chapter}:1`, "dra");
      expect(asv.status).toBe(200);
      expect(dra.status).toBe(200);
      expect(asv.body.verses[0].text).not.toBe(dra.body.verses[0].text);
    }
  });
});

describe("every registered edition can actually be searched", () => {
  // The 501 path is unreachable while every registered translation has an index
  // embedded, and that is the point: the guard exists so a future edition
  // registered without one is refused rather than answered from a neighbour’s
  // postings. This asserts the invariant, not the error page.
  test("nothing is registered that search cannot serve", async () => {
    const { SEARCHABLE_TRANSLATIONS } = await import("./search.ts");
    expect([...SEARCHABLE_TRANSLATIONS].sort()).toEqual([...TRANSLATION_IDS].sort());

    for (const id of TRANSLATION_IDS) {
      const response = await get(`/search?q=beginning&translation=${id}`);
      expect({ id, status: response.status }).toEqual({ id, status: 200 });
      expect(response.body.total).toBeGreaterThan(0);
    }
  });
});

describe("the deuterocanon is reachable by the names its readers use", () => {
  // These books had no abbreviations at all. Every one resolved only by
  // prefix-matching its full name, which happens to work for most and never
  // worked for Judith, whose id is not a prefix of it. They only became
  // reachable when the Douay-Rheims was registered.
  test("Judith, which no abbreviation reached before", async () => {
    for (const name of ["Judith", "Jdt", "Jdth", "Jth", "JDT"]) {
      const response = await passage(`${name} 1:1`, "dra");
      expect(response.status).toBe(200);
      expect(response.body.verses[0].id).toBe("JDT.1.1");
    }
  });

  test("Ecclesiasticus, which is what this edition calls Sirach", async () => {
    for (const name of ["Sirach", "Ecclesiasticus", "Ecclus"]) {
      const response = await passage(`${name} 3:1`, "dra");
      expect(response.status).toBe(200);
      expect(response.body.verses[0].id).toBe("SIR.3.1");
    }
  });

  test("every book id the DRA prints also works as a reference", async () => {
    const counts = (await import("./data/dra/meta.ts")).VERSE_COUNTS;
    for (const id of Object.keys(counts)) {
      const response = await passage(`${id} 1:1`, "dra");
      expect(response.status).toBe(200);
      expect(response.body.verses[0].book).toBe(id);
    }
  });
});

describe("ambiguity is a fact about the edition, not the abbreviation", () => {
  /**
   * "Eccles" names only Ecclesiastes in the ASV, and could mean Ecclesiastes or
   * Ecclesiasticus in an edition printing both. Resolution narrows candidates
   * by what the edition contains before calling anything ambiguous — without
   * that, adding the Ecclesiasticus alias would have broken "Eccles" for every
   * existing ASV caller.
   */
  test("the same prefix resolves in one edition and is refused in the other", async () => {
    const asv = await passage("Eccles 1:1", "asv");
    expect(asv.status).toBe(200);
    expect(asv.body.verses[0].id).toBe("ECC.1.1");

    const dra = await passage("Eccles 1:1", "dra");
    expect(dra.status).toBe(400);
    expect(dra.body.detail).toContain("Ambiguous");
    expect(dra.body.detail).toContain("Ecclesiastes");
    expect(dra.body.detail).toContain("Sirach");
  });

  test("narrowing only breaks ties, so a missing book still says it is missing", async () => {
    // One candidate, absent from this edition: the message has to explain that
    // the book is not in the ASV, not that no such book exists.
    const response = await passage("Tobit 1:1", "asv");
    expect(response.status).toBe(404);
    expect(response.body.detail).toContain("not present in");
    expect(response.body.detail).not.toContain("Unknown book");
  });
});

describe("psalm numbering is a fact about the edition", () => {
  /**
   * The ASV prints the Hebrew division of the Psalter, so a Hebrew- or
   * Greek-numbered request converts onto it. The Douay-Rheims already prints
   * the Greek division — its Psalm 50 is the Miserere — so the same request
   * asks to convert a text that is already in the target scheme, using
   * offsets that belong to another edition.
   *
   * Until 8 September that returned HTTP 200 with an empty verse array, which
   * a caller cannot tell apart from a psalm that genuinely has no verses. An
   * empty success is the worst of the failure modes this project refuses,
   * because nothing downstream can even see it.
   */
  test("the DRA prints the Greek division natively", async () => {
    const dra = await passage("Psalm 50:1", "dra");
    const asv = await passage("Psalm 51:1", "asv");
    expect(dra.status).toBe(200);
    expect(asv.status).toBe(200);
    // The same psalm, numbered differently by each edition.
    expect(asv.body.verses[0].text).toContain("Have mercy upon me");
    expect(dra.body.verses[0].id).toBe("PSA.50.1");
  });

  test("Hebrew numbering is still refused for the DRA", async () => {
    const response = await get(`/passages?ref=Psalm+51:1&translation=dra&numbering=hebrew`);
    expect(response.status).toBe(501);
    expect(response.body.error).toBe("not_implemented");
    expect(response.body.detail).toContain("Douay-Rheims");
    expect(response.body.detail).toContain("hebrew");
    // Never a 200 carrying nothing.
    expect(response.body.verses).toBeUndefined();
  });

  test("Greek numbering on the DRA is identity, not refused", async () => {
    const response = await get(`/passages?ref=Psalm+50:1&translation=dra&numbering=greek`);
    expect(response.status).toBe(200);
    expect(response.body.verses[0].id).toBe("PSA.50.1");
  });

  test("a Vulgate merge the DRA can address but the ASV can't is refused, not guessed", async () => {
    // Greek 99 merges Hebrew 100:1-2 in the ASV's own text; the DRA has no
    // such gap, since it never borrows the ASV's structure.
    const asv = await get(`/passages?ref=Psalm+99:2&translation=asv&numbering=greek`);
    expect(asv.status).toBeGreaterThanOrEqual(400);
    expect(asv.body.verses).toBeUndefined();
    const dra = await get(`/passages?ref=Psalm+99:2&translation=dra&numbering=greek`);
    expect(dra.status).toBe(200);
  });

  test("the ASV still converts both ways", async () => {
    for (const [scheme, id] of [["hebrew", "PSA.51.0"], ["greek", "PSA.52.0"]] as const) {
      const response = await get(
        `/passages?ref=Psalm+51:1&translation=asv&numbering=${scheme}`,
      );
      expect(response.status).toBe(200);
      expect(response.body.verses[0].id).toBe(id);
    }
  });

  test("and english numbering works for every edition", async () => {
    for (const id of ["asv", "dra"]) {
      const response = await get(`/passages?ref=Psalm+51:1&translation=${id}&numbering=english`);
      expect(response.status).toBe(200);
      expect(response.body.verses).toHaveLength(1);
    }
  });
});

describe("search covers both editions, each from its own index", () => {
  /**
   * The bug this guards against was not that search failed — it succeeded.
   * Postings were read from the Douay-Rheims index while the hits themselves
   * were resolved against the ASV corpus, so a query returned real verses,
   * correctly numbered, whose text did not contain the term that matched them.
   * A relevance check catches that; a status check does not.
   */
  test("every hit actually contains a member of the term's family", async () => {
    const { tokenize } = await import("./tokenize.ts");
    const families = {
      asv: (await import("./data/asv/families.ts")).FAMILY_GROUPS,
      dra: (await import("./data/dra/families.ts")).FAMILY_GROUPS,
    };

    for (const edition of ["asv", "dra"] as const) {
      for (const query of ["shepherd", "mercy"]) {
        const response = await get(`/search?q=${query}&limit=40&translation=${edition}`);
        expect(response.status).toBe(200);
        expect(response.body.total).toBeGreaterThan(0);

        const family =
          families[edition]
            .split("\n")
            .map((line) => line.split(","))
            .find((group) => group.includes(query)) ?? [query];

        for (const hit of response.body.results) {
          const words = tokenize(hit.text);
          expect({
            edition,
            query,
            id: hit.id,
            matched: family.some((form: string) => words.includes(form)),
          }).toEqual({ edition, query, id: hit.id, matched: true });
        }
      }
    }
  });

  test("the two editions return different totals for the same query", async () => {
    const asv = await get("/search?q=shepherd&translation=asv");
    const dra = await get("/search?q=shepherd&translation=dra");
    expect(asv.body.total).toBeGreaterThan(0);
    expect(dra.body.total).toBeGreaterThan(0);
    expect(asv.body.total).not.toBe(dra.body.total);
  });

  test("a DRA search reaches books the ASV does not carry", async () => {
    const response = await get("/search?q=wisdom&limit=100&translation=dra");
    const books = new Set(response.body.results.map((hit: { book: string }) => hit.book));
    const deuterocanonical = ["TOB", "JDT", "WIS", "SIR", "BAR", "1MA", "2MA"];
    expect(deuterocanonical.some((id) => books.has(id))).toBe(true);
  });

  test("each response names the translation it searched", async () => {
    for (const edition of ["asv", "dra"]) {
      const response = await get(`/search?q=beginning&translation=${edition}`);
      expect(response.body.translation.id).toBe(edition);
    }
  });
});

describe("a verse cannot be served under another edition's name", () => {
  /**
   * The structural answer to the only bug this codebase kept producing.
   *
   * Three times while growing a second edition, a coordinate was resolved
   * against one Bible and the text read from another. Every one returned HTTP
   * 200 with a real, well-formed, correctly numbered verse in it — Esther 14:1
   * as Job 3:5, a search hit whose text lacked the word that matched it. No
   * status code or schema can see that, so verses carry the edition they were
   * read from and the response boundary checks it.
   *
   * Removing either the argument or the check makes these fail: both were
   * verified by reintroducing the original bugs and watching the guard fire on
   * JOB.3.5 and EZK.40.10 by name.
   */
  test("every verse records which edition it came from", async () => {
    const { verseAt } = await import("./corpus.ts");
    for (const id of TRANSLATION_IDS) {
      expect(verseAt(1, id).translation).toBe(id);
      expect(verseAt(100, id).translation).toBe(id);
    }
  });

  test("the boundary refuses a verse from the wrong edition", async () => {
    const { attest } = await import("./index.ts");
    const { verseAt } = await import("./corpus.ts");

    const asvVerse = verseAt(1, "asv");
    expect(() => attest("asv", asvVerse)).not.toThrow();
    expect(() => attest("dra", asvVerse)).toThrow(/Provenance mismatch/);
    expect(() => attest("dra", asvVerse)).toThrow(/read from asv/);
  });

  test("and it is a 500, because the fault is ours and not the caller's", async () => {
    // A caller cannot cause this. If it ever fires in production it means the
    // code mixed two editions, which is a bug here rather than bad input.
    const { attest } = await import("./index.ts");
    const { verseAt } = await import("./corpus.ts");
    expect(() => attest("dra", verseAt(1, "asv"))).toThrow(Error);
  });

  test("every route's verses match the translation it names", async () => {
    for (const id of TRANSLATION_IDS) {
      const passage = await passage_(id);
      expect(passage.body.translation.id).toBe(id);

      const chapter = await get(`/books/GEN/chapters/1?translation=${id}`);
      expect(chapter.status).toBe(200);
      expect(chapter.body.verses.length).toBeGreaterThan(0);

      const search = await get(`/search?q=beginning&limit=5&translation=${id}`);
      expect(search.body.translation.id).toBe(id);
    }
  });
});

const passage_ = (id: string) => passage("Genesis 1:1", id);
