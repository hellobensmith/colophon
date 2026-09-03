/**
 * Hebrew and Greek numbering of the Psalter.
 *
 * The ASV numbers the Psalms as the Masoretic text does. Catholic and Orthodox
 * sources, following the Septuagint and Vulgate, number them differently — so
 * "Psalm 50" in a patristic or liturgical citation is the Miserere, which this
 * translation prints as Psalm 51. The divergence is not a single offset:
 *
 *   Greek 1-8      = Hebrew 1-8            (identical)
 *   Greek 9        = Hebrew 9 + 10         (one psalm in Greek)
 *   Greek 10-112   = Hebrew 11-113         (offset by one)
 *   Greek 113      = Hebrew 114 + 115      (one psalm in Greek)
 *   Greek 114      = Hebrew 116:1-9        (Hebrew 116 splits in two)
 *   Greek 115      = Hebrew 116:10-19
 *   Greek 116-145  = Hebrew 117-146        (offset by one)
 *   Greek 146      = Hebrew 147:1-11       (Hebrew 147 splits in two)
 *   Greek 147      = Hebrew 147:12-20
 *   Greek 148-150  = Hebrew 148-150        (identical again)
 *
 * Both Hebrew and Greek count a psalm's superscription as verse 1, while
 * English Bibles print it unnumbered above the text. Every conversion here
 * therefore has two parts: which psalm, and where the verses sit inside it.
 */

import { TITLED_PSALMS } from "./data/meta.ts";
import { VERSE_COUNTS } from "./data/meta.ts";

const TITLED: ReadonlySet<number> = new Set(TITLED_PSALMS);

/** English verse count of a Hebrew-numbered psalm. */
function englishVerses(psalm: number): number {
  return VERSE_COUNTS["PSA"]?.[psalm - 1] ?? 0;
}

/** Whether a Hebrew-numbered psalm carries a superscription. */
export function hasSuperscription(psalm: number): boolean {
  return TITLED.has(psalm);
}

/** Verses a psalm has when its superscription is counted, as Hebrew does. */
export function numberedVerses(psalm: number): number {
  return englishVerses(psalm) + (hasSuperscription(psalm) ? 1 : 0);
}

/** A resolved position: either a psalm's superscription, or one of its verses. */
export type PsalmPosition =
  | { readonly kind: "title"; readonly psalm: number }
  | { readonly kind: "verse"; readonly psalm: number; readonly verse: number };

export class PsalmNumberingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PsalmNumberingError";
  }
}

/**
 * Hebrew (Masoretic) verse number to its position in the ASV's English text.
 * The psalm number is unchanged; only the superscription shifts the verses.
 */
export function fromHebrew(psalm: number, verse: number): PsalmPosition {
  const total = numberedVerses(psalm);
  if (verse < 1 || verse > total) {
    throw new PsalmNumberingError(
      `Psalm ${psalm} only has ${total} verses in Hebrew numbering`,
    );
  }
  if (hasSuperscription(psalm)) {
    return verse === 1
      ? { kind: "title", psalm }
      : { kind: "verse", psalm, verse: verse - 1 };
  }
  return { kind: "verse", psalm, verse };
}

/** One contiguous run of a Greek psalm drawn from a Hebrew-numbered psalm. */
interface GreekPart {
  /** Hebrew psalm this run comes from. */
  readonly psalm: number;
  /** English verse the run starts at. */
  readonly fromEnglishVerse: number;
  /** How many English verses the run covers. */
  readonly length: number;
  /** Whether the run opens with that psalm's superscription. */
  readonly includesTitle: boolean;
}

