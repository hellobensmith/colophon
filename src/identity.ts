/**
 * Three identities, kept separate on purpose.
 *
 * | Identity       | Answers                          | Moves when                    |
 * |----------------|----------------------------------|-------------------------------|
 * | `editionId`    | which text                       | never, for this project       |
 * | `revisionId`   | which revision of that text      | eBible republishes the source |
 * | `generationId` | which published set of artifacts | anything published changes    |
 *
 * The distinction only ever costs something the day it is missing. Correcting a
 * canon date or a genre label changes what this API publishes, so every cached
 * response should be retired — `generationId` moves and they are. But the text
 * did not change, so anything anchored to the text should survive — `revisionId`
 * does not move, so it does. A single identifier gets exactly one of those two
 * right, and which one it gets wrong is discovered much later.
 *
 * v1 stores no anchors. The reason to draw the line now is that anchors are the
 * one thing that cannot be repaired afterwards: once a reader has saved a
 * highlight against an identifier, the meaning of that identifier is fixed.
 */

/** Bump when the shape of the generated data modules changes. */
export const SCHEMA_VERSION = 1;

/** Bump when the parser's output for identical input would change. */
export const PARSER_VERSION = 3;

/**
 * Bump when normalization changes what the text says: whitespace collapsing,
 * entity decoding, the Selah bracket repair, superscription routing.
 */
export const NORMALIZATION_POLICY_VERSION = 2;

/** Bump when canon ordering, book metadata, or genre vocabulary changes. */
export const CANONICAL_METADATA_VERSION = 2;

export const EDITION_ID = "eng-asv";

export interface SourceArchive {
  readonly url: string;
  readonly sha256: string;
  readonly byteLength: number;
}

export interface ArtifactRecord {
  readonly name: string;
  readonly sha256: string;
  readonly byteLength: number;
}

export interface GenerationManifest {
  readonly schemaVersion: number;
  readonly parserVersion: number;
  readonly normalizationPolicyVersion: number;
  readonly canonicalMetadataVersion: number;
  readonly editionId: string;
  readonly revisionId: string;
  readonly sourceArchive: SourceArchive;
  readonly artifacts: readonly ArtifactRecord[];
  readonly corpus: {
    readonly verses: number;
    readonly books: number;
    readonly superscriptions: number;
    readonly subscriptions: number;
    readonly notes: number;
  };
}

/**
 * Serializes a value with object keys in sorted order, so that two runs over
 * identical input produce identical bytes. Map and object iteration order is
 * the usual reason a "deterministic" build turns out not to be.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
  return `{${entries.join(",")}}`;
}

/**
 * What the text is.
 *
 * Derived from the source archive alone, so republishing artifacts over
 * unchanged source leaves it untouched. That is the whole point: it is what a
 * future anchor binds to.
 */
export function deriveRevisionId(archive: SourceArchive): string {
  return archive.sha256;
}

/**
 * What was published.
 *
 * Derived from the manifest rather than from the source hash, so a change to a
 * genre label or a canon ordering mints a new generation even though the text
 * is identical. Deriving it from substrate hashes alone is the bug this function
 * exists to avoid.
 *
 * The manifest carries no timestamp, because a hashed payload containing the
 * current time cannot be reproduced.
 */
export async function deriveGenerationId(manifest: GenerationManifest): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(manifest));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256(bytes: Uint8Array | string): Promise<string> {
  const input = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  const digest = await crypto.subtle.digest("SHA-256", input as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
