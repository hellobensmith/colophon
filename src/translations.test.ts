import { describe, expect, test } from "bun:test";
import {
  DEFAULT_TRANSLATION,
  TRANSLATIONS,
  TRANSLATION_IDS,
  UnknownTranslationError,
  isTranslation,
  resolveTranslation,
} from "./translations.ts";

describe("the translation registry", () => {
  test("serves the ASV by default", () => {
    expect(DEFAULT_TRANSLATION).toBe("asv");
    expect(resolveTranslation(undefined).meta.id).toBe("asv");
    expect(resolveTranslation("asv").meta.id).toBe("asv");
  });

  test("every registered translation is keyed by its own id", () => {
    for (const [id, translation] of TRANSLATIONS) {
      expect(translation.meta.id).toBe(id);
      expect(translation.meta.name.length).toBeGreaterThan(0);
      expect(translation.meta.year).toBeGreaterThan(1000);
      expect(translation.source.url).toStartWith("https://");
    }
    expect(TRANSLATION_IDS).toContain(DEFAULT_TRANSLATION);
  });

  /**
   * The failure this guards against is the one the conformance suite records
   * against other Scripture APIs: a request the server cannot satisfy answered
   * with a plausible wrong result instead of an error. Falling back to the
   * default here would hand a caller a different Bible than the one they asked
   * for, and nothing in the response would say so.
   */
  test("an unknown translation is refused, never quietly defaulted", () => {
    for (const bad of ["kjv", "ASV", "", "esv", "__proto__"]) {
      expect(() => resolveTranslation(bad)).toThrow(UnknownTranslationError);
    }
    expect(isTranslation("kjv")).toBe(false);
    expect(isTranslation("asv")).toBe(true);
  });

  test("the refusal names what this deployment does serve", () => {
    // A caller must be able to recover without reading the docs.
    try {
      resolveTranslation("vulgate");
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(UnknownTranslationError);
      const message = (error as Error).message;
      expect(message).toContain("vulgate");
      for (const id of TRANSLATION_IDS) expect(message).toContain(id);
    }
  });

  test("registry metadata matches what the corpus was built from", async () => {
    // The registry is descriptive, so it must not drift from the real source.
    const asv = resolveTranslation("asv");
    const build = await Bun.file(
      new URL("../scripts/build-data.ts", import.meta.url).pathname,
    ).text();
    expect(build).toContain(asv.source.url);
  });
});
