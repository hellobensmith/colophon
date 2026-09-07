/**
 * The registry of translations this deployment serves.
 *
 * Colophon's whole premise is that a publisher runs this themselves with their
 * own text, so "which translation" has to be a first-class parameter rather
 * than a constant compiled into the endpoints. This module is the seam: adding
 * an edition means registering it here, not editing `src/index.ts`.
 *
 * Two things are deliberately kept apart, because conflating them is the
 * mistake this project exists to avoid:
 *
 * - **Descriptive metadata** — name, language, licence, year, and where the
 *   bytes came from. This travels with every response so a caller learns its
 *   obligations from the API rather than from prose it may never read.
 * - **Versification** — how many chapters a book has and how many verses each
 *   chapter has. That belongs to the edition, not to the canon, and it is *not*
 *   shared: 32 of the 66 books the ASV and the Douay-Rheims have in common
 *   disagree about it, Esther and Daniel by whole chapters. Verse coordinates
 *   are therefore only meaningful paired with a translation.
 *
 * Versification is not held here yet — the ASV's tables still live in
 * `src/data/meta.ts` and are reached through `src/parser.ts`. That move is the
 * next step, and it is why {@link TranslationMeta} carries no verse counts:
 * a half-migrated registry that carried them for one translation and not the
 * other would be worse than one that carries them for neither.
 */

export const DEFAULT_TRANSLATION = "asv";

export interface TranslationSource {
  readonly name: string;
  readonly url: string;
  readonly format: string;
}

export interface TranslationMeta {
  readonly id: string;
  readonly name: string;
  readonly language: string;
  readonly license: string;
  readonly year: number;
}

export interface Translation {
  readonly meta: TranslationMeta;
  readonly source: TranslationSource;
  /**
   * The edition's own printing order, as {@link import("./canon.ts").EditionId}.
   * Kept distinct from a tradition's canon order — see `src/canon.ts`.
   */
  readonly editionId: string;
}

const ASV: Translation = {
  meta: {
    id: "asv",
    name: "American Standard Version",
    language: "en",
    license: "Public Domain",
    year: 1901,
  },
  source: {
    name: "eBible.org",
    url: "https://ebible.org/Scriptures/eng-asv_usfx.zip",
    format: "USFX",
  },
  editionId: "asv",
};

/**
 * Registered in the order they should be offered. The ASV is first because it
 * is the default, not because it is privileged.
 */
export const TRANSLATIONS: ReadonlyMap<string, Translation> = new Map([[ASV.meta.id, ASV]]);

export const TRANSLATION_IDS: readonly string[] = [...TRANSLATIONS.keys()];

export function isTranslation(value: string): boolean {
  return TRANSLATIONS.has(value);
}

/**
 * Resolves a `?translation=` value, or throws a message naming what is on offer.
 *
 * Unknown ids are refused rather than silently served as the default: a caller
 * asking for a text this deployment does not hold must be told so, not handed a
 * different Bible. That is the same failure the conformance suite records
 * against other APIs, where a bad reference returns a plausible wrong verse
 * under HTTP 200.
 */
export function resolveTranslation(value: string | undefined): Translation {
  const id = value ?? DEFAULT_TRANSLATION;
  const translation = TRANSLATIONS.get(id);
  if (translation === undefined) {
    throw new UnknownTranslationError(id);
  }
  return translation;
}

export class UnknownTranslationError extends Error {
  constructor(readonly requested: string) {
    super(
      `Unknown translation "${requested}". This deployment serves: ${TRANSLATION_IDS.join(", ")}.`,
    );
    this.name = "UnknownTranslationError";
  }
}
