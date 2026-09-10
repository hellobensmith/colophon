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
 *
 * The Vulgate's own title-verse count is not always "the ASV's superscription
 * status, borrowed" — the two titling traditions diverge (see
 * GREEK_TITLE_OVERRIDES), and nine psalms genuinely split or merge content
 * inside the body, not just at the title (see the psalm-by-psalm cases in
 * irregularGreekParts). Both were verified against the Clementine Vulgate
 * text directly, 9 September 2026, after an earlier version of this table —
 * built by reasoning from the ASV alone — shipped a real bug: a coordinate
 * could resolve to a real, well-formed, wrong verse under HTTP 200.
 *
 * The Douay-Rheims prints the Vulgate's own division natively, so Greek
 * numbering onto it needs none of this — see fromGreekOntoDra.
 */

import { TITLED_PSALMS } from "./data/asv/meta.ts";
import { VERSE_COUNTS } from "./data/asv/meta.ts";
import { VERSE_COUNTS as DRA_VERSE_COUNTS } from "./data/dra/meta.ts";

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

/**
 * One contiguous run of a Greek psalm, either drawn from a Hebrew-numbered
 * psalm or a Vulgate verse this edition cannot honestly represent as one
 * of its own.
 *
 * A genuine split (one ASV verse holding what the Vulgate divides into
 * several) is representable: every Vulgate position in the split names the
 * same, complete ASV verse, since the full ASV text genuinely contains
 * everything being asked for. A genuine merge (several ASV verses folded
 * into one Vulgate verse) is not: returning either ASV verse would silently
 * omit real content, so that Vulgate position is refused outright rather
 * than guessed.
 */
type GreekPart =
  | {
      readonly kind: "content";
      /** Hebrew psalm this run comes from. */
      readonly psalm: number;
      /** English verse the run starts at. */
      readonly fromEnglishVerse: number;
      /** How many English verses the run covers, not counting the title. */
      readonly length: number;
      /** How many of this run's Vulgate verses are the superscription. */
      readonly titleLines: 0 | 1 | 2;
    }
  | {
      readonly kind: "unavailable";
      /** How many Vulgate verses this refusal covers. */
      readonly length: number;
      /** Why — always names the specific Hebrew verses being split or merged. */
      readonly reason: string;
    };

/**
 * Greek psalms whose title-verse count differs from what borrowing the
 * corresponding Hebrew psalm's own superscription status would predict.
 * Verified against the Clementine Vulgate (vulsearch.sourceforge.net's
 * source text) and cross-checked live against drbo.org and
 * bible.catholicgallery.org, 9 September 2026. Most (48) are psalms where
 * the Vulgate gives the title no separate verse at all though the Hebrew is
 * titled; four (50, 51, 53, 59 — each a long historical superscription)
 * split the title across two Vulgate verses instead of one. The nine
 * psalms with a genuine interior split or merge (see below) are handled as
 * their own irregular cases, not through this table, even where their
 * title status also needed correcting.
 */
const GREEK_TITLE_OVERRIDES: Readonly<Record<number, 0 | 1 | 2>> = {
  13: 0, 14: 0, 15: 0, 16: 0, 22: 0, 23: 0, 24: 0, 25: 0, 26: 0, 27: 0,
  28: 0, 31: 0, 34: 0, 36: 0, 49: 0, 65: 0, 72: 0, 73: 0, 77: 0, 78: 0,
  81: 0, 85: 0, 86: 0, 89: 0, 97: 0, 100: 0, 102: 0, 109: 0, 119: 0, 120: 0,
  121: 0, 122: 0, 123: 0, 124: 0, 125: 0, 126: 0, 127: 0, 128: 0, 130: 0,
  131: 0, 132: 0, 133: 0, 137: 0, 138: 0, 140: 0, 142: 0, 143: 0, 144: 0,
  50: 2, 51: 2, 53: 2, 59: 2,
};

/**
 * The Greek psalms whose contents do not line up one-to-one with the
 * Hebrew — either a whole-psalm merge/split (9, 113, 114, 115, 146, 147,
 * verified when Greek numbering first shipped) or a genuine interior
 * split/merge found by comparing this edition's own verse divisions
 * against the Clementine Vulgate directly, 9 September 2026:
 *
 * Six read and mapped verse-by-verse against the Latin text: 12 (Hebrew 13
 * splits its own verse 2, then merges verses 5-6), 52 (Hebrew 53 splits
 * verse 1, otherwise clean), 71 (Hebrew 72 merges verses 1-2), 99 (Hebrew
 * 100 — the Vulgate adds a superscription the Hebrew never had, then also
 * merges verses 1-2), 108 (Hebrew 109 merges verses 1-2), 145 (Hebrew 146 —
 * another added superscription, then merges parts of verses 1-3). One (129,
 * Hebrew 130) has a tangled middle redistributing verses 4-7 across a
 * different count; refused as a block rather than guessed at. Two (43, 55)
 * rest on sliding-window alignment (each ASV verse's distinctive vocabulary
 * matched against nearby DRA verses at the same Vulgate coordinate) rather
 * than a full manual re-reading — that method matched hand-verification
 * exactly on all six psalms it was cross-checked against, and independently
 * corroborated by a separate review's own manual reading flagging the same
 * verse ranges (Hebrew 44:21-22, Hebrew 56:11-13) by a different method.
 */
