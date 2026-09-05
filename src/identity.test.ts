import { describe, expect, test } from "bun:test";
import {
  canonicalJson,
  deriveGenerationId,
  deriveRevisionId,
  sha256,
  type GenerationManifest,
} from "./identity.ts";
import { REVISION_ID, GENERATION_ID, EDITION_ID } from "./data/meta.ts";

const MANIFEST: GenerationManifest = {
  schemaVersion: 1,
  parserVersion: 3,
  normalizationPolicyVersion: 2,
  canonicalMetadataVersion: 2,
  editionId: "eng-asv",
  revisionId: "a".repeat(64),
  sourceArchive: { url: "https://example.test/x.zip", sha256: "a".repeat(64), byteLength: 100 },
  artifacts: [{ name: "text.ts", sha256: "b".repeat(64), byteLength: 10 }],
  corpus: { verses: 31102, books: 66, superscriptions: 116, subscriptions: 1, notes: 16 },
};

describe("canonical serialization", () => {
  test("key order cannot change the bytes", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  test("sorts nested objects too", () => {
    expect(canonicalJson({ z: { y: 1, x: 2 } })).toBe('{"z":{"x":2,"y":1}}');
  });

  test("preserves array order, which is meaningful", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
  });

  test("drops undefined rather than emitting it", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe("the identity split", () => {
  test("identical input yields an identical generation", async () => {
    expect(await deriveGenerationId(MANIFEST)).toBe(await deriveGenerationId({ ...MANIFEST }));
  });

  test("key order does not reach the hash", async () => {
    const reordered: Record<string, unknown> = {};
    for (const key of Object.keys(MANIFEST).reverse()) {
      reordered[key] = (MANIFEST as unknown as Record<string, unknown>)[key];
    }
    expect(await deriveGenerationId(reordered as unknown as GenerationManifest)).toBe(
      await deriveGenerationId(MANIFEST),
    );
  });

  /**
   * The reason both identities exist. A corrected genre label must retire every
   * cached response while leaving anything anchored to the text alone.
   */
  test("a metadata-only change moves the generation but not the revision", async () => {
    const corrected = { ...MANIFEST, canonicalMetadataVersion: 3 };
    expect(await deriveGenerationId(corrected)).not.toBe(await deriveGenerationId(MANIFEST));
    expect(deriveRevisionId(corrected.sourceArchive)).toBe(
      deriveRevisionId(MANIFEST.sourceArchive),
    );
  });

  test("a change to any published artifact moves the generation", async () => {
    const republished = {
      ...MANIFEST,
      artifacts: [{ name: "text.ts", sha256: "c".repeat(64), byteLength: 11 }],
    };
    expect(await deriveGenerationId(republished)).not.toBe(await deriveGenerationId(MANIFEST));
  });

  test("new source moves both", async () => {
    const archive = { ...MANIFEST.sourceArchive, sha256: "d".repeat(64) };
    const republished = { ...MANIFEST, revisionId: deriveRevisionId(archive), sourceArchive: archive };
    expect(await deriveGenerationId(republished)).not.toBe(await deriveGenerationId(MANIFEST));
    expect(deriveRevisionId(archive)).not.toBe(deriveRevisionId(MANIFEST.sourceArchive));
  });

  test("the revision is a property of the source, not of the build", () => {
    // Nothing about parser or metadata versions may reach it.
    expect(deriveRevisionId(MANIFEST.sourceArchive)).toBe(MANIFEST.sourceArchive.sha256);
  });
});

describe("the generated identity", () => {
  test("both ids are full SHA-256 hex", () => {
    expect(REVISION_ID).toMatch(/^[0-9a-f]{64}$/);
    expect(GENERATION_ID).toMatch(/^[0-9a-f]{64}$/);
  });

  test("they are not the same value", () => {
    expect(GENERATION_ID).not.toBe(REVISION_ID);
  });

  test("the edition is stated", () => {
    expect(EDITION_ID).toBe("eng-asv");
  });
});

describe("hashing", () => {
  test("matches the known SHA-256 of the empty string", async () => {
    expect(await sha256("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  test("matches the known SHA-256 of \"abc\"", async () => {
    expect(await sha256("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