/** The Greek psalms whose contents do not line up one-to-one with the Hebrew. */
function irregularGreekParts(greekPsalm: number): readonly GreekPart[] | null {
  switch (greekPsalm) {
    case 9:
      // Greek 9 runs straight through both Hebrew 9 and Hebrew 10.
      return [
        { psalm: 9, fromEnglishVerse: 1, length: englishVerses(9), includesTitle: hasSuperscription(9) },
        { psalm: 10, fromEnglishVerse: 1, length: englishVerses(10), includesTitle: hasSuperscription(10) },
      ];
    case 113:
      return [
        { psalm: 114, fromEnglishVerse: 1, length: englishVerses(114), includesTitle: hasSuperscription(114) },
        { psalm: 115, fromEnglishVerse: 1, length: englishVerses(115), includesTitle: hasSuperscription(115) },
      ];
    case 114:
      return [{ psalm: 116, fromEnglishVerse: 1, length: 9, includesTitle: hasSuperscription(116) }];
    case 115:
      return [{ psalm: 116, fromEnglishVerse: 10, length: englishVerses(116) - 9, includesTitle: false }];
    case 146:
      return [{ psalm: 147, fromEnglishVerse: 1, length: 11, includesTitle: hasSuperscription(147) }];
    case 147:
      return [{ psalm: 147, fromEnglishVerse: 12, length: englishVerses(147) - 11, includesTitle: false }];
    default:
      return null;
  }
}

/** The Hebrew psalm a regularly-numbered Greek psalm corresponds to. */
function regularHebrewPsalm(greekPsalm: number): number {
  if (greekPsalm >= 1 && greekPsalm <= 8) return greekPsalm;
  if (greekPsalm >= 10 && greekPsalm <= 112) return greekPsalm + 1;
  if (greekPsalm >= 116 && greekPsalm <= 145) return greekPsalm + 1;
  if (greekPsalm >= 148 && greekPsalm <= 150) return greekPsalm;
  throw new PsalmNumberingError(`There is no Psalm ${greekPsalm} in Greek numbering`);
}

function greekParts(greekPsalm: number): readonly GreekPart[] {
  const irregular = irregularGreekParts(greekPsalm);
  if (irregular !== null) return irregular;
  const psalm = regularHebrewPsalm(greekPsalm);
  return [
    {
      psalm,
      fromEnglishVerse: 1,
      length: englishVerses(psalm),
      includesTitle: hasSuperscription(psalm),
    },
  ];
}

/** Verses a Greek-numbered psalm contains, counting superscriptions. */
export function greekVerseCount(greekPsalm: number): number {
  return greekParts(greekPsalm).reduce(
    (total, part) => total + part.length + (part.includesTitle ? 1 : 0),
    0,
  );
}

/**
 * Greek (Septuagint) psalm and verse to its position in the ASV's English text.
 * A Greek psalm may span two Hebrew psalms, so the answer names its own psalm.
 */
export function fromGreek(greekPsalm: number, greekVerse: number): PsalmPosition {
  if (!Number.isInteger(greekPsalm) || greekPsalm < 1 || greekPsalm > 150) {
    throw new PsalmNumberingError(`There is no Psalm ${greekPsalm} in Greek numbering`);
  }
  const total = greekVerseCount(greekPsalm);
  if (greekVerse < 1 || greekVerse > total) {
    throw new PsalmNumberingError(
      `Psalm ${greekPsalm} only has ${total} verses in Greek numbering`,
    );
  }

  let remaining = greekVerse;
  for (const part of greekParts(greekPsalm)) {
    const span = part.length + (part.includesTitle ? 1 : 0);
    if (remaining > span) {
      remaining -= span;
      continue;
    }
    if (part.includesTitle && remaining === 1) return { kind: "title", psalm: part.psalm };
    const offset = remaining - (part.includesTitle ? 1 : 0);
    return { kind: "verse", psalm: part.psalm, verse: part.fromEnglishVerse + offset - 1 };
  }
  // greekVerse was bounds-checked above, so the loop always returns.
  throw new PsalmNumberingError(`Psalm ${greekPsalm}:${greekVerse} could not be resolved`);
}

/** The Greek psalm number covering a Hebrew-numbered psalm, for display. */
export function hebrewToGreekPsalm(hebrewPsalm: number): number {
  if (hebrewPsalm >= 1 && hebrewPsalm <= 8) return hebrewPsalm;
  if (hebrewPsalm === 9 || hebrewPsalm === 10) return 9;
  if (hebrewPsalm >= 11 && hebrewPsalm <= 113) return hebrewPsalm - 1;
  if (hebrewPsalm === 114 || hebrewPsalm === 115) return 113;
  if (hebrewPsalm === 116) return 114;
  if (hebrewPsalm >= 117 && hebrewPsalm <= 146) return hebrewPsalm - 1;
  if (hebrewPsalm === 147) return 146;
  return hebrewPsalm;
}