function irregularGreekParts(greekPsalm: number): readonly GreekPart[] | null {
  switch (greekPsalm) {
    case 9:
      // Greek 9 runs straight through both Hebrew 9 and Hebrew 10.
      return [
        { kind: "content", psalm: 9, fromEnglishVerse: 1, length: englishVerses(9), titleLines: hasSuperscription(9) ? 1 : 0 },
        { kind: "content", psalm: 10, fromEnglishVerse: 1, length: englishVerses(10), titleLines: hasSuperscription(10) ? 1 : 0 },
      ];
    case 12:
      return [
        { kind: "content", psalm: 13, fromEnglishVerse: 1, length: 1, titleLines: 0 },
        { kind: "content", psalm: 13, fromEnglishVerse: 2, length: 1, titleLines: 0 },
        { kind: "content", psalm: 13, fromEnglishVerse: 2, length: 1, titleLines: 0 }, // split: same verse as above
        { kind: "content", psalm: 13, fromEnglishVerse: 3, length: 1, titleLines: 0 },
        { kind: "content", psalm: 13, fromEnglishVerse: 4, length: 1, titleLines: 0 },
        {
          kind: "unavailable",
          length: 1,
          reason: "The Vulgate merges Hebrew 13:5-6 into one verse; this edition cannot address it as one Vulgate verse without omitting real content.",
        },
      ];
    case 43:
      return [
        { kind: "content", psalm: 44, fromEnglishVerse: 1, length: 20, titleLines: 1 },
        {
          kind: "unavailable",
          length: 1,
          reason: "The Vulgate merges Hebrew 44:21-22 into one verse; this edition cannot address it as one Vulgate verse without omitting real content.",
        },
        { kind: "content", psalm: 44, fromEnglishVerse: 23, length: 4, titleLines: 0 },
      ];
    case 52:
      return [
        { kind: "content", psalm: 53, fromEnglishVerse: 1, length: 1, titleLines: 0 },
        { kind: "content", psalm: 53, fromEnglishVerse: 1, length: 1, titleLines: 0 }, // split: same verse as above
        { kind: "content", psalm: 53, fromEnglishVerse: 2, length: 5, titleLines: 0 },
      ];
    case 55:
      return [
        { kind: "content", psalm: 56, fromEnglishVerse: 1, length: 10, titleLines: 1 },
        {
          kind: "unavailable",
          length: 2,
          reason: "The Vulgate compresses Hebrew 56:11-13 into two verses here; the exact boundary is not verified.",
        },
      ];
    case 71:
      return [
        { kind: "content", psalm: 72, fromEnglishVerse: 1, length: 0, titleLines: 1 },
        {
          kind: "unavailable",
          length: 1,
          reason: "The Vulgate merges Hebrew 72:1-2 into one verse; this edition cannot address it as one Vulgate verse without omitting real content.",
        },
        { kind: "content", psalm: 72, fromEnglishVerse: 3, length: 18, titleLines: 0 },
      ];
    case 99:
      return [
        {
          kind: "unavailable",
          length: 1,
          reason: "The Vulgate gives this psalm a superscription the Hebrew original never had; this edition has no text for it.",
        },
        {
          kind: "unavailable",
          length: 1,
          reason: "The Vulgate merges Hebrew 100:1-2 into one verse; this edition cannot address it as one Vulgate verse without omitting real content.",
        },
        { kind: "content", psalm: 100, fromEnglishVerse: 3, length: 3, titleLines: 0 },
      ];
    case 108:
      return [
        { kind: "content", psalm: 109, fromEnglishVerse: 1, length: 0, titleLines: 1 },
        {
          kind: "unavailable",
          length: 1,
          reason: "The Vulgate merges Hebrew 109:1-2 into one verse; this edition cannot address it as one Vulgate verse without omitting real content.",
        },
        { kind: "content", psalm: 109, fromEnglishVerse: 3, length: 29, titleLines: 0 },
      ];
    case 113:
      return [
        { kind: "content", psalm: 114, fromEnglishVerse: 1, length: englishVerses(114), titleLines: hasSuperscription(114) ? 1 : 0 },
        { kind: "content", psalm: 115, fromEnglishVerse: 1, length: englishVerses(115), titleLines: hasSuperscription(115) ? 1 : 0 },
      ];
    case 114:
      return [{ kind: "content", psalm: 116, fromEnglishVerse: 1, length: 9, titleLines: hasSuperscription(116) ? 1 : 0 }];
    case 115:
      return [{ kind: "content", psalm: 116, fromEnglishVerse: 10, length: englishVerses(116) - 9, titleLines: 0 }];
    case 129:
      return [
        { kind: "content", psalm: 130, fromEnglishVerse: 1, length: 3, titleLines: 0 },
        {
          kind: "unavailable",
          length: 4,
          reason: "The Vulgate redistributes Hebrew 130:4-7 across a different verse count here; the exact boundary is not verified.",
        },
        { kind: "content", psalm: 130, fromEnglishVerse: 8, length: 1, titleLines: 0 },
      ];
    case 145:
      return [
        {
          kind: "unavailable",
          length: 1,
          reason: "The Vulgate gives this psalm a superscription the Hebrew original never had; this edition has no text for it.",
        },
        {
          kind: "unavailable",
          length: 1,
          reason: "The Vulgate merges parts of Hebrew 146:1-3 into one verse; this edition cannot address it as one Vulgate verse without omitting real content.",
        },
        { kind: "content", psalm: 146, fromEnglishVerse: 3, length: 8, titleLines: 0 },
      ];
    case 146:
      return [{ kind: "content", psalm: 147, fromEnglishVerse: 1, length: 11, titleLines: hasSuperscription(147) ? 1 : 0 }];
    case 147:
      return [{ kind: "content", psalm: 147, fromEnglishVerse: 12, length: englishVerses(147) - 11, titleLines: 0 }];
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
      kind: "content",
      psalm,
      fromEnglishVerse: 1,
      length: englishVerses(psalm),
      titleLines: GREEK_TITLE_OVERRIDES[greekPsalm] ?? (hasSuperscription(psalm) ? 1 : 0),
    },
  ];
}

