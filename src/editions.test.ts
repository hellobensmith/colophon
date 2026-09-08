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
  // global dataAvailability cannot be the gate — consulting it first refused
  // Tobit for an edition that contains fourteen chapters of it.
  test("Tobit is served by the DRA and refused by the ASV", async () => {
    const dra = await passage("Tobit 1:1", "dra");
    expect(dra.status).toBe(200);
    expect(dra.body.verses[0].id).toBe("TOB.1.1");

    const asv = await passage("Tobit 1:1", "asv");
    expect(asv.status).toBe(404);
    expect(asv.body.detail).toContain("American Standard Version");
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

describe("what is not per-translation yet says so", () => {
  // The inverted index covers one edition. Answering from it under another
  // translation's name would be the silent wrong answer, so the route declines.
  test("search refuses a translation it has no index for", async () => {
    const dra = await get("/search?q=beginning&translation=dra");
    expect(dra.status).toBe(501);
    expect(dra.body.error).toBe("not_implemented");
    expect(dra.body.detail).toContain("asv");

    const asv = await get("/search?q=beginning&translation=asv");
    expect(asv.status).toBe(200);
    expect(asv.body.total).toBeGreaterThan(0);
  });
});
