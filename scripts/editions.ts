/**
 * What the build needs to know about an edition, as distinct from what the API
 * needs to know about it.
 *
 * `src/translations.ts` is the runtime registry: names, licence, versification,
 * the things a response carries. None of that helps you fetch and ingest a
 * source archive, and the archive details help nobody at request time. Keeping
 * them apart is also what stops eBible URLs and unzip member names from being
 * bundled into the Worker.
 *
 * Adding an edition here plus an expectation set in `src/expectations/` is what
 * makes `bun run build:data --translation <id>` work for it.
 */

import type { EditionId } from "../src/canon.ts";
import type { CorpusExpectations } from "../src/validate.ts";
import { ASV } from "../src/expectations/asv.ts";
import { DRA } from "../src/expectations/dra.ts";

export interface BuildEdition {
  /** Registry id, and the directory the artifacts are written to. */
  readonly id: EditionId;
  /**
   * eBible's own identifier for the archive. Emitted as `EDITION_ID` and folded
   * into the generation manifest, so it is a published fact rather than an
   * implementation detail.
   *
   * Their naming is not consistent — `eng-asv` against `engDRA` — so this is
   * recorded, never derived from {@link id}.
   */
  readonly sourceId: string;
  /**
   * What this edition must contain for the build to emit anything.
   *
   * Absent until the edition has been measured once. A text cannot be
   * characterised before it has been read, and inventing the numbers would
   * defeat the gate — so an edition without a set can be reported on
   * (`--report`) but not published.
   */
  readonly expectations?: CorpusExpectations;
}

const EDITIONS: readonly BuildEdition[] = [
  {
    id: "asv",
    sourceId: "eng-asv",
    expectations: ASV,
  },
  {
    id: "dra",
    sourceId: "engDRA",
    expectations: DRA,
  },
];

export const BUILD_EDITIONS: ReadonlyMap<string, BuildEdition> = new Map(
  EDITIONS.map((edition) => [edition.id, edition]),
);

/** eBible publishes every USFX archive under the same shape. */
export function archiveUrl(edition: BuildEdition): string {
  return `https://ebible.org/Scriptures/${edition.sourceId}_usfx.zip`;
}

export function archiveMember(edition: BuildEdition): string {
  return `${edition.sourceId}_usfx.xml`;
}

/**
 * Resolves `--translation <id>`, refusing an unknown one by name rather than
 * quietly building the default. Silently ingesting the wrong text over a
 * corpus that is already published would be the worst failure this script has.
 */
export function resolveEdition(id: string | undefined): BuildEdition {
  const wanted = id ?? "asv";
  const edition = BUILD_EDITIONS.get(wanted);
  if (edition === undefined) {
    throw new Error(
      `Unknown translation "${wanted}". This build can produce: ` +
        `${[...BUILD_EDITIONS.keys()].join(", ")}. An edition needs an entry ` +
        `in scripts/editions.ts and an expectation set in src/expectations/.`,
    );
  }
  return edition;
}