function greekVerseCountOntoAsv(greekPsalm: number): number {
  return greekParts(greekPsalm).reduce(
    (total, part) => total + part.length + (part.kind === "content" ? part.titleLines : 0),
    0,
  );
}

function fromGreekOntoAsv(greekPsalm: number, greekVerse: number): PsalmPosition {
  const total = greekVerseCountOntoAsv(greekPsalm);
  if (greekVerse < 1 || greekVerse > total) {
    throw new PsalmNumberingError(
      `Psalm ${greekPsalm} only has ${total} verses in this edition's Greek numbering`,
    );
  }

  let remaining = greekVerse;
  for (const part of greekParts(greekPsalm)) {
    if (part.kind === "unavailable") {
      if (remaining > part.length) {
        remaining -= part.length;
        continue;
      }
      throw new PsalmNumberingError(part.reason);
    }
    const span = part.length + part.titleLines;
    if (remaining > span) {
      remaining -= span;
      continue;
    }
    if (remaining <= part.titleLines) return { kind: "title", psalm: part.psalm };
    const offset = remaining - part.titleLines;
    return { kind: "verse", psalm: part.psalm, verse: part.fromEnglishVerse + offset - 1 };
  }
  // greekVerse was bounds-checked above, so the loop always returns.
  throw new PsalmNumberingError(`Psalm ${greekPsalm}:${greekVerse} could not be resolved`);
}

/**
 * The DRA already prints the Vulgate's own division — confirmed against it
 * directly, 9 September 2026: 145 of 150 psalms match the Clementine
 * Vulgate's per-chapter verse counts exactly. The five that don't (15, 19,
 * 42, 125, 135) are a minor, real edition variance, not a bug — the same
 * principle `dataAvailabilityOf` uses: an edition's own numbers are the
 * authority for what it prints, not an external reconstruction forced onto
 * it. So Greek numbering onto the DRA is a bounds check against its own
 * verse counts, not a conversion, and it never returns a title position —
 * the DRA has no separate title bucket at all.
 */
function fromGreekOntoDra(greekPsalm: number, greekVerse: number): PsalmPosition {
  const total = DRA_VERSE_COUNTS["PSA"]?.[greekPsalm - 1] ?? 0;
  if (greekVerse < 1 || greekVerse > total) {
    throw new PsalmNumberingError(
      `Psalm ${greekPsalm} only has ${total} verses in this edition's Greek numbering`,
    );
  }
  return { kind: "verse", psalm: greekPsalm, verse: greekVerse };
}

/** Verses a Greek-numbered psalm contains, counting superscriptions. */
export function greekVerseCount(greekPsalm: number, translation: string): number {
  if (translation === "dra") return DRA_VERSE_COUNTS["PSA"]?.[greekPsalm - 1] ?? 0;
  if (translation !== "asv") {
    throw new PsalmNumberingError(`Greek numbering is not implemented for translation "${translation}"`);
  }
  return greekVerseCountOntoAsv(greekPsalm);
}

/**
 * Greek (Septuagint/Vulgate) psalm and verse to its position in the named
 * edition's own text. A Greek psalm may span two Hebrew psalms in the ASV,
 * so the answer names its own psalm; onto the DRA it is identity, since the
 * DRA already prints this division.
 */
export function fromGreek(greekPsalm: number, greekVerse: number, translation: string): PsalmPosition {
  if (!Number.isInteger(greekPsalm) || greekPsalm < 1 || greekPsalm > 150) {
    throw new PsalmNumberingError(`There is no Psalm ${greekPsalm} in Greek numbering`);
  }
  if (translation === "dra") return fromGreekOntoDra(greekPsalm, greekVerse);
  if (translation !== "asv") {
    throw new PsalmNumberingError(`Greek numbering is not implemented for translation "${translation}"`);
  }
  return fromGreekOntoAsv(greekPsalm, greekVerse);
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
